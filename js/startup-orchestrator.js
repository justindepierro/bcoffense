// Startup orchestration: one queue for boot-adjacent sync, update, and media work.

const appStartup = (() => {
  const DEFAULT_STABILIZE_MS = 1600;
  const tasks = [];
  const completed = [];
  const failed = [];
  let firstPaintReleased = false;
  let postStartupStarted = false;
  let running = false;
  let drainTimer = 0;
  let criticalDepth = 0;
  let cloudSuppressUntil = Number.POSITIVE_INFINITY;

  function _startupNow() {
    return typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  }

  function _startupMark(name, meta = {}) {
    if (typeof appDiagnostics !== "undefined" && appDiagnostics?.mark) {
      appDiagnostics.mark(`startup-orchestrator:${name}`, meta);
    }
  }

  function _startupSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms || 0)));
  }

  function beginCritical(label = "critical", opts = {}) {
    criticalDepth += 1;
    if (opts.suppressCloudAutoPush !== false) {
      cloudSuppressUntil = Number.POSITIVE_INFINITY;
    }
    _startupMark("critical:start", { label, criticalDepth });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      criticalDepth = Math.max(0, criticalDepth - 1);
      if (criticalDepth === 0 && firstPaintReleased) {
        cloudSuppressUntil = Math.max(cloudSuppressUntil, _startupNow() + DEFAULT_STABILIZE_MS);
      }
      _startupMark("critical:done", { label, criticalDepth });
    };
  }

  async function runCritical(label, callback, opts = {}) {
    const done = beginCritical(label, opts);
    try {
      return await callback();
    } finally {
      done();
    }
  }

  function shouldSuppressCloudAutoPush(key = "", reason = "") {
    const suppress =
      criticalDepth > 0 ||
      !firstPaintReleased ||
      _startupNow() < cloudSuppressUntil;
    if (suppress) {
      _startupMark("cloud-autopush:suppressed", {
        key,
        reason,
        criticalDepth,
        firstPaintReleased,
      });
    }
    return suppress;
  }

  function _startupScheduleDrain(delay = 0) {
    if (!firstPaintReleased || running) return;
    if (drainTimer) clearTimeout(drainTimer);
    drainTimer = setTimeout(() => {
      drainTimer = 0;
      drainPostStartupTasks();
    }, Math.max(0, delay));
  }

  function queueTask(name, callback, opts = {}) {
    if (!name || typeof callback !== "function") return false;
    const duplicate = !opts.allowDuplicate && tasks.some((task) => task.name === name);
    if (duplicate) return false;
    tasks.push({
      name,
      callback,
      delay: Math.max(0, Number(opts.delay || 0)),
      priority: Number(opts.priority || 50),
      runWhen: typeof opts.runWhen === "function" ? opts.runWhen : null,
    });
    _startupMark("task:queued", { name, count: tasks.length });
    if (firstPaintReleased) _startupScheduleDrain(opts.startDelay || 0);
    return true;
  }

  async function drainPostStartupTasks() {
    if (!firstPaintReleased || running) return;
    running = true;
    postStartupStarted = true;
    if (!Number.isFinite(cloudSuppressUntil)) {
      cloudSuppressUntil = _startupNow() + DEFAULT_STABILIZE_MS;
    }
    _startupMark("post-startup:start", { count: tasks.length });

    try {
      while (tasks.length) {
        tasks.sort((a, b) => a.priority - b.priority || a.delay - b.delay);
        const task = tasks.shift();
        if (task.runWhen && !task.runWhen()) {
          _startupMark("task:skipped", { name: task.name });
          continue;
        }
        if (task.delay) await _startupSleep(task.delay);
        try {
          const run = () => task.callback();
          if (typeof appDiagnostics !== "undefined" && appDiagnostics?.measure) {
            await appDiagnostics.measure(`post-startup:${task.name}`, run);
          } else {
            await run();
          }
          completed.push({ name: task.name, at: new Date().toISOString() });
          _startupMark("task:done", { name: task.name });
        } catch (err) {
          failed.push({
            name: task.name,
            at: new Date().toISOString(),
            message: err?.message || String(err),
          });
          _startupMark("task:error", {
            name: task.name,
            message: err?.message || String(err),
          });
        }
      }
    } finally {
      running = false;
      _startupMark("post-startup:done", {
        completed: completed.length,
        failed: failed.length,
      });
      if (tasks.length) _startupScheduleDrain(0);
    }
  }

  function markFirstPaintReleased(opts = {}) {
    if (firstPaintReleased) return;
    firstPaintReleased = true;
    cloudSuppressUntil = _startupNow() + Number(opts.stabilizeMs || DEFAULT_STABILIZE_MS);
    _startupMark("first-paint-released", {
      error: Boolean(opts.error),
      queued: tasks.length,
    });
    _startupScheduleDrain(Number(opts.delay ?? 500));
  }

  function getState() {
    const cloudAutoPushSuppressed =
      criticalDepth > 0 ||
      !firstPaintReleased ||
      _startupNow() < cloudSuppressUntil;
    return {
      firstPaintReleased,
      postStartupStarted,
      running,
      criticalDepth,
      queued: tasks.map((task) => task.name),
      completed: [...completed],
      failed: [...failed],
      cloudAutoPushSuppressed,
    };
  }

  return {
    beginCritical,
    runCritical,
    shouldSuppressCloudAutoPush,
    queueTask,
    markFirstPaintReleased,
    drainPostStartupTasks,
    getState,
  };
})();

if (typeof window !== "undefined") {
  window.appStartup = appStartup;
}
