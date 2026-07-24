(function () {
  "use strict";

  const SYNC_DELAY_MS = 8000;
  const SUMMARY_REFRESH_MS = 2500;
  let syncTimer = null;
  let syncInFlight = false;
  let lastSyncError = "";

  function remoteStorageKey() {
    return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_LEADERBOARD_REMOTE
      ? STORAGE_KEYS.PLAYER_LEADERBOARD_REMOTE
      : "playerLeaderboardRemote";
  }

  function readArray(key, fallbackKey) {
    if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") return [];
    const storageKey = typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS[key] ? STORAGE_KEYS[key] : fallbackKey;
    const value = storageManager.get(storageKey, []);
    return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
  }

  function currentWeekKey() {
    if (typeof _quizWeekKey === "function") return _quizWeekKey(new Date());
    const date = new Date();
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
    return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  function getRemoteStore() {
    if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") return null;
    const store = storageManager.get(remoteStorageKey(), null);
    return store && typeof store === "object" ? store : null;
  }

  function saveRemoteSummary(summary, source = "fetch") {
    if (!summary || typeof summary !== "object") return;
    if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return;
    storageManager.set(remoteStorageKey(), {
      summary,
      source,
      fetchedAt: new Date().toISOString(),
      lastError: "",
    });
    lastSyncError = "";
  }

  function saveRemoteError(message) {
    lastSyncError = String(message || "Sync unavailable");
    const current = getRemoteStore() || {};
    if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return;
    storageManager.set(remoteStorageKey(), {
      ...current,
      lastError: lastSyncError,
      failedAt: new Date().toISOString(),
    });
  }

  async function _getVerifiedLeaderboardUser() {
    if (typeof window.whenAuthReady === "function") {
      await window.whenAuthReady().catch(() => null);
    }
    return typeof window.getCurrentAuthUser === "function"
      ? window.getCurrentAuthUser()
      : null;
  }

  function _notifyLeaderboardAuthRequired() {
    try {
      window.dispatchEvent(new CustomEvent("bc-auth-session-required", {
        detail: { message: "Your secure session ended. Sign in to continue." },
      }));
    } catch (_err) {
      // Auth boot will restore the sign-in gate on the next startup check.
    }
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: {
        Accept: "application/json",
        "X-BC-Auth-Mode": "json",
        ...(options.headers || {}),
      },
    });
    if (response.status === 401) {
      _notifyLeaderboardAuthRequired();
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Leaderboard request failed: ${response.status}`);
    }
    return response.json();
  }

  function buildPlayerLeaderboardSyncPayload() {
    return {
      weekKey: currentWeekKey(),
      attempts: readArray("PLAYER_QUIZ_RESULTS", "playerQuizResults").slice(-150),
      rewards: readArray("PLAYER_REWARD_EVENTS", "playerRewardEvents").slice(-400),
      stickers: readArray("PLAYER_HELMET_STICKERS", "playerHelmetStickers").slice(-500),
    };
  }

  function shouldSkipPayload(payload) {
    return !payload.attempts.length && !payload.rewards.length && !payload.stickers.length;
  }

  function rerenderLeaderboardSurfaces() {
    if (typeof isQuizPageActive === "function" && isQuizPageActive() && typeof renderQuizPage === "function") {
      renderQuizPage();
    }
    const coachSetup = document.getElementById("coachQuizSetupPage");
    if (coachSetup?.offsetParent !== null && typeof renderCoachQuizSetupPage === "function") {
      renderCoachQuizSetupPage();
    }
  }

  async function refreshPlayerLeaderboardSummary(options = {}) {
    const user = await _getVerifiedLeaderboardUser();
    if (!user) return null;
    try {
      const weekKey = encodeURIComponent(currentWeekKey());
      const data = await requestJson(`/api/leaderboard/summary?weekKey=${weekKey}`);
      if (data?.summary) {
        saveRemoteSummary(data.summary, "summary");
        if (!options.quiet) rerenderLeaderboardSurfaces();
      }
      return data?.summary || null;
    } catch (err) {
      saveRemoteError(err?.message || err);
      return null;
    }
  }

  async function syncPlayerLeaderboardNow(options = {}) {
    const user = await _getVerifiedLeaderboardUser();
    if (user?.role !== "player") return null;
    if (syncInFlight) return null;
    const payload = buildPlayerLeaderboardSyncPayload();
    if (shouldSkipPayload(payload)) {
      return refreshPlayerLeaderboardSummary({ quiet: true });
    }
    syncInFlight = true;
    try {
      const data = await requestJson("/api/leaderboard/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (data?.summary) {
        saveRemoteSummary(data.summary, "sync");
        if (!options.quiet) rerenderLeaderboardSurfaces();
      }
      return data || null;
    } catch (err) {
      saveRemoteError(err?.message || err);
      return null;
    } finally {
      syncInFlight = false;
    }
  }

  function queuePlayerLeaderboardSync(_reason = "") {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      syncPlayerLeaderboardNow({ quiet: true });
    }, SYNC_DELAY_MS);
  }

  function getRemotePlayerLeaderboardRows(view = "week") {
    const store = getRemoteStore();
    const summary = store?.summary;
    const rows = view === "season" ? summary?.season?.rows : summary?.week?.rows;
    return Array.isArray(rows) ? rows.filter((row) => row && typeof row === "object") : [];
  }

  function getRemotePlayerLeaderboardMeta() {
    const store = getRemoteStore();
    return {
      fetchedAt: store?.fetchedAt || "",
      source: store?.source || "",
      lastError: store?.lastError || lastSyncError,
      weekKey: store?.summary?.weekKey || "",
      synced: Boolean(store?.summary),
    };
  }

  window.buildPlayerLeaderboardSyncPayload = buildPlayerLeaderboardSyncPayload;
  window.getRemotePlayerLeaderboardRows = getRemotePlayerLeaderboardRows;
  window.getRemotePlayerLeaderboardMeta = getRemotePlayerLeaderboardMeta;
  window.queuePlayerLeaderboardSync = queuePlayerLeaderboardSync;
  window.refreshPlayerLeaderboardSummary = refreshPlayerLeaderboardSummary;
  window.syncPlayerLeaderboardNow = syncPlayerLeaderboardNow;

  document.addEventListener("DOMContentLoaded", () => {
    void (async () => {
      const user = await _getVerifiedLeaderboardUser();
      if (!user) return;
      window.setTimeout(() => refreshPlayerLeaderboardSummary({ quiet: true }), SUMMARY_REFRESH_MS);
      if (user.role === "player") {
        window.setTimeout(() => syncPlayerLeaderboardNow({ quiet: true }), SUMMARY_REFRESH_MS + 2500);
      }
    })();
  });
})();
