/*
 * Play Readiness / Rep Scoring
 * Step 1: coach-only script workflow integration.
 *
 * Data is keyed by playSignature(play) so the same readiness record can be reused
 * later by playbook, game plan, call sheet, and dashboard surfaces.
 */

// Install tier: 3 clear levels instead of 4
const PLAY_READINESS_INSTALL_STATUSES = ["new", "installed", "core"];

// Legacy install status display names (for migration compat)
const _PR_TIER_DISPLAY = { new: "New", installed: "Installed", core: "Core" };

// 5 practice intensity levels (down from 11)
const PLAY_READINESS_REP_TYPES = [
  { id: "mental", label: "Film / Mental", weight: 0.25 },
  { id: "walkthrough", label: "Walkthrough / Indy", weight: 0.5 },
  { id: "air", label: "On Air / Position", weight: 0.75 },
  { id: "scout", label: "vs Scout / Team", weight: 1.0 },
  { id: "live", label: "Live / Game Rep", weight: 1.5 },
];

// Rep volume targets per tier
const PLAY_READINESS_THRESHOLDS = {
  new: { target: 15 },
  installed: { target: 40 },
  core: { target: 80 },
};

const PLAY_READINESS_SHOWN_POINTS = {
  diagram: 5,
  video: 5,
};

// Legacy rep type id → new id mapping (for migration)
const _PR_LEGACY_TYPE_MAP = {
  mental: "mental", walkthrough: "walkthrough", indy_low: "walkthrough",
  indy_high: "air", position_group: "air", air: "air",
  half_line: "scout", team_scout: "scout", pressure: "scout",
  live: "live", game: "live",
};

const PLAY_READINESS_SAMPLE_SEEDS = [
  { play: "Power", tier: "core", scores: [4, 5, 4, 4, 5], types: ["scout", "live", "scout", "scout", "live"] },
  { play: "Counter", tier: "installed", scores: [3, 4, 4], types: ["scout", "scout", "live"] },
  { play: "Inside Zone", tier: "core", scores: [4, 4, 5, 4], types: ["live", "scout", "live", "scout"] },
  { play: "Play Action Shot", tier: "installed", scores: [3, 4], types: ["air", "scout"] },
  { play: "Screen", tier: "installed", scores: [2, 3, 4], types: ["scout", "scout", "live"] },
];

let playReadinessHistoryContext = null;

function isPlayReadinessCoachRole() {
  const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  return !user || user.role !== "player";
}

function getPlayReadinessStore() {
  const stored = storageManager.get(STORAGE_KEYS.PLAY_READINESS, null);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return { version: 1, records: {} };
  }
  if (!stored.records || typeof stored.records !== "object" || Array.isArray(stored.records)) {
    stored.records = {};
  }
  stored.version = stored.version || 1;
  return stored;
}

function savePlayReadinessStore(store) {
  storageManager.set(STORAGE_KEYS.PLAY_READINESS, store);
}

function normalizePlayReadinessInstallStatus(value) {
  if (PLAY_READINESS_INSTALL_STATUSES.includes(value)) return value;
  // Map legacy strings → new tiers
  if (value === "Identity Play") return "core";
  if (value === "Base Play") return "installed";
  if (value === "Tag/Variation") return "installed";
  if (value === "New Play") return "new";
  return "installed";
}

// Kept for backward compat — complexity no longer used in new records
function normalizePlayReadinessComplexity(value) {
  return ["Low", "Medium", "High"].includes(value) ? value : "Medium";
}

function inferPlayReadinessInstallStatus(play) {
  if (!play) return "installed";
  // Tags/variations of a base play
  if (play.basePlay && String(play.basePlay).trim() && play.basePlay !== play.play) return "installed";
  // Core identity plays (called in openers or two-minute)
  const tempo = String(play?.tempo || "").toLowerCase();
  if (tempo.includes("two") || tempo.includes("openers")) return "core";
  return "installed";
}

// Kept for migration compat only
function inferPlayReadinessComplexity(play) {
  const text = [play?.motion, play?.shift, play?.protection, play?.play]
    .join(" ").toLowerCase();
  if (/trick|screen|shot|rpo|option/.test(text)) return "High";
  if (/tag|counter|pull|play action|pa /.test(text)) return "Medium";
  return "Low";
}

function getPlayReadinessFamily(play) {
  const base = String(play?.basePlay || "").trim();
  if (base) return base;
  const name = String(play?.play || "").trim();
  if (/power/i.test(name)) return "Power";
  if (/counter/i.test(name)) return "Counter";
  if (/zone/i.test(name)) return "Zone";
  if (/screen/i.test(name)) return "Screen";
  if (/rpo/i.test(name)) return "RPO";
  if (/quick/i.test(name)) return "Quick Game";
  if (/play action|pa /i.test(name)) return "Play Action";
  return String(play?.type || "").trim() || "Unclassified";
}

function getPlayReadinessKey(play) {
  if (!play) return "";
  if (typeof playSignature === "function") return playSignature(play);
  return getPlayIdentityKey(play, "tag", { trim: false });
}

function getPlayReadinessSnapshot(play) {
  return {
    play: play?.play || "",
    formation: play?.formation || "",
    personnel: play?.personnel || "",
    family: getPlayReadinessFamily(play),
  };
}

function getPlayReadinessPlayLabel(play) {
  if (typeof getScriptPlaySummaryText === "function") {
    return getScriptPlaySummaryText(play);
  }
  if (typeof getPlayPresentationPlayLabel === "function") {
    return getPlayPresentationPlayLabel(play);
  }
  return [play?.formation, play?.protection, play?.play]
    .filter(Boolean)
    .join(" ") || "Untitled Play";
}

function createPlayReadinessRecord(play) {
  return {
    installStatus: inferPlayReadinessInstallStatus(play),
    notes: "",
    playSnapshot: getPlayReadinessSnapshot(play),
    logs: [],
    updatedAt: new Date().toISOString(),
  };
}

function getPlayReadinessRecord(play, opts = {}) {
  const key = getPlayReadinessKey(play);
  if (!key) return null;
  const store = getPlayReadinessStore();
  let record = store.records[key];
  if (!record && opts.create) {
    record = createPlayReadinessRecord(play);
    store.records[key] = record;
    savePlayReadinessStore(store);
  }
  return record || createPlayReadinessRecord(play);
}

function upsertPlayReadinessRecord(play, updater) {
  const key = getPlayReadinessKey(play);
  if (!key) return null;
  const store = getPlayReadinessStore();
  let record = store.records[key] || createPlayReadinessRecord(play);
  // Inline migration: convert legacy reps[]+actionReports[] → logs[]
  if (!Array.isArray(record.logs)) {
    record.logs = _migrateRecordToLogs(record);
  }
  record.playSnapshot = { ...getPlayReadinessSnapshot(play), ...(record.playSnapshot || {}) };
  updater(record);
  record.installStatus = normalizePlayReadinessInstallStatus(record.installStatus);
  record.updatedAt = new Date().toISOString();
  store.records[key] = record;
  savePlayReadinessStore(store);
  return record;
}

function updatePlayReadinessRecordByKey(key, updater) {
  const store = getPlayReadinessStore();
  const record = store.records?.[key];
  if (!record) return null;
  updater(record);
  record.updatedAt = new Date().toISOString();
  store.records[key] = record;
  savePlayReadinessStore(store);
  return record;
}

// ── Legacy migration ──────────────────────────────────────────────────────

function _migrateRecordToLogs(record) {
  const logs = [];
  const linkedRepIds = new Set(
    (record.actionReports || []).filter((r) => r.linkedRepId).map((r) => r.linkedRepId)
  );
  // Convert action reports → scored log entries
  (record.actionReports || []).forEach((report) => {
    const legacyType = report.repType || "team_scout";
    logs.push({
      id: report.id || createPlayId("migrated"),
      date: report.date || new Date().toISOString().slice(0, 10),
      score: Math.max(1, Math.min(5, parseInt(report.score, 10) || 3)),
      type: _PR_LEGACY_TYPE_MAP[legacyType] || "scout",
      notes: [report.notes, report.defensiveLook].filter(Boolean).join(" / ") || "",
      situation: report.situation || "",
      defense: report.defensiveLook || "",
      explosive: Boolean(report.explosive),
      turnover: Boolean(report.turnover),
      penalty: Boolean(report.penalty),
      createdAt: report.createdAt || new Date().toISOString(),
      _legacy: true,
    });
  });
  // Convert standalone reps (not linked to an action report) → unscored log entries
  (record.reps || []).forEach((rep) => {
    if (linkedRepIds.has(rep.id)) return;
    logs.push({
      id: rep.id || createPlayId("migrated"),
      date: rep.date || new Date().toISOString().slice(0, 10),
      score: 3, // "Functional" default for unscored volume reps
      type: _PR_LEGACY_TYPE_MAP[rep.repType] || "scout",
      count: Math.max(1, parseInt(rep.actualReps, 10) || 1),
      notes: rep.notes || "",
      situation: "",
      defense: "",
      explosive: false,
      turnover: false,
      penalty: false,
      createdAt: rep.createdAt || new Date().toISOString(),
      _legacy: true,
      _unscored: true,
    });
  });
  logs.sort((a, b) => new Date(b.date) - new Date(a.date));
  return logs;
}

// ── New confidence formula ─────────────────────────────────────────────────

function getPlayReadinessRepType(typeId) {
  return (
    PLAY_READINESS_REP_TYPES.find((t) => t.id === typeId) ||
    PLAY_READINESS_REP_TYPES.find((t) => t.id === "scout")
  );
}

function getPlayReadinessConfidenceLabel(score) {
  if (score < 40) return "Not Ready";
  if (score < 65) return "Building";
  if (score < 85) return "Game Ready";
  return "Automatic";
}

function getPlayReadinessShownStatus(play) {
  const hasDiagram = Boolean(
    play &&
    window.playImages &&
    typeof window.playImages.hasForPlay === "function" &&
    window.playImages.hasForPlay(play)
  );
  const hasVideo = Boolean(
    play &&
    window.playClips &&
    typeof window.playClips.hasForPlay === "function" &&
    window.playClips.hasForPlay(play)
  );
  const shownPoints =
    (hasDiagram ? PLAY_READINESS_SHOWN_POINTS.diagram : 0) +
    (hasVideo ? PLAY_READINESS_SHOWN_POINTS.video : 0);
  return {
    hasDiagram,
    hasVideo,
    shownPoints,
    maxShownPoints:
      PLAY_READINESS_SHOWN_POINTS.diagram + PLAY_READINESS_SHOWN_POINTS.video,
    label: hasDiagram && hasVideo
      ? "Shown"
      : hasDiagram
        ? "Diagram"
        : hasVideo
          ? "Video"
          : "Unshown",
  };
}

function getPlayReadinessSummary(play) {
  let record = getPlayReadinessRecord(play);
  // Inline migration if needed
  if (!Array.isArray(record.logs)) {
    record = { ...record, logs: _migrateRecordToLogs(record) };
  }
  const installStatus = normalizePlayReadinessInstallStatus(record.installStatus);
  const config = PLAY_READINESS_THRESHOLDS[installStatus] || PLAY_READINESS_THRESHOLDS["installed"];
  const logs = record.logs || [];

  // Volume: sum of rep counts (each log defaults to 1 rep)
  const repCount = logs.reduce((sum, log) => sum + (parseInt(log.count, 10) || 1), 0);

  // Scored logs: only those with a real score
  const scoredLogs = logs.filter((log) => log.score >= 1 && !log._unscored);
  const totalScoredWeight = scoredLogs.reduce((sum, log) => {
    const type = getPlayReadinessRepType(log.type);
    return sum + (type?.weight || 1) * (parseInt(log.count, 10) || 1);
  }, 0);
  const avgScore = totalScoredWeight > 0
    ? scoredLogs.reduce((sum, log) => {
      const type = getPlayReadinessRepType(log.type);
      const w = (type?.weight || 1) * (parseInt(log.count, 10) || 1);
      return sum + log.score * w;
    }, 0) / totalScoredWeight
    : 0;

  // Volume progress toward tier target
  const volumeProgress = Math.min(1, repCount / config.target);

  // Recency: fraction of logs in last 14 days
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recentCount = logs.filter((log) => {
    const t = new Date(log.date || log.createdAt || "").getTime();
    return Number.isFinite(t) && t >= cutoff;
  }).length;
  const recencyBoost = logs.length > 0 ? recentCount / logs.length : 0;

  // Final readiness score (0–100)
  const repScorePart = avgScore > 0 ? (avgScore / 5) * 60 : 0;
  const volumePart = volumeProgress * 30;
  const recencyPart = recencyBoost * 10;
  const shownStatus = getPlayReadinessShownStatus(play);
  const practiceScore = Math.round(repScorePart + volumePart + recencyPart);
  const confidenceScore = Math.min(
    100,
    Math.round(practiceScore + shownStatus.shownPoints),
  );

  // Progress bar (0–100% toward target)
  const progressPct = Math.min(100, Math.round(volumeProgress * 100));

  // Last log entry
  const lastLog = logs.length ? logs[0] : null;
  const lastLogDate = lastLog?.date || "";
  const lastLogScore = lastLog?.score || 0;
  const daysSinceLast = lastLogDate
    ? Math.floor((Date.now() - new Date(lastLogDate).getTime()) / 86400000)
    : null;

  // Score trend from last 3 scored logs
  const recentScores = scoredLogs.slice(0, 5).map((l) => l.score);
  let scoreTrend = { label: "No reps yet", short: "Unscored", tone: "empty" };
  if (recentScores.length >= 2) {
    const delta = recentScores[0] - recentScores[recentScores.length - 1];
    if (delta >= 0.5) scoreTrend = { label: "Trending up", short: "Up", tone: "up" };
    else if (delta <= -0.5) scoreTrend = { label: "Trending down", short: "Down", tone: "down" };
    else scoreTrend = { label: "Stable trend", short: "Stable", tone: "stable" };
  } else if (recentScores.length === 1) {
    scoreTrend = { label: "First rep logged", short: "First", tone: "stable" };
  }

  return {
    key: getPlayReadinessKey(play),
    record,
    installStatus,
    installTierDisplay: _PR_TIER_DISPLAY[installStatus] || installStatus,
    family: record.playSnapshot?.family || getPlayReadinessFamily(play),
    logs,
    repCount,
    scoredRepCount: scoredLogs.length,
    avgScore: Math.round(avgScore * 10) / 10,
    progressPct,
    volumeProgress,
    practiceScore,
    shownStatus,
    shownPoints: shownStatus.shownPoints,
    confidenceScore,
    confidenceLabel: getPlayReadinessConfidenceLabel(confidenceScore),
    lastLog,
    lastLogDate,
    lastLogScore,
    daysSinceLast,
    scoreTrend,
  };
}

function formatPlayReadinessNumber(value, digits = 1) {
  const num = parseFloat(value) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(digits);
}

// ── Badge / compact helpers ───────────────────────────────────────────────

function getPlayReadinessBadgeTone(summary) {
  if (!summary?.repCount) return "empty";
  if (summary.confidenceScore >= 85) return "automatic";
  if (summary.confidenceScore >= 65) return "gameready";
  if (summary.confidenceScore >= 40) return "building";
  return "notready";
}

function getPlayReadinessCompactSummary(summary) {
  const avgText = summary.scoredRepCount ? summary.avgScore.toFixed(1) : "-";
  const lastText = summary.lastLogScore ? `${summary.lastLogScore}/5` : "-";
  const daysText = summary.daysSinceLast !== null
    ? (summary.daysSinceLast === 0 ? "today" : `${summary.daysSinceLast}d ago`)
    : null;
  const repLabel = summary.repCount === 1 ? "rep" : "reps";
  const tone = getPlayReadinessBadgeTone(summary);

  return {
    avgText,
    lastText,
    daysText,
    tone,
    trend: summary.scoreTrend,
    label: summary.repCount ? summary.confidenceLabel : "Not Yet Scored",
    sublabel: summary.repCount
      ? `${summary.repCount} ${repLabel} \u00b7 avg ${avgText}/5${summary.shownPoints ? ` \u00b7 +${summary.shownPoints} shown` : ""}`
      : (summary.shownPoints ? `${summary.shownStatus.label} \u00b7 +${summary.shownPoints}` : "Log your first rep"),
  };
}

function renderPlayReadinessCompactBadgeFromSummary(summary, opts = {}) {
  const compact = getPlayReadinessCompactSummary(summary);
  const variant = opts.variant ? ` play-readiness-badge--${escapeHtml(opts.variant)}` : "";
  const toggleAttrs = opts.scriptIdx !== undefined
    ? ` data-action="toggleScriptReadinessPanel" data-arg="${opts.scriptIdx}" role="button" tabindex="0"`
    : opts.playbookIdx !== undefined
      ? ` data-action="openPlayReadinessPlaybookLogModal" data-arg="${opts.playbookIdx}" role="button" tabindex="0" title="Log a rep for this play"`
      : "";
  const detail = opts.detail === false
    ? ""
    : `<span class="play-readiness-badge-detail">
        <span>${escapeHtml(compact.lastText)} last</span>
        <span>${summary.repCount} reps</span>
        ${summary.shownPoints ? `<span>+${summary.shownPoints} shown</span>` : ""}
        <span>${escapeHtml(compact.trend.short)}</span>
      </span>`;
  const title = [
    compact.label,
    `${summary.repCount} reps`,
    `avg ${compact.avgText}/5`,
    summary.shownPoints ? `${summary.shownStatus.label} media +${summary.shownPoints}` : "No diagram/video shown bonus",
    compact.trend.label,
    `Readiness ${summary.confidenceScore}`,
  ].join(" \u2022 ");

  return `
    <span class="play-readiness-badge play-readiness-badge--${escapeHtml(compact.tone)} play-readiness-badge-trend--${escapeHtml(compact.trend.tone)}${variant}"
      data-auth-player-hide="true" title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}"${toggleAttrs}>
      <span class="play-readiness-badge-dot" aria-hidden="true"></span>
      <span class="play-readiness-badge-main">
        <strong>${escapeHtml(compact.label)}</strong>
        <small>${escapeHtml(compact.sublabel)}</small>
      </span>
      ${detail}
    </span>`;
}

function renderPlayReadinessCompactBadge(play, opts = {}) {
  if (!isPlayReadinessCoachRole() || opts.printStyle || !play) return "";
  return renderPlayReadinessCompactBadgeFromSummary(getPlayReadinessSummary(play), opts);
}

function renderPlayReadinessRollup(summary, opts = {}) {
  const compact = getPlayReadinessCompactSummary(summary);
  const variant = opts.variant ? ` play-readiness-rollup--${escapeHtml(opts.variant)}` : "";
  const items = [
    ["Score", `${summary.confidenceScore}`],
    ["Avg", `${compact.avgText}/5`],
    ["Reps", `${summary.repCount}`],
    ["Shown", summary.shownPoints ? `+${summary.shownPoints}` : "0"],
    ["Trend", compact.trend.short],
  ];
  return `
    <div class="play-readiness-rollup play-readiness-rollup--${escapeHtml(compact.tone)}${variant}"
      aria-label="Readiness rollup">
      ${items.map(([label, value]) => `
        <span class="play-readiness-rollup-chip">
          <small>${escapeHtml(label)}</small>
          <strong>${escapeHtml(value)}</strong>
        </span>`).join("")}
    </div>`;
}

function refreshPlayReadinessSurfaces(source = "") {
  if (typeof requestRenderScript === "function") requestRenderScript();
  if (typeof requestRenderPlaybook === "function") {
    requestRenderPlaybook();
  } else if (typeof renderSelectedPlaybookReadinessPanel === "function") {
    renderSelectedPlaybookReadinessPanel(selectedRowIndex);
  }
  if (typeof requestRenderGamePlan === "function") {
    requestRenderGamePlan({ debounceMs: 60 });
  }
  const overlay = document.getElementById("playPresentationOverlay");
  if (
    overlay?.classList.contains("show") &&
    typeof renderPlayPresentation === "function"
  ) {
    renderPlayPresentation();
  }
  if (source === "playbook" && typeof renderSelectedPlaybookReadinessPanel === "function") {
    renderSelectedPlaybookReadinessPanel(selectedRowIndex);
  }
}

window.addEventListener("play-images-changed", () => {
  refreshPlayReadinessSurfaces("media");
});

window.addEventListener("play-clips-changed", () => {
  refreshPlayReadinessSurfaces("clips");
});

function getPlayReadinessPlaybookPlay(index) {
  const idx = parseInt(index, 10);
  if (Number.isNaN(idx)) return null;
  if (Array.isArray(filteredPlays) && filteredPlays[idx]) return filteredPlays[idx];
  if (Array.isArray(plays) && plays[idx]) return plays[idx];
  return null;
}

const _SIMPLE_REP_IDS = ["mental", "walkthrough", "air", "team_scout", "live", "game"];
const _SIMPLE_REP_DISPLAY = {
  mental: "Film / Mental Rep",
  walkthrough: "Walkthrough",
  air: "On Air / Positional",
  team_scout: "Team vs Scout",
  live: "Live / Scrimmage",
  game: "Actual Game Rep",
};

// ── Score button labels (item 29) ────────────────────────────────────────
const _SCORE_LABELS = ["", "Not Ready", "Developing", "Functional", "Sharp", "Automatic"];


// ── Script widget (items 13-16) ──────────────────────────────────────────

function renderPlayReadinessScriptWidget(play, index, opts = {}) {
  if (!isPlayReadinessCoachRole() || opts.printStyle) return "";
  const summary = opts.readinessSummary || getPlayReadinessSummary(play);
  const compact = getPlayReadinessCompactSummary(summary);
  const hasData = summary.repCount > 0;
  const confidenceDisplay = hasData ? summary.confidenceLabel : "Not Yet Scored";
  const statsText = hasData
    ? `${summary.repCount} reps \u00b7 avg ${summary.avgScore.toFixed(1)}/5${summary.shownPoints ? ` \u00b7 +${summary.shownPoints} shown` : ""}`
    : (summary.shownPoints ? `${summary.shownStatus.label} \u00b7 +${summary.shownPoints} shown before practice` : "Score 1\u20135 after each rep");
  const lastLine = summary.lastLog
    ? `Last: ${summary.lastLogDate}${compact.daysText ? " (" + compact.daysText + ")" : ""} \u00b7 ${summary.lastLogScore}/5`
    : null;
  const hasAnyRecords = Object.keys(getPlayReadinessStore().records || {}).length > 0;

  return `
    <section class="play-readiness-widget play-readiness-widget--${escapeHtml(compact.tone)}"
      data-auth-player-hide="true" aria-label="Play readiness for ${escapeHtml(getScriptPlaySummaryText(play))}">

      <!-- Row 1: Large score buttons -->
      <div class="pr-score-row">
        <div class="play-readiness-score-grid play-readiness-score-grid--large" role="group" aria-label="Score this rep 1 to 5">
          ${renderPlayReadinessScoreButtons("quickPlayReadinessScriptScore", summary.lastLogScore, `data-idx="${index}"`)}
        </div>
        <button type="button" class="pr-close-btn" data-action="toggleScriptReadinessPanel" data-arg="${index}" aria-label="Close readiness panel">&times;</button>
      </div>

      <!-- Row 2: Confidence + stats -->
      <div class="pr-widget-meta">
        <strong class="pr-confidence pr-confidence--${escapeHtml(compact.tone)}">${escapeHtml(confidenceDisplay)}</strong>
        <span class="pr-widget-stats">${escapeHtml(statsText)}</span>
        ${lastLine ? `<span class="pr-widget-last">${escapeHtml(lastLine)}</span>` : ""}
        <div class="play-readiness-track" style="--pr-progress:${summary.progressPct}%" aria-label="${summary.progressPct}% toward target">
          <span class="play-readiness-fill" aria-hidden="true"></span>
        </div>
      </div>

      <!-- Row 3: Actions -->
      <div class="play-readiness-actions">
        <button type="button" class="play-readiness-btn play-readiness-btn--edit" data-action="openPlayEditorFromScript" data-arg="${index}">&#9998; Edit</button>
        <button type="button" class="play-readiness-btn play-readiness-btn--primary" data-action="openPlayReadinessLogModal" data-arg="${index}">+ Log Rep</button>
        <button type="button" class="play-readiness-btn play-readiness-btn--ghost" data-action="showPlayReadinessHistory" data-arg="${index}">History</button>
      </div>

    </section>`;
}

function renderPlayReadinessScoreButtons(action, activeScore = 0, extraAttrs = "") {
  return [1, 2, 3, 4, 5]
    .map((score) => {
      const active = parseInt(activeScore, 10) === score ? " active" : "";
      const label = _SCORE_LABELS[score];
      return `<button type="button" class="play-readiness-score-btn${active}"
        data-action="${escapeHtml(action)}" data-arg="${score}" ${extraAttrs}
        title="${score} \u2014 ${label}"
        aria-label="Score ${score}/5: ${label}">${score}</button>`;
    })
    .join("");
}

function renderPlayReadinessPresentationCoachCard(play) {
  if (!isPlayReadinessCoachRole()) return "";
  const summary = getPlayReadinessSummary(play);
  const compact = getPlayReadinessCompactSummary(summary);
  return `
    <section class="pp-coach-section pp-coach-section-readiness"
      data-auth-player-hide="true" aria-label="Play readiness scoring">
      <div class="pp-coach-section-head">
        <h3>Readiness Score</h3>
        <span>Coach table</span>
      </div>
      <div class="pp-readiness-summary">
        <div class="pp-readiness-status">
          <strong class="pp-readiness-score">${summary.confidenceScore}</strong>
          <span class="pr-confidence pr-confidence--${escapeHtml(compact.tone)}">${escapeHtml(summary.confidenceLabel)}</span>
        </div>
        <div class="pp-readiness-plain-stats">
          <span>${summary.repCount} reps</span>
          <span>avg ${summary.avgScore.toFixed(1)}/5</span>
          ${summary.shownPoints ? `<span>${escapeHtml(summary.shownStatus.label)} +${summary.shownPoints}</span>` : ""}
          ${compact.daysText ? `<span>last ${escapeHtml(compact.daysText)}</span>` : ""}
        </div>
        <div class="play-readiness-track" style="--pr-progress:${summary.progressPct}%" aria-label="${summary.progressPct}% readiness">
          <span class="play-readiness-fill" aria-hidden="true"></span>
        </div>
      </div>
      <div class="pp-readiness-score-row">
        <span>Score the rep</span>
        <div class="pp-readiness-score-grid" role="group" aria-label="Quick score this rep">
          ${renderPlayReadinessScoreButtons("quickPlayReadinessPresentationScore", summary.lastLogScore)}
        </div>
      </div>
      <div class="pp-readiness-actions">
        <button type="button" class="play-readiness-btn" data-action="openPlayReadinessPresentationLogModal">
          Log Rep
        </button>
        <button type="button" class="play-readiness-btn" data-action="showPlayReadinessPresentationHistory">
          History
        </button>
      </div>
    </section>
  `;
}

function renderPlayReadinessPresentationMinimumDock(play) {
  if (!isPlayReadinessCoachRole() || !play) return "";
  const summary = getPlayReadinessSummary(play);
  const compact = getPlayReadinessCompactSummary(summary);
  return `
    <div class="pp-minimum-readiness-dock" data-auth-player-hide="true" aria-label="Quick score this rep">
      <div class="pp-minimum-score-label">
        <span>Score Rep</span>
        <strong>${summary.confidenceScore}</strong>
        <small class="pr-confidence pr-confidence--${escapeHtml(compact.tone)}">${escapeHtml(summary.confidenceLabel)}</small>
        ${summary.shownPoints ? `<small>${escapeHtml(summary.shownStatus.label)} +${summary.shownPoints}</small>` : ""}
      </div>
      <div class="pp-minimum-score-grid" role="group" aria-label="Score this play 1 to 5">
        ${renderPlayReadinessScoreButtons("quickPlayReadinessPresentationScore", summary.lastLogScore)}
      </div>
    </div>
  `;
}

function renderPlayReadinessPresentationScoreRail(play) {
  if (!isPlayReadinessCoachRole() || !play) return "";
  const summary = getPlayReadinessSummary(play);
  const compact = getPlayReadinessCompactSummary(summary);
  return `
    <aside class="pp-readiness-score-rail" data-auth-player-hide="true" aria-label="Coach quick score">
      <div class="pp-readiness-rail-copy">
        <span>Coach Score</span>
        <strong>${summary.confidenceScore}</strong>
        <small class="pr-confidence pr-confidence--${escapeHtml(compact.tone)}">${escapeHtml(summary.confidenceLabel)} \u00b7 ${summary.repCount} reps${summary.shownPoints ? ` \u00b7 +${summary.shownPoints} shown` : ""}</small>
      </div>
      <div class="pp-readiness-rail-buttons" role="group" aria-label="Score this rep 1 to 5">
        ${renderPlayReadinessScoreButtons("quickPlayReadinessPresentationScore", summary.lastLogScore)}
      </div>
      <button type="button" class="pp-readiness-rail-report" data-action="openPlayReadinessPresentationLogModal">
        Log Rep
      </button>
    </aside>
  `;
}

function renderPlayReadinessPlaybookPanel(play, filteredIndex) {
  if (!isPlayReadinessCoachRole() || !play) return "";
  const summary = getPlayReadinessSummary(play);
  const compact = getPlayReadinessCompactSummary(summary);
  const avgText = summary.scoredRepCount ? summary.avgScore.toFixed(1) : "-";
  const daysStr = compact.daysText ? ` \u00b7 last ${compact.daysText}` : "";

  // Last 5 log entries as mini list
  const logRows = summary.logs.slice(0, 5).map((log) => {
    const typeLabel = getPlayReadinessRepType(log.type)?.label || log.type || "Rep";
    const flags = [
      log.explosive ? "&#128293;" : "",
      log.turnover ? "&#128308;" : "",
      log.penalty ? "&#129000;" : "",
    ].filter(Boolean).join(" ");
    return `<div class="pb-readiness-log-row">
      <span class="pb-readiness-log-date">${escapeHtml(log.date || "")}</span>
      <span class="pb-readiness-log-type">${escapeHtml(typeLabel)}</span>
      <span class="pb-readiness-log-score">${log.score}/5</span>
      ${flags ? `<span class="pb-readiness-log-flags">${flags}</span>` : ""}
      ${log.notes ? `<em class="pb-readiness-log-note">${escapeHtml(log.notes)}</em>` : ""}
    </div>`;
  }).join("") || `<div class="play-readiness-empty">No reps logged yet.</div>`;

  return `
    <div class="pb-readiness-card" data-auth-player-hide="true">
      <button type="button" class="pr-close-btn pb-readiness-close-btn" data-action="closePlaybookReadinessPanel" title="Close" aria-label="Close readiness panel">&times;</button>
      <div class="pb-readiness-main">
        <span class="pb-readiness-eyebrow">Readiness — ${escapeHtml(summary.installTierDisplay)}</span>
        <h3>${escapeHtml(getPlayReadinessPlayLabel(play))}</h3>
      </div>
      <div class="pb-readiness-score-hero">
        <strong class="pb-readiness-big-number">${summary.confidenceScore}</strong>
        <span class="pr-confidence pr-confidence--${escapeHtml(compact.tone)}">${escapeHtml(summary.confidenceLabel)}</span>
        <small>${summary.repCount} reps \u00b7 avg ${escapeHtml(avgText)}/5${summary.shownPoints ? ` \u00b7 +${summary.shownPoints} shown` : ""}${escapeHtml(daysStr)}</small>
      </div>
      <div class="pb-readiness-progress">
        <div class="play-readiness-track" style="--pr-progress:${summary.progressPct}%" aria-label="${summary.progressPct}% toward ${escapeHtml(summary.installTierDisplay)} target">
          <span class="play-readiness-fill" aria-hidden="true"></span>
        </div>
      </div>
      <div class="pb-readiness-log-list" aria-label="Recent reps">
        ${logRows}
      </div>
      <div class="pb-readiness-action-row">
        <div class="pb-readiness-score-inline" role="group" aria-label="Quick score selected play">
          ${renderPlayReadinessScoreButtons("quickPlayReadinessPlaybookScore", summary.lastLogScore)}
        </div>
        <span class="pb-readiness-action-sep" aria-hidden="true"></span>
        <button type="button" class="play-readiness-btn play-readiness-btn--primary" data-action="openPlayReadinessPlaybookLogModal" data-arg="${filteredIndex}">Log Rep</button>
        <button type="button" class="play-readiness-btn" data-action="showPlayReadinessPlaybookHistory" data-arg="${filteredIndex}">History</button>
        <button type="button" class="play-readiness-btn play-readiness-btn--edit" data-action="openPlayEditor" data-arg="${filteredIndex}">&#9998; Edit</button>
        <button type="button" class="play-readiness-btn play-readiness-btn--ghost" data-action="openPlaybookPresentation" data-arg="${filteredIndex}">Present</button>
      </div>
    </div>
  `;
}

function renderPlayReadinessEmptyPlaybookPanel() {
  const hasPlays = Array.isArray(filteredPlays) && filteredPlays.length > 0;
  const firstPlayAction = hasPlays
    ? `<button type="button" class="play-readiness-btn" data-action="openPlaybookPresentation" data-arg="0">
        Present First Play
      </button>`
    : "";

  return `
    <div class="pb-readiness-card pb-readiness-card--empty" data-auth-player-hide="true">
      <div class="pb-readiness-main">
        <span class="pb-readiness-eyebrow">Coach/Admin Scoring</span>
        <h3>Play Readiness Scoring</h3>
        <p class="pb-readiness-empty-copy">
          Select any play row to score it here, or click the readiness badge on any row to log a rep directly.
          You can also score plays from the Script tab or from Presentation coach mode.
        </p>
      </div>
      <div class="pb-readiness-empty-steps" aria-label="Where to score plays">
        <span><strong>1</strong> Select a play</span>
        <span><strong>2</strong> Quick score 1-5</span>
        <span><strong>3</strong> Review badges and trends</span>
      </div>
      <div class="pb-readiness-actions pb-readiness-empty-actions">
        <button type="button" class="play-readiness-btn" data-action="showTab" data-arg="script">
          Open Script Scoring
        </button>
        ${firstPlayAction}
      </div>
    </div>`;
}

function closePlaybookReadinessPanel() {
  const panel = document.getElementById("playbookReadinessPanel");
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = "";
  }
}

function renderSelectedPlaybookReadinessPanel(index = selectedRowIndex) {
  const panel = document.getElementById("playbookReadinessPanel");
  if (!panel) return;
  const play = getPlayReadinessPlaybookPlay(index);
  if (!isPlayReadinessCoachRole()) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  setInnerHTML(
    panel,
    play
      ? renderPlayReadinessPlaybookPanel(play, parseInt(index, 10))
      : renderPlayReadinessEmptyPlaybookPanel(),
  );
}

function getPlayReadinessScriptPlay(index) {
  const idx = parseInt(index, 10);
  if (Number.isNaN(idx) || !script[idx] || script[idx].isSeparator) return null;
  return script[idx];
}

function getPlayReadinessDefaultRepCount(play) {
  return Math.max(1, parseInt(play?.reps, 10) || 1);
}

function closePlayReadinessModal() {
  playReadinessHistoryContext = null;
  document.getElementById("playReadinessModalOverlay")?.remove();
}

// ── Single "Log a Rep" modal (items 7-10) ────────────────────────────────

function openPlayReadinessLogModalForPlay(play, context = {}) {
  if (!play || !isPlayReadinessCoachRole()) return;
  const summary = getPlayReadinessSummary(play);
  const playLabel = getPlayReadinessPlayLabel(play);
  const typeOptions = PLAY_READINESS_REP_TYPES.map((t) =>
    `<option value="${escapeHtml(t.id)}" ${t.id === "scout" ? "selected" : ""}>${escapeHtml(t.label)}</option>`
  ).join("");
  const tierOptions = PLAY_READINESS_INSTALL_STATUSES.map((tier) =>
    `<option value="${escapeHtml(tier)}" ${tier === summary.installStatus ? "selected" : ""}>${escapeHtml(_PR_TIER_DISPLAY[tier] || tier)}</option>`
  ).join("");

  closePlayReadinessModal();
  const overlay = document.createElement("div");
  overlay.id = "playReadinessModalOverlay";
  overlay.className = "modal-overlay show play-readiness-modal-overlay";
  overlay.dataset.action = "closePlayReadinessModalOverlay";
  overlay.innerHTML = `
    <div class="modal-content play-readiness-modal pr-log-modal" role="dialog" aria-modal="true" aria-labelledby="prLogTitle">
      <div class="modal-header">
        <h3 id="prLogTitle">Log a Rep</h3>
        <button type="button" class="modal-close-btn" data-action="closePlayReadinessModal" aria-label="Close">x</button>
      </div>
      <form id="prLogForm" class="play-readiness-form">
        <p class="play-readiness-modal-sub">${escapeHtml(playLabel)}</p>

        <!-- Step 1: Score + Type (always visible) -->
        <div class="pr-log-step1">
          <div class="pr-log-score-section">
            <label class="pr-log-field-label">Score this rep</label>
            <div class="play-readiness-score-grid play-readiness-score-grid--large pr-log-score-grid" role="group" aria-label="Score 1 to 5">
              ${[1, 2, 3, 4, 5].map((s) => `
                <button type="button" class="play-readiness-score-btn${summary.lastLogScore === s ? " active" : ""}"
                  data-arg="${s}"
                  title="${s} \u2014 ${_SCORE_LABELS[s]}"
                  aria-label="Score ${s}/5: ${_SCORE_LABELS[s]}">${s}</button>`).join("")}
            </div>
            <input type="hidden" name="score" id="prLogScoreInput" value="${summary.lastLogScore || 3}" data-auth-allow-input="true" />
          </div>
          <label class="pr-log-type-label">Practice type
            <select data-auth-allow-input="true" name="type">${typeOptions}</select>
          </label>
          <label class="pr-log-tier-label">Tier
            <select data-auth-allow-input="true" name="installStatus">${tierOptions}</select>
          </label>
        </div>

        <!-- Step 2: Optional context (collapsed) -->
        <details class="pr-log-details">
          <summary class="pr-log-details-toggle">+ More detail (optional)</summary>
          <div class="pr-log-step2">
            <label>Date
              <input data-auth-allow-input="true" name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" />
            </label>
            <label>Situation
              <input data-auth-allow-input="true" name="situation" type="text" placeholder="3rd short, red zone, 2-min\u2026" />
            </label>
            <label>Defense
              <input data-auth-allow-input="true" name="defense" type="text" placeholder="Cover 2, 3-4, pressure\u2026" />
            </label>
            <label class="pr-log-notes-label">Notes
              <input data-auth-allow-input="true" name="notes" type="text" placeholder="Result, coaching point\u2026" />
            </label>
          </div>
        </details>

        <div class="modal-actions">
          <button type="button" class="btn" data-action="closePlayReadinessModal">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Rep</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  wireScriptOverlayDismiss(overlay);

  // Wire score buttons inside the modal to update the hidden input + active state
  overlay.querySelectorAll(".pr-log-score-grid .play-readiness-score-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      overlay.querySelectorAll(".pr-log-score-grid .play-readiness-score-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const input = overlay.querySelector("#prLogScoreInput");
      if (input) input.value = btn.dataset.arg;
    });
  });

  overlay.querySelector("#prLogForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    _savePlayReadinessLog(play, event.currentTarget, context);
  });
  overlay.querySelector("select[name='type']")?.focus();
}

function _savePlayReadinessLog(play, form, context = {}) {
  if (!play || !form || !isPlayReadinessCoachRole()) return;
  const data = new FormData(form);
  const typeId = String(data.get("type") || "scout");
  const repType = getPlayReadinessRepType(typeId);
  const score = Math.max(1, Math.min(5, parseInt(data.get("score"), 10) || 3));
  upsertPlayReadinessRecord(play, (record) => {
    record.installStatus = normalizePlayReadinessInstallStatus(String(data.get("installStatus") || ""));
    record.logs = Array.isArray(record.logs) ? record.logs : [];
    record.logs.unshift({
      id: createPlayId("log"),
      date: String(data.get("date") || new Date().toISOString().slice(0, 10)),
      score,
      type: repType.id,
      notes: String(data.get("notes") || "").trim(),
      situation: String(data.get("situation") || "").trim(),
      defense: String(data.get("defense") || "").trim(),
      createdAt: new Date().toISOString(),
    });
  });
  closePlayReadinessModal();
  refreshPlayReadinessSurfaces(context.source);
  showToast(`Logged ${score}/5 (${escapeHtml(repType.label)})`, { type: "success", duration: 2000 });
}

// Public entry points
function openPlayReadinessLogModal(index) {
  openPlayReadinessLogModalForPlay(getPlayReadinessScriptPlay(index), { source: "script", index });
}

function openPlayReadinessPlaybookLogModal(index) {
  openPlayReadinessLogModalForPlay(getPlayReadinessPlaybookPlay(index), { source: "playbook", index });
}

function getPlayReadinessCurrentPresentationPlay() {
  if (typeof playPresentationState === "undefined") return null;
  const item = playPresentationState?.items?.[playPresentationState.index];
  return item?.play || null;
}

function openPlayReadinessPresentationLogModal() {
  openPlayReadinessLogModalForPlay(getPlayReadinessCurrentPresentationPlay(), { source: "presentation" });
}

// Backward-compat stubs (delegated actions in old HTML may still reference these)
function openPlayReadinessRepModal(index) { openPlayReadinessLogModal(index); }
function openPlayReadinessPlaybookRepModal(index) { openPlayReadinessPlaybookLogModal(index); }
function openPlayReadinessActionModal(index) { openPlayReadinessLogModal(index); }
function openPlayReadinessPlaybookActionModal(index) { openPlayReadinessPlaybookLogModal(index); }
function openPlayReadinessPresentationActionModal() { openPlayReadinessPresentationLogModal(); }

// ── Quick score (item 11) ─────────────────────────────────────────────────

function quickScorePlayReadiness(play, rawScore, context = {}) {
  if (!play || !isPlayReadinessCoachRole()) return;
  const score = Math.max(1, Math.min(5, parseInt(rawScore, 10) || 3));
  const date = new Date().toISOString().slice(0, 10);
  const repType = getPlayReadinessRepType("scout");
  const logId = createPlayId("quick");
  let undone = false;

  upsertPlayReadinessRecord(play, (record) => {
    record.logs = Array.isArray(record.logs) ? record.logs : [];
    record.logs.unshift({
      id: logId,
      date,
      score,
      type: repType.id,
      notes: "",
      situation: "",
      defense: "",
      createdAt: new Date().toISOString(),
    });
  });
  refreshPlayReadinessSurfaces(context.source);

  showUndoToast(
    `${score}/5 — ${_SCORE_LABELS[score]} logged`,
    () => {
      if (undone) return;
      undone = true;
      const key = getPlayReadinessKey(play);
      updatePlayReadinessRecordByKey(key, (record) => {
        record.logs = (record.logs || []).filter((l) => l.id !== logId);
      });
      refreshPlayReadinessSurfaces(context.source);
      showToast("Rep removed", { duration: 1400 });
    },
    4000,
  );
}

function quickPlayReadinessPlaybookScore(score) {
  quickScorePlayReadiness(getPlayReadinessPlaybookPlay(selectedRowIndex), score, { source: "playbook" });
}

function quickPlayReadinessScriptScore(score, element) {
  const idx = parseInt(element?.dataset?.idx, 10);
  quickScorePlayReadiness(getPlayReadinessScriptPlay(idx), score, { source: "script", index: idx });
}

function quickPlayReadinessPresentationScore(score) {
  quickScorePlayReadiness(getPlayReadinessCurrentPresentationPlay(), score, { source: "presentation" });
}

// ── History modal (item 26) — unified log timeline ────────────────────────

function _PR_TYPE_ICON(typeId) {
  return { mental: "🧠", walkthrough: "🚶", air: "💨", scout: "🏈", live: "⚡" }[typeId] || "📋";
}

function renderPlayReadinessReportScoreControls(playKey, log) {
  const logId = log?.id || "";
  const activeScore = parseInt(log?.score, 10) || 0;
  return `
    <div class="play-readiness-report-score-controls" role="group"
      aria-label="Update score for this rep">
      ${[1, 2, 3, 4, 5].map((score) => {
    const active = activeScore === score ? " active" : "";
    return `<button type="button" class="play-readiness-score-btn${active}"
          data-action="updatePlayReadinessReportScore"
          data-arg="${score}"
          data-play-key="${escapeHtml(playKey)}"
          data-report-id="${escapeHtml(logId)}"
          aria-label="Update to ${score}/5">${score}</button>`;
  }).join("")}
      <button type="button" class="play-readiness-report-delete"
        data-action="deletePlayReadinessReport"
        data-play-key="${escapeHtml(playKey)}"
        data-report-id="${escapeHtml(logId)}"
        aria-label="Delete this rep">Delete</button>
    </div>
  `;
}

function rerenderPlayReadinessHistoryModal(playKey) {
  if (playReadinessHistoryContext?.key !== playKey) return;
  const play = playReadinessHistoryContext.play;
  if (play) showPlayReadinessHistoryForPlay(play);
}

function updatePlayReadinessReportScore(score, element) {
  const button = element instanceof Element ? element : null;
  const playKey = button?.dataset.playKey || "";
  const logId = button?.dataset.reportId || "";
  const nextScore = Math.max(1, Math.min(5, parseInt(score, 10) || 3));
  if (!playKey || !logId || !isPlayReadinessCoachRole()) return;
  const record = updatePlayReadinessRecordByKey(playKey, (draft) => {
    const log = (draft.logs || []).find((l) => l.id === logId);
    if (log) { log.score = nextScore; log.updatedAt = new Date().toISOString(); }
  });
  if (!record) return;
  refreshPlayReadinessSurfaces();
  rerenderPlayReadinessHistoryModal(playKey);
  showToast(`Score updated to ${nextScore}/5.`, { type: "success", duration: 1600 });
}

async function deletePlayReadinessReport(element) {
  const button = element instanceof Element ? element : null;
  const playKey = button?.dataset.playKey || "";
  const logId = button?.dataset.reportId || "";
  if (!playKey || !logId || !isPlayReadinessCoachRole()) return;
  const ok = await showConfirm("Delete this rep log entry?", {
    title: "Delete Rep",
    icon: "🗑️",
    confirmText: "Delete",
    cancelText: "Keep",
    danger: true,
  });
  if (!ok) return;
  const record = updatePlayReadinessRecordByKey(playKey, (draft) => {
    draft.logs = (draft.logs || []).filter((l) => l.id !== logId);
  });
  if (!record) return;
  refreshPlayReadinessSurfaces();
  rerenderPlayReadinessHistoryModal(playKey);
  showToast("Rep deleted.", { type: "success", duration: 1600 });
}

function showPlayReadinessHistoryForPlay(play) {
  if (!play || !isPlayReadinessCoachRole()) return;
  const summary = getPlayReadinessSummary(play);
  playReadinessHistoryContext = { key: summary.key, play };

  const avgText = summary.scoredRepCount ? summary.avgScore.toFixed(1) : "-";
  const logRows = summary.logs.slice(0, 20).map((log) => {
    const typeLabel = getPlayReadinessRepType(log.type)?.label || log.type || "Rep";
    const icon = _PR_TYPE_ICON(log.type);
    const flags = [
      log.explosive ? "&#128293;" : "",
      log.turnover ? "&#128308;" : "",
      log.penalty ? "&#129000;" : "",
    ].filter(Boolean).join(" ");
    const contextStr = [log.situation, log.defense].filter(Boolean).join(" / ");
    return `<div class="play-readiness-history-row">
      <span class="pr-hist-icon">${icon}</span>
      <strong class="pr-hist-date">${escapeHtml(log.date || "")}</strong>
      <span class="pr-hist-type">${escapeHtml(typeLabel)}</span>
      <span class="pr-hist-score">${log._unscored ? "(unscored)" : `${log.score}/5`}</span>
      ${flags ? `<span class="pr-hist-flags">${flags}</span>` : ""}
      ${contextStr ? `<span class="pr-hist-context">${escapeHtml(contextStr)}</span>` : ""}
      ${log.notes ? `<em class="pr-hist-note">${escapeHtml(log.notes)}</em>` : ""}
      ${renderPlayReadinessReportScoreControls(summary.key, log)}
    </div>`;
  }).join("") || `<div class="play-readiness-empty">No reps logged yet. Score a rep in the script or playbook panel.</div>`;

  closePlayReadinessModal();
  const overlay = document.createElement("div");
  overlay.id = "playReadinessModalOverlay";
  overlay.className = "modal-overlay show play-readiness-modal-overlay";
  overlay.dataset.action = "closePlayReadinessModalOverlay";
  overlay.innerHTML = `
    <div class="modal-content play-readiness-modal play-readiness-history-modal" role="dialog" aria-modal="true" aria-labelledby="playReadinessHistoryTitle">
      <div class="modal-header">
        <h3 id="playReadinessHistoryTitle">Rep History</h3>
        <button type="button" class="modal-close-btn" data-action="closePlayReadinessModal" aria-label="Close">x</button>
      </div>
      <div class="play-readiness-history-summary">
        <div><strong>${summary.confidenceScore}</strong><span>${escapeHtml(summary.confidenceLabel)}</span></div>
        <div><strong>${summary.repCount}</strong><span>Total reps</span></div>
        <div><strong>${escapeHtml(avgText)}/5</strong><span>Avg score</span></div>
        <div><strong>${summary.progressPct}%</strong><span>To target</span></div>
      </div>
      <div class="play-readiness-history-grid">
        <section>
          <h4>Rep Log</h4>
          ${logRows}
        </section>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-action="closePlayReadinessModal">Close</button>
        <button type="button" class="btn btn-primary" data-action="openPlayReadinessLogModal" data-arg="${summary.key}">+ Log Rep</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  wireScriptOverlayDismiss(overlay);
  overlay.querySelector(".modal-close-btn")?.focus();
}

function showPlayReadinessHistory(index) {
  showPlayReadinessHistoryForPlay(getPlayReadinessScriptPlay(index));
}

function showPlayReadinessPlaybookHistory(index) {
  showPlayReadinessHistoryForPlay(getPlayReadinessPlaybookPlay(index));
}

function showPlayReadinessPresentationHistory() {
  showPlayReadinessHistoryForPlay(getPlayReadinessCurrentPresentationPlay());
}

function findPlayReadinessSeedPlay(seed) {
  const all = [...(Array.isArray(script) ? script.filter((item) => item && !item.isSeparator) : []), ...(Array.isArray(plays) ? plays : [])];
  const needle = seed.play.toLowerCase();
  return all.find((play) => String(play.play || play.basePlay || "").toLowerCase().includes(needle));
}

function seedPlayReadinessSampleData() {
  if (!isPlayReadinessCoachRole()) return;
  const store = getPlayReadinessStore();
  PLAY_READINESS_SAMPLE_SEEDS.forEach((seed, seedIndex) => {
    const matchPlay = findPlayReadinessSeedPlay(seed);
    const play = matchPlay || {
      id: `sample_readiness_${seed.play.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      play: seed.play,
      formation: "Sample",
      personnel: "11",
      basePlay: seed.play,
      type: seed.play.includes("Screen") || seed.play.includes("Shot") ? "Pass" : "Run",
    };
    const key = getPlayReadinessKey(play);
    const logs = seed.scores.map((score, i) => {
      const daysBack = (seedIndex + i) * 3;
      const date = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
      return {
        id: createPlayId("seed_log"),
        date,
        score,
        type: seed.types[i] || "scout",
        notes: i === 0 ? "Sample rep" : "",
        situation: i % 2 ? "3rd down" : "1st and 10",
        defense: "Sample look",
        explosive: score >= 5,
        turnover: score <= 1,
        penalty: false,
        createdAt: new Date().toISOString(),
      };
    });
    store.records[key] = {
      installStatus: seed.tier,
      notes: "Sample readiness seed",
      playSnapshot: getPlayReadinessSnapshot(play),
      logs,
      updatedAt: new Date().toISOString(),
    };
  });
  savePlayReadinessStore(store);
  if (typeof requestRenderScript === "function") requestRenderScript();
  showToast("Seeded five sample readiness records.", { type: "success", duration: 2600 });
}

// ── Readiness panel toggle (script inline widget) ──────────────────────────

function toggleScriptReadinessPanel(idx) {
  const idxNum = parseInt(idx, 10);
  const item = document.querySelector(`.script-item[data-idx="${idxNum}"]`);
  if (!item) return;
  const wasOpen = item.classList.contains("script-item--readiness-open");
  // Close all open panels first
  document.querySelectorAll(".script-item--readiness-open").forEach((el) =>
    el.classList.remove("script-item--readiness-open")
  );
  if (!wasOpen) {
    item.classList.add("script-item--readiness-open");
    item.querySelector(".play-readiness-score-btn")?.focus();
  }
}

function closeAllScriptReadinessPanels() {
  document.querySelectorAll(".script-item--readiness-open").forEach((el) =>
    el.classList.remove("script-item--readiness-open")
  );
}

function openPlayEditorFromScript(scriptIdx) {
  const play = script[parseInt(scriptIdx, 10)];
  if (!play || play.isSeparator) return;
  if (typeof openPlayEditorForPlay === "function") {
    openPlayEditorForPlay(play);
  }
}
