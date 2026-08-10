// js/perf-monitor.js
// Lightweight, dependency-free performance + Core Web Vitals telemetry.
//
// Implements the window.perfMonitor contract already called (previously as
// silent no-ops) by play-images.js, play-clips.js, and
// script-quiz-foundation.js: `.record(name, ms, meta)` and
// `.measure(name, fn, meta)`. Also captures LCP, INP, CLS, FCP, and TTFB via
// native PerformanceObserver. In-app only — console/report surface behind
// `?perf`, no network beacon (a sampled same-origin beacon is a later step).
(function () {
  "use strict";

  var VITAL_TARGETS = { LCP: 2500, INP: 200, CLS: 0.1, FCP: 1800, TTFB: 800 };
  var MAX_RECORDS = 400;
  var records = []; // { name, ms, meta, at }
  var vitals = {}; // name -> { value, rating, at }

  function nowMs() {
    return typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  }

  // Web Vitals rating thresholds (good / needs-improvement boundaries).
  function rate(name, value) {
    switch (name) {
      case "LCP":
        return value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor";
      case "INP":
        return value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor";
      case "CLS":
        return value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor";
      case "FCP":
        return value <= 1800 ? "good" : value <= 3000 ? "needs-improvement" : "poor";
      case "TTFB":
        return value <= 800 ? "good" : value <= 1800 ? "needs-improvement" : "poor";
      default:
        return "";
    }
  }

  function record(name, ms, meta) {
    if (!name || typeof ms !== "number" || !isFinite(ms)) return null;
    var entry = {
      name: String(name),
      ms: Math.round(ms * 100) / 100,
      meta: meta || {},
      at: Date.now(),
    };
    records.push(entry);
    if (records.length > MAX_RECORDS) records.shift();
    return entry;
  }

  // Times a function; supports sync results and thenables (async fns) without
  // forcing callers to await. Records duration even when the function throws.
  function measure(name, fn, meta) {
    var start = nowMs();
    var result;
    try {
      result = typeof fn === "function" ? fn() : undefined;
    } catch (err) {
      record(name, nowMs() - start, assign({ error: true }, meta));
      throw err;
    }
    if (result && typeof result.then === "function") {
      return result.then(
        function (value) {
          record(name, nowMs() - start, meta);
          return value;
        },
        function (err) {
          record(name, nowMs() - start, assign({ error: true }, meta));
          throw err;
        },
      );
    }
    record(name, nowMs() - start, meta);
    return result;
  }

  function assign(target, source) {
    if (source) {
      for (var k in source) {
        if (Object.prototype.hasOwnProperty.call(source, k)) target[k] = source[k];
      }
    }
    return target;
  }

  function setVital(name, value, meta) {
    vitals[name] = {
      value: Math.round(value * 100) / 100,
      rating: rate(name, value),
      at: Date.now(),
    };
    if (meta) vitals[name].meta = meta;
    record("vital:" + name, value, { rating: vitals[name].rating });
  }

  function safeObserve(type, cb, opts) {
    try {
      var po = new PerformanceObserver(cb);
      po.observe(assign({ type: type, buffered: true }, opts));
      return po;
    } catch (e) {
      // Entry type unsupported in this browser; skip silently.
      return null;
    }
  }

  // ── Core Web Vitals via native PerformanceObserver ─────────────────────────
  function observeVitals() {
    if (typeof PerformanceObserver !== "function") return;

    try {
      var nav =
        performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      if (nav && nav.responseStart) setVital("TTFB", nav.responseStart);
    } catch (e) {
      /* navigation timing unavailable */
    }

    safeObserve("paint", function (list) {
      list.getEntries().forEach(function (e) {
        if (e.name === "first-contentful-paint") setVital("FCP", e.startTime);
      });
    });

    // LCP: keep the latest candidate (browser finalizes on user interaction).
    var lcp = 0;
    safeObserve("largest-contentful-paint", function (list) {
      var entries = list.getEntries();
      var last = entries[entries.length - 1];
      if (last) {
        lcp = last.renderTime || last.loadTime || last.startTime || lcp;
        setVital("LCP", lcp);
      }
    });

    // CLS: session-windowed sum of layout shifts without recent user input.
    var clsValue = 0;
    var sessionValue = 0;
    var sessionEntries = [];
    safeObserve("layout-shift", function (list) {
      list.getEntries().forEach(function (e) {
        if (e.hadRecentInput) return;
        var first = sessionEntries[0];
        var last = sessionEntries[sessionEntries.length - 1];
        if (
          sessionEntries.length &&
          (e.startTime - last.startTime > 1000 || e.startTime - first.startTime > 5000)
        ) {
          sessionValue = 0;
          sessionEntries = [];
        }
        sessionEntries.push(e);
        sessionValue += e.value;
        if (sessionValue > clsValue) {
          clsValue = sessionValue;
          setVital("CLS", clsValue);
        }
      });
    });

    // INP proxy: worst interaction latency from event-timing durations.
    var inp = 0;
    safeObserve(
      "event",
      function (list) {
        list.getEntries().forEach(function (e) {
          if (typeof e.duration === "number" && e.duration > inp) {
            inp = e.duration;
            setVital("INP", inp);
          }
        });
      },
      { durationThreshold: 40 },
    );
  }

  // ── Sampled field-data beacon (POST /api/telemetry) ───────────────────
  var BEACON_URL = "/api/telemetry";
  var SAMPLE_RATE = 1; // 100% while the roster is small; lower as traffic grows.
  var MAX_BEACONS = 3; // cap sends per page session
  var beaconsSent = 0;
  var sampledIn = Math.random() < SAMPLE_RATE;

  function deviceKind() {
    try {
      var w = (typeof window !== "undefined" && window.innerWidth) || 0;
      if (w && w < 600) return "phone";
      if (w && w < 1024) return "tablet";
      return "desktop";
    } catch (e) {
      return null;
    }
  }

  function connectionKind() {
    try {
      var c = navigator.connection || navigator.webkitConnection;
      return c && c.effectiveType ? String(c.effectiveType) : null;
    } catch (e) {
      return null;
    }
  }

  function navigationType() {
    try {
      var nav =
        performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      return nav && nav.type ? String(nav.type) : null;
    } catch (e) {
      return null;
    }
  }

  function currentTab() {
    try {
      return typeof window.currentActiveTab === "string" ? window.currentActiveTab : null;
    } catch (e) {
      return null;
    }
  }

  function hasAnyVital() {
    return !!(vitals.LCP || vitals.INP || vitals.CLS || vitals.FCP || vitals.TTFB);
  }

  function buildBeaconPayload() {
    var out = {
      tab: currentTab(),
      device: deviceKind(),
      connection: connectionKind(),
      navType: navigationType(),
    };
    ["LCP", "INP", "CLS", "FCP", "TTFB"].forEach(function (k) {
      if (vitals[k]) out[k.toLowerCase()] = vitals[k].value;
    });
    if (vitals.LCP) out.lcpRating = vitals.LCP.rating;
    if (vitals.INP) out.inpRating = vitals.INP.rating;
    if (vitals.CLS) out.clsRating = vitals.CLS.rating;
    return out;
  }

  // Uses sendBeacon (survives page unload); falls back to fetch keepalive.
  function sendVitalsBeacon(force) {
    if (!force && (!sampledIn || beaconsSent >= MAX_BEACONS)) return false;
    if (!hasAnyVital()) return false;
    var payload;
    try {
      payload = JSON.stringify(buildBeaconPayload());
    } catch (e) {
      return false;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        var blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon(BEACON_URL, blob)) {
          beaconsSent += 1;
          return true;
        }
      }
    } catch (e) {
      /* fall through to fetch */
    }
    try {
      fetch(BEACON_URL, {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        credentials: "same-origin",
      });
      beaconsSent += 1;
      return true;
    } catch (e) {
      return false;
    }
  }

  function summary() {
    return { vitals: vitals, targets: VITAL_TARGETS, recordCount: records.length };
  }

  function report() {
    try {
      var rows = Object.keys(vitals).map(function (k) {
        return {
          metric: k,
          value: vitals[k].value,
          rating: vitals[k].rating,
          target: VITAL_TARGETS[k],
        };
      });
      if (console.table) console.table(rows);
      else console.log("[perf] vitals", vitals);
      var slow = records
        .slice()
        .sort(function (a, b) {
          return b.ms - a.ms;
        })
        .slice(0, 15)
        .map(function (r) {
          return { op: r.name, ms: r.ms };
        });
      if (console.table) console.table(slow);
      else console.log("[perf] slowest", slow);
    } catch (e) {
      console.log("[perf] report failed", e);
    }
    return summary();
  }

  var perfMonitor = {
    record: record,
    measure: measure,
    mark: function (name, meta) {
      return record(name, 0, meta);
    },
    vital: function (name) {
      return vitals[name] || null;
    },
    vitals: function () {
      return vitals;
    },
    records: function () {
      return records.slice();
    },
    flush: function () {
      return sendVitalsBeacon(true);
    },
    summary: summary,
    report: report,
  };

  if (typeof window !== "undefined") {
    window.perfMonitor = perfMonitor;
    observeVitals();
    var finalize = function () {
      try {
        record("vitals:final", 0, summary().vitals);
        sendVitalsBeacon(false);
      } catch (e) {
        /* nothing to finalize */
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") finalize();
      });
    }
    window.addEventListener("pagehide", finalize);
    try {
      if (typeof location !== "undefined" && /[?&]perf\b/.test(location.search)) {
        window.addEventListener("load", function () {
          setTimeout(report, 1500);
        });
      }
    } catch (e) {
      /* location unavailable */
    }
  }
})();
