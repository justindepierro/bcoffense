import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const [perf, indexHtml, sw] = await Promise.all([
  read("js/perf-monitor.js"),
  read("index.html"),
  read("sw.js"),
]);

// The window.perfMonitor contract already called by play-images.js,
// play-clips.js, and script-quiz-foundation.js.
assert.match(perf, /window\.perfMonitor\s*=\s*perfMonitor/, "exposes window.perfMonitor");
assert.match(perf, /record:\s*record/, "perfMonitor exposes record()");
assert.match(perf, /measure:\s*measure/, "perfMonitor exposes measure()");
assert.match(perf, /function record\(name, ms, meta\)/, "record signature is (name, ms, meta)");
assert.match(perf, /function measure\(name, fn, meta\)/, "measure signature is (name, fn, meta)");
assert.match(perf, /typeof result\.then === "function"/, "measure supports async/thenable results");

// Core Web Vitals via native PerformanceObserver (no npm web-vitals dependency).
assert.match(perf, /new PerformanceObserver\(/, "uses native PerformanceObserver");
assert.match(perf, /largest-contentful-paint/, "observes LCP");
assert.match(perf, /layout-shift/, "observes CLS");
assert.match(perf, /safeObserve\(\s*\n?\s*"event"/, "observes INP via event timing");
assert.match(perf, /first-contentful-paint/, "observes FCP");
assert.match(perf, /hadRecentInput/, "CLS ignores shifts with recent user input");
assert.doesNotMatch(perf, /^\s*import\s|require\(/m, "stays dependency-free (no modules/require)");

// Registered in the shell and precached.
assert.match(indexHtml, /<script defer src="js\/perf-monitor\.js\?v=\d+"><\/script>/, "registered in index.html");
assert.match(sw, /"\.\/js\/perf-monitor\.js"/, "precached in sw.js LOCAL_ASSETS");

// Sampled field-data beacon.
assert.match(perf, /navigator\.sendBeacon\(/, "beacon uses navigator.sendBeacon");
assert.match(perf, /"\/api\/telemetry"/, "beacon posts to /api/telemetry");
assert.match(perf, /flush:\s*function/, "exposes flush() to force-send a beacon");
assert.match(perf, /keepalive:\s*true/, "fetch fallback uses keepalive for unload");
assert.match(perf, /var sampledIn = Math\.random\(\) < SAMPLE_RATE/, "beacon is client-sampled");

console.log("perf-monitor contract: window.perfMonitor + Core Web Vitals observers verified");
