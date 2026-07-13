// Startup diagnostics and boot timeline instrumentation.

const appDiagnostics = (() => {
  const events = [];
  const MAX_EVENTS = 180;

  function nowMs() {
    return typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  }

  function enabled() {
    try {
      return (
        localStorage.getItem("bcoDiagnostics") === "1" ||
        localStorage.getItem("bcoPerf") === "1" ||
        new URLSearchParams(window.location.search).has("diag") ||
        new URLSearchParams(window.location.search).has("perf")
      );
    } catch (_e) {
      return false;
    }
  }

  function mark(name, meta = {}) {
    const event = {
      name,
      at: new Date().toISOString(),
      elapsedMs: Math.round(nowMs()),
      ...meta,
    };
    events.push(event);
    if (events.length > MAX_EVENTS) events.shift();
    if (enabled()) console.debug("[diag]", name, meta);
    return event;
  }

  function measure(name, fn, meta = {}) {
    const startedAt = nowMs();
    mark(`${name}:start`, meta);
    try {
      const result = fn();
      if (result && typeof result.then === "function") {
        return result
          .then((value) => {
            mark(`${name}:done`, {
              ...meta,
              durationMs: Math.round((nowMs() - startedAt) * 100) / 100,
            });
            return value;
          })
          .catch((err) => {
            mark(`${name}:error`, {
              ...meta,
              durationMs: Math.round((nowMs() - startedAt) * 100) / 100,
              message: err?.message || String(err),
            });
            throw err;
          });
      }
      mark(`${name}:done`, {
        ...meta,
        durationMs: Math.round((nowMs() - startedAt) * 100) / 100,
      });
      return result;
    } catch (err) {
      mark(`${name}:error`, {
        ...meta,
        durationMs: Math.round((nowMs() - startedAt) * 100) / 100,
        message: err?.message || String(err),
      });
      throw err;
    }
  }

  function getEvents() {
    return [...events];
  }

  function clear() {
    events.length = 0;
  }

  function report() {
    const rows = getEvents();
    console.table(rows);
    return rows;
  }

  return {
    get enabled() {
      return enabled();
    },
    mark,
    measure,
    getEvents,
    clear,
    report,
  };
})();

if (typeof window !== "undefined") {
  window.appDiagnostics = appDiagnostics;
  window.bcDebugStartup = () => appDiagnostics.report();
}
