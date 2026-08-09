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

  // Persisted attempts include local-only presentation data such as reviewRows
  // (which can embed an entire play). Send only the bounded server contract;
  // player identity, timestamps, and ranking week are supplied by the server.
  function buildPlayerAttemptPayload(attempt = {}) {
    return {
      id: attempt.id,
      sourceType: attempt.sourceType,
      sourceId: attempt.sourceId,
      title: attempt.title,
      positionKey: attempt.positionKey,
      positionLabel: attempt.positionLabel,
      score: attempt.score,
      bonusPoints: attempt.bonusPoints,
      totalPoints: attempt.totalPoints,
      answered: attempt.answered,
      correct: attempt.correct,
      wrong: attempt.wrong,
      totalQuestions: attempt.totalQuestions,
      remaining: attempt.remaining,
      percent: attempt.percent,
      badge: attempt.badge,
      bestStreak: attempt.bestStreak,
      questionBreakdown: attempt.questionBreakdown,
      review: attempt.review,
      completed: attempt.completed,
    };
  }

  function buildPlayerLeaderboardSyncPayload() {
    return {
      weekKey: currentWeekKey(),
      attempts: readArray("PLAYER_QUIZ_RESULTS", "playerQuizResults")
        .slice(-150)
        .map(buildPlayerAttemptPayload),
    };
  }

  function shouldSkipPayload(payload) {
    return !payload.attempts.length;
  }

  function normalizeIdentity(value) {
    return String(value || "").trim().toLowerCase();
  }

  // The server independently resolves this reference against active D1 player
  // accounts. The local roster is only a convenience for sending an email when
  // the coach has linked one, never an authority over player identity.
  function buildStaffLeaderboardTarget(record = {}) {
    const name = String(record.player || record.playerName || "").trim();
    const roster = typeof getTeamRoster === "function" ? getTeamRoster() : [];
    const matches = (Array.isArray(roster) ? roster : []).filter((player) =>
      normalizeIdentity(player?.name) === normalizeIdentity(name),
    );
    const account = matches.length === 1 ? String(matches[0]?.accountUsername || "").trim().toLowerCase() : "";
    return account.includes("@") ? { name, email: account } : { name };
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

  async function mutateStaffLeaderboardRecord(options = {}) {
    const user = await _getVerifiedLeaderboardUser();
    if (!["admin", "coach"].includes(String(user?.role || ""))) {
      throw new Error("Coach leaderboard access is required.");
    }
    const record = options?.record && typeof options.record === "object" ? options.record : {};
    const payload = {
      kind: String(options?.kind || ""),
      action: String(options?.action || ""),
      record,
      target: options?.target && typeof options.target === "object"
        ? options.target
        : buildStaffLeaderboardTarget(record),
    };
    const data = await requestJson("/api/leaderboard/awards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (data?.summary) {
      saveRemoteSummary(data.summary, "staff-award");
      rerenderLeaderboardSurfaces();
    }
    return data?.result || null;
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
  // Public bridge for coach controls loaded earlier in the classic-script
  // order; it always routes awards through the server-authorized endpoint.
  window.mutateStaffLeaderboardRecord = mutateStaffLeaderboardRecord;

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
