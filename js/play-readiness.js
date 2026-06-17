/*
 * Play Readiness / Rep Scoring
 * Step 1: coach-only script workflow integration.
 *
 * Data is keyed by playSignature(play) so the same readiness record can be reused
 * later by playbook, game plan, call sheet, and dashboard surfaces.
 */

const PLAY_READINESS_INSTALL_STATUSES = [
  "New Play",
  "Tag/Variation",
  "Base Play",
  "Identity Play",
];

const PLAY_READINESS_COMPLEXITIES = ["Low", "Medium", "High"];

// Rep weights are intentionally centralized so the model can be tuned later.
const PLAY_READINESS_REP_TYPES = [
  { id: "mental", label: "Film / whiteboard mental rep", weight: 0.25 },
  { id: "walkthrough", label: "Walkthrough rep", weight: 0.5 },
  { id: "indy_low", label: "Indy drill with play emphasis", weight: 0.5 },
  { id: "indy_high", label: "Indy drill high-emphasis rep", weight: 0.75 },
  { id: "position_group", label: "Position group rep", weight: 0.75 },
  { id: "air", label: "Reps on air", weight: 0.75 },
  { id: "half_line", label: "Half-line / inside run / skelly", weight: 1 },
  { id: "team_scout", label: "Team vs scout", weight: 1 },
  { id: "pressure", label: "Team vs pressure / movement / bad look", weight: 1.25 },
  { id: "live", label: "Live opponent / scrimmage / game-like rep", weight: 1.5 },
  { id: "game", label: "Actual game rep", weight: 2 },
];

const PLAY_READINESS_THRESHOLDS = {
  "New Play": {
    target: 45,
    sweet: [30, 45],
    bands: [
      { min: 0, label: "Not Installed" },
      { min: 10, label: "Installed" },
      { min: 20, label: "Usable" },
      { min: 30, label: "Game Ready" },
      { min: 45, label: "Confident" },
    ],
  },
  "Tag/Variation": {
    target: 25,
    sweet: [15, 25],
    bands: [
      { min: 0, label: "Not Installed" },
      { min: 5, label: "Installed" },
      { min: 10, label: "Usable" },
      { min: 15, label: "Game Ready" },
      { min: 25, label: "Confident" },
    ],
  },
  "Base Play": {
    target: 100,
    sweet: [20, 40],
    useWeeklySweetSpot: true,
    bands: [
      { min: 0, label: "Installed" },
      { min: 20, label: "Usable" },
      { min: 50, label: "Confident" },
      { min: 75, label: "Mastered" },
      { min: 100, label: "Identity-Level" },
    ],
  },
  "Identity Play": {
    target: 200,
    sweet: [20, 40],
    useWeeklySweetSpot: true,
    bands: [
      { min: 0, label: "Needs Work" },
      { min: 50, label: "Strong" },
      { min: 100, label: "Mastered" },
      { min: 150, label: "Program Identity" },
      { min: 200, label: "Automatic / Can Teach It" },
    ],
  },
};

const PLAY_READINESS_SAMPLE_SEEDS = [
  { play: "Power", status: "Identity Play", complexity: "Medium", reps: 82, reports: [4, 5, 4] },
  { play: "Counter", status: "Base Play", complexity: "Medium", reps: 46, reports: [3, 4] },
  { play: "Inside Zone", status: "Identity Play", complexity: "Low", reps: 118, reports: [4, 4, 5] },
  { play: "Play Action Shot", status: "Tag/Variation", complexity: "High", reps: 18, reports: [3, 4] },
  { play: "Screen", status: "Base Play", complexity: "Medium", reps: 31, reports: [2, 3, 4] },
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

function getPlayReadinessRepType(repTypeId) {
  return (
    PLAY_READINESS_REP_TYPES.find((type) => type.id === repTypeId) ||
    PLAY_READINESS_REP_TYPES[0]
  );
}

function normalizePlayReadinessInstallStatus(value) {
  const found = PLAY_READINESS_INSTALL_STATUSES.find((status) => status === value);
  return found || "Base Play";
}

function normalizePlayReadinessComplexity(value) {
  const found = PLAY_READINESS_COMPLEXITIES.find((complexity) => complexity === value);
  return found || "Medium";
}

function inferPlayReadinessInstallStatus(play) {
  const playText = String(play?.play || "").toLowerCase();
  const tagText = [play?.playTag1, play?.playTag2, play?.formTag1, play?.formTag2]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  if (/trick|special|gadget/.test(playText)) return "New Play";
  if (tagText) return "Tag/Variation";
  if (play?.basePlay && String(play.basePlay).trim()) return "Base Play";
  return "Base Play";
}

function inferPlayReadinessComplexity(play) {
  const text = [
    play?.motion,
    play?.shift,
    play?.protection,
    play?.play,
    play?.playTag1,
    play?.playTag2,
  ].join(" ").toLowerCase();
  if (/trick|double|reverse|screen|shot|rpo|option|motion/.test(text)) return "High";
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
    complexity: inferPlayReadinessComplexity(play),
    notes: "",
    playSnapshot: getPlayReadinessSnapshot(play),
    reps: [],
    actionReports: [],
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
  const record = store.records[key] || createPlayReadinessRecord(play);
  record.playSnapshot = { ...getPlayReadinessSnapshot(play), ...(record.playSnapshot || {}) };
  updater(record);
  record.installStatus = normalizePlayReadinessInstallStatus(record.installStatus);
  record.complexity = normalizePlayReadinessComplexity(record.complexity);
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

function getPlayReadinessBand(config, weightedReps) {
  return config.bands.reduce((best, band) => (weightedReps >= band.min ? band : best), config.bands[0]);
}

function getPlayReadinessNextThreshold(config, weightedReps) {
  const next = config.bands.find((band) => weightedReps < band.min);
  return next ? next.min : config.target;
}

function getPlayReadinessWeeklyWeighted(record) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return (record.reps || []).reduce((sum, rep) => {
    const time = new Date(rep.date || rep.createdAt || "").getTime();
    if (!Number.isFinite(time) || time < cutoff) return sum;
    return sum + (parseFloat(rep.weightedValue) || 0);
  }, 0);
}

function getPlayReadinessSweetSpot(record, config, weightedReps) {
  const [low, high] = config.sweet || [0, config.target];
  const sweetBasis = config.useWeeklySweetSpot
    ? getPlayReadinessWeeklyWeighted(record)
    : weightedReps;
  if (sweetBasis < low) return { label: "Needs More Reps", tone: "needs", basis: sweetBasis, low, high };
  if (sweetBasis <= high) return { label: "Ready Zone", tone: "ready", basis: sweetBasis, low, high };
  return {
    label: "Possible Over-Repped - Consider Maintenance Only",
    tone: "over",
    basis: sweetBasis,
    low,
    high,
  };
}

function getPlayReadinessActionMetrics(record) {
  const reports = Array.isArray(record.actionReports) ? record.actionReports : [];
  const liveReps = reports.length;
  const scores = reports.map((report) => parseFloat(report.score) || 0).filter(Boolean);
  const avgScore = scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : 0;
  const rate = (field) =>
    liveReps ? Math.round((reports.filter((report) => Boolean(report[field])).length / liveReps) * 100) : 0;
  const confidenceValues = reports
    .map((report) => ({ Low: 1, Medium: 2, High: 3 }[report.coachConfidence] || 0))
    .filter(Boolean);
  let confidenceTrend = "No trend";
  if (confidenceValues.length >= 2) {
    const delta = confidenceValues[confidenceValues.length - 1] - confidenceValues[0];
    confidenceTrend = delta > 0 ? "Rising" : delta < 0 ? "Falling" : "Stable";
  }

  return {
    averageScore: avgScore,
    bestScore: scores.length ? Math.max(...scores) : 0,
    worstScore: scores.length ? Math.min(...scores) : 0,
    liveReps,
    explosiveRate: rate("explosive"),
    touchdownRate: rate("touchdown"),
    turnoverRate: rate("turnover"),
    missedAssignmentRate: rate("missedAssignment"),
    penaltyRate: rate("penalty"),
    sackTflRate: rate("sackTfl"),
    negativePlayRate: liveReps
      ? Math.round(
        (reports.filter((report) => Boolean(report.sackTfl) || (parseFloat(report.yards) || 0) < 0).length /
          liveReps) *
          100,
      )
      : 0,
    confidenceTrend,
  };
}

function getPlayReadinessConfidenceLabel(score) {
  if (score <= 25) return "Do Not Call";
  if (score <= 50) return "Practice Only";
  if (score <= 70) return "Safe Call Only";
  if (score <= 85) return "Game Ready";
  return "Trusted Call";
}

function getPlayReadinessSummary(play) {
  const record = getPlayReadinessRecord(play);
  const installStatus = normalizePlayReadinessInstallStatus(record.installStatus);
  const config = PLAY_READINESS_THRESHOLDS[installStatus] || PLAY_READINESS_THRESHOLDS["Base Play"];
  const weightedReps = (record.reps || []).reduce(
    (sum, rep) => sum + (parseFloat(rep.weightedValue) || 0),
    0,
  );
  const actualReps = (record.reps || []).reduce(
    (sum, rep) => sum + (parseInt(rep.actualReps, 10) || 0),
    0,
  );
  const readinessPercent = Math.min(100, Math.round((weightedReps / config.target) * 100));
  const band = getPlayReadinessBand(config, weightedReps);
  const nextThreshold = getPlayReadinessNextThreshold(config, weightedReps);
  const barMax = Math.max(nextThreshold, config.sweet?.[1] || 0, weightedReps, 1);
  const progressPct = Math.min(100, Math.round((weightedReps / barMax) * 100));
  const sweet = getPlayReadinessSweetSpot(record, config, weightedReps);
  const metrics = getPlayReadinessActionMetrics(record);
  const liveScore = metrics.liveReps ? (metrics.averageScore / 5) * 100 : 50;

  // Confidence formula: 60% weighted-rep readiness, 30% live grade, 10% mistake adjustment.
  // Mistakes pull the final score down; explosive/TD plays can recover a small amount.
  const penalty =
    metrics.turnoverRate * 0.55 +
    metrics.penaltyRate * 0.2 +
    metrics.missedAssignmentRate * 0.25 +
    metrics.negativePlayRate * 0.2;
  const bonus = metrics.explosiveRate * 0.08 + metrics.touchdownRate * 0.08;
  const mistakeScore = Math.max(0, Math.min(100, 100 - penalty + bonus));
  const confidenceScore = Math.round(
    readinessPercent * 0.6 + liveScore * 0.3 + mistakeScore * 0.1,
  );

  return {
    key: getPlayReadinessKey(play),
    record,
    installStatus,
    complexity: normalizePlayReadinessComplexity(record.complexity),
    family: record.playSnapshot?.family || getPlayReadinessFamily(play),
    weightedReps,
    weeklyWeightedReps: getPlayReadinessWeeklyWeighted(record),
    actualReps,
    readinessPercent,
    readinessLabel: band.label,
    nextThreshold,
    progressPct,
    sweet,
    sweetStartPct: Math.min(100, Math.round(((sweet.low || 0) / barMax) * 100)),
    sweetWidthPct: Math.min(
      100,
      Math.max(0, Math.round((((sweet.high || 0) - (sweet.low || 0)) / barMax) * 100)),
    ),
    metrics,
    confidenceScore,
    confidenceLabel: getPlayReadinessConfidenceLabel(confidenceScore),
  };
}

function formatPlayReadinessNumber(value, digits = 1) {
  const num = parseFloat(value) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(digits);
}

function getPlayReadinessLiveAverageText(summary) {
  return summary.metrics.liveReps
    ? summary.metrics.averageScore.toFixed(1)
    : "-";
}

function getPlayReadinessLastReport(summary) {
  const reports = Array.isArray(summary?.record?.actionReports)
    ? summary.record.actionReports
    : [];
  return reports.length ? reports[reports.length - 1] : null;
}

function getPlayReadinessScoreTrend(summary) {
  const reports = Array.isArray(summary?.record?.actionReports)
    ? summary.record.actionReports
    : [];
  const scores = reports
    .map((report) => parseFloat(report.score) || 0)
    .filter(Boolean);
  if (!scores.length) {
    return { label: "No score yet", short: "Unscored", tone: "empty" };
  }
  if (scores.length === 1) {
    return { label: "First score logged", short: "First score", tone: "stable" };
  }

  const recent = scores.slice(-3);
  const earlier = scores.length > 3 ? scores.slice(0, -3) : scores.slice(0, -1);
  const avg = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const delta = avg(recent) - avg(earlier);
  if (delta >= 0.35) {
    return { label: "Trending up", short: "Up", tone: "up" };
  }
  if (delta <= -0.35) {
    return { label: "Trending down", short: "Down", tone: "down" };
  }
  return { label: "Stable trend", short: "Stable", tone: "stable" };
}

function getPlayReadinessBadgeTone(summary) {
  if (!summary?.metrics?.liveReps && !summary?.weightedReps) return "empty";
  if (summary.confidenceScore >= 85) return "trusted";
  if (summary.confidenceScore >= 70) return "ready";
  if (summary.confidenceScore >= 50) return "needs";
  return "risk";
}

function getPlayReadinessCompactSummary(summary) {
  const lastReport = getPlayReadinessLastReport(summary);
  const lastScore = parseInt(lastReport?.score, 10) || 0;
  const trend = getPlayReadinessScoreTrend(summary);
  const scoreCount = summary.metrics.liveReps || 0;
  const averageScoreText = getPlayReadinessLiveAverageText(summary);
  const lastScoreText = lastScore ? `${lastScore}/5` : "-";
  const scoreCountText = `${scoreCount} scored ${scoreCount === 1 ? "rep" : "reps"}`;
  const repCountText = summary.actualReps
    ? `${summary.actualReps} total ${summary.actualReps === 1 ? "rep" : "reps"}`
    : scoreCountText;

  return {
    averageScoreText,
    lastScore,
    lastScoreText,
    scoreCount,
    scoreCountText,
    repCountText,
    trend,
    tone: getPlayReadinessBadgeTone(summary),
    label: scoreCount ? `Readiness ${averageScoreText}` : "Readiness --",
  };
}

function renderPlayReadinessCompactBadgeFromSummary(summary, opts = {}) {
  const compact = getPlayReadinessCompactSummary(summary);
  const variant = opts.variant ? ` play-readiness-badge--${escapeHtml(opts.variant)}` : "";
  const detail = opts.detail === false
    ? ""
    : `<span class="play-readiness-badge-detail">
        <span>Last ${escapeHtml(compact.lastScoreText)}</span>
        <span>${escapeHtml(compact.repCountText)}</span>
        <span>${escapeHtml(compact.trend.short)}</span>
      </span>`;
  const title = [
    compact.label,
    `Last ${compact.lastScoreText}`,
    compact.scoreCountText,
    compact.trend.label,
    `${summary.confidenceScore} confidence`,
  ].join(" • ");

  return `
    <span class="play-readiness-badge play-readiness-badge--${escapeHtml(compact.tone)} play-readiness-badge-trend--${escapeHtml(compact.trend.tone)}${variant}"
      data-auth-player-hide="true" title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}">
      <span class="play-readiness-badge-dot" aria-hidden="true"></span>
      <span class="play-readiness-badge-main">
        <strong>${escapeHtml(compact.label)}</strong>
        <small>${escapeHtml(summary.confidenceLabel)}</small>
      </span>
      ${detail}
    </span>`;
}

function renderPlayReadinessCompactBadge(play, opts = {}) {
  if (!isPlayReadinessCoachRole() || opts.printStyle || !play) return "";
  return renderPlayReadinessCompactBadgeFromSummary(
    getPlayReadinessSummary(play),
    opts,
  );
}

function renderPlayReadinessRollup(summary, opts = {}) {
  const compact = getPlayReadinessCompactSummary(summary);
  const variant = opts.variant ? ` play-readiness-rollup--${escapeHtml(opts.variant)}` : "";
  const items = [
    ["Avg", compact.averageScoreText],
    ["Last", compact.lastScoreText],
    ["Reps", compact.repCountText],
    ["Trend", compact.trend.label],
  ];

  return `
    <div class="play-readiness-rollup play-readiness-rollup--${escapeHtml(compact.tone)}${variant}"
      aria-label="Readiness rollup">
      ${items
        .map(([label, value]) => `
          <span class="play-readiness-rollup-chip">
            <small>${escapeHtml(label)}</small>
            <strong>${escapeHtml(value)}</strong>
          </span>`)
        .join("")}
    </div>`;
}

function refreshPlayReadinessSurfaces(source = "") {
  if (typeof requestRenderScript === "function") requestRenderScript();
  if (typeof requestRenderPlaybook === "function") {
    requestRenderPlaybook();
  } else if (typeof renderSelectedPlaybookReadinessPanel === "function") {
    renderSelectedPlaybookReadinessPanel(selectedRowIndex);
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

function getPlayReadinessPlaybookPlay(index) {
  const idx = parseInt(index, 10);
  if (Number.isNaN(idx)) return null;
  if (Array.isArray(filteredPlays) && filteredPlays[idx]) return filteredPlays[idx];
  if (Array.isArray(plays) && plays[idx]) return plays[idx];
  return null;
}

function renderPlayReadinessScriptWidget(play, index, opts = {}) {
  if (!isPlayReadinessCoachRole() || opts.printStyle) return "";
  const summary = opts.readinessSummary || getPlayReadinessSummary(play);
  const compact = getPlayReadinessCompactSummary(summary);
  const liveAverage = getPlayReadinessLiveAverageText(summary);
  const weightedText = formatPlayReadinessNumber(summary.weightedReps);
  const weeklyText = formatPlayReadinessNumber(summary.weeklyWeightedReps);
  const hasAnyRecords =
    Object.keys(getPlayReadinessStore().records || {}).length > 0;
  const lastReport = (summary.record.actionReports || []).slice(-1)[0] || null;

  return `
    <section class="play-readiness-widget play-readiness-widget--${escapeHtml(summary.sweet.tone)}"
      data-auth-player-hide="true" aria-label="Play readiness for ${escapeHtml(getScriptPlaySummaryText(play))}">
      <div class="play-readiness-main">
        <div class="play-readiness-head">
          <span class="play-readiness-kicker">Play Readiness</span>
          <strong>${escapeHtml(summary.readinessLabel)}</strong>
          <span>${summary.readinessPercent}%</span>
        </div>
        <div class="play-readiness-track"
          style="--pr-progress:${summary.progressPct}%; --pr-sweet-start:${summary.sweetStartPct}%; --pr-sweet-width:${summary.sweetWidthPct}%"
          aria-label="${summary.readinessPercent}% readiness">
          <span class="play-readiness-sweet" aria-hidden="true"></span>
          <span class="play-readiness-fill" aria-hidden="true"></span>
        </div>
        <div class="play-readiness-sweet-label">${escapeHtml(summary.sweet.label)}</div>
      </div>
      <div class="play-readiness-metrics">
        <span><strong>${escapeHtml(summary.installStatus)}</strong> status</span>
        <span><strong>${escapeHtml(weightedText)}</strong> weighted</span>
        <span><strong>${summary.actualReps}</strong> actual</span>
        <span><strong>${escapeHtml(weeklyText)}</strong> 7-day</span>
        <span><strong>${escapeHtml(liveAverage)}</strong> live avg</span>
        <span><strong>${escapeHtml(compact.lastScoreText)}</strong> last</span>
        <span><strong>${escapeHtml(compact.trend.short)}</strong> trend</span>
        <span><strong>${summary.confidenceScore}</strong> confidence</span>
        <span class="play-readiness-call-label">${escapeHtml(summary.confidenceLabel)}</span>
      </div>
      <div class="play-readiness-quick-score">
        <span>Score this rep</span>
        <div class="play-readiness-score-grid" role="group" aria-label="Quick score this script play">
          ${renderPlayReadinessScoreButtons(
    "quickPlayReadinessScriptScore",
    lastReport?.score || 0,
    `data-idx="${index}"`,
  )}
        </div>
      </div>
      <div class="play-readiness-actions">
        <button type="button" class="play-readiness-btn" data-action="openPlayReadinessRepModal" data-arg="${index}">
          Add Rep
        </button>
        <button type="button" class="play-readiness-btn" data-action="openPlayReadinessActionModal" data-arg="${index}">
          Action Report
        </button>
        <button type="button" class="play-readiness-btn" data-action="showPlayReadinessHistory" data-arg="${index}">
          History
        </button>
        ${
          hasAnyRecords
            ? ""
            : `<button type="button" class="play-readiness-btn play-readiness-btn--ghost" data-action="seedPlayReadinessSampleData">
                Seed Samples
              </button>`
        }
      </div>
    </section>`;
}

function renderPlayReadinessScoreButtons(action, activeScore = 0, extraAttrs = "") {
  return [1, 2, 3, 4, 5]
    .map((score) => {
      const active = parseInt(activeScore, 10) === score ? " active" : "";
      return `<button type="button" class="play-readiness-score-btn${active}"
        data-action="${escapeHtml(action)}" data-arg="${score}" ${extraAttrs}
        aria-label="Score this play ${score} out of 5">${score}</button>`;
    })
    .join("");
}

function renderPlayReadinessPresentationCoachCard(play) {
  if (!isPlayReadinessCoachRole()) return "";
  const summary = getPlayReadinessSummary(play);
  const compactBadge = renderPlayReadinessCompactBadgeFromSummary(summary, {
    variant: "presentation",
    detail: false,
  });
  const lastReport = (summary.record.actionReports || []).slice(-1)[0] || null;
  const weightedText = formatPlayReadinessNumber(summary.weightedReps);
  const weeklyText = formatPlayReadinessNumber(summary.weeklyWeightedReps);

  return `
    <section class="pp-coach-section pp-coach-section-readiness"
      data-auth-player-hide="true" aria-label="Play readiness scoring">
      <div class="pp-coach-section-head">
        <h3>Rep Score</h3>
        <span>Coach table</span>
      </div>
      ${compactBadge}
      <div class="pp-readiness-summary">
        <div class="pp-readiness-status">
          <span class="pp-readiness-label">${escapeHtml(summary.readinessLabel)}</span>
          <strong>${summary.confidenceScore}</strong>
          <span>${escapeHtml(summary.confidenceLabel)}</span>
        </div>
        <div class="play-readiness-track pp-readiness-track"
          style="--pr-progress:${summary.progressPct}%; --pr-sweet-start:${summary.sweetStartPct}%; --pr-sweet-width:${summary.sweetWidthPct}%"
          aria-label="${summary.readinessPercent}% readiness">
          <span class="play-readiness-sweet" aria-hidden="true"></span>
          <span class="play-readiness-fill" aria-hidden="true"></span>
        </div>
        <div class="pp-readiness-metrics">
          <span><strong>${summary.readinessPercent}%</strong> ready</span>
          <span><strong>${escapeHtml(weightedText)}</strong> weighted</span>
          <span><strong>${escapeHtml(weeklyText)}</strong> week</span>
          <span><strong>${escapeHtml(getPlayReadinessLiveAverageText(summary))}</strong> live avg</span>
        </div>
      </div>
      ${renderPlayReadinessRollup(summary, { variant: "presentation" })}
      <div class="pp-readiness-score-row">
        <span>Score the rep</span>
        <div class="pp-readiness-score-grid" role="group" aria-label="Quick score this rep">
          ${renderPlayReadinessScoreButtons("quickPlayReadinessPresentationScore", lastReport?.score || 0)}
        </div>
      </div>
      <div class="pp-readiness-actions">
        <button type="button" class="play-readiness-btn" data-action="openPlayReadinessPresentationActionModal">
          Full Report
        </button>
        <button type="button" class="play-readiness-btn" data-action="showPlayReadinessPresentationHistory">
          History
        </button>
      </div>
    </section>
  `;
}

function renderPlayReadinessPlaybookPanel(play, filteredIndex) {
  if (!isPlayReadinessCoachRole() || !play) return "";
  const summary = getPlayReadinessSummary(play);
  const compactBadge = renderPlayReadinessCompactBadgeFromSummary(summary, {
    variant: "playbook-selected",
    detail: true,
  });
  const lastReport = (summary.record.actionReports || []).slice(-1)[0] || null;
  const weightedText = formatPlayReadinessNumber(summary.weightedReps);
  const weeklyText = formatPlayReadinessNumber(summary.weeklyWeightedReps);

  return `
    <div class="pb-readiness-card" data-auth-player-hide="true">
      <div class="pb-readiness-main">
        <span class="pb-readiness-eyebrow">Selected Play Score</span>
        <h3>${escapeHtml(getPlayReadinessPlayLabel(play))}</h3>
        <div class="pb-readiness-meta">
          <span>${escapeHtml(summary.installStatus)}</span>
          <span>${escapeHtml(summary.complexity)} complexity</span>
          <span>${escapeHtml(summary.family)}</span>
        </div>
        ${compactBadge}
      </div>
      <div class="pb-readiness-status">
        <strong>${summary.confidenceScore}</strong>
        <span>${escapeHtml(summary.confidenceLabel)}</span>
        <em>${summary.readinessPercent}% ${escapeHtml(summary.readinessLabel)}</em>
      </div>
      <div class="pb-readiness-progress">
        <div class="play-readiness-track"
          style="--pr-progress:${summary.progressPct}%; --pr-sweet-start:${summary.sweetStartPct}%; --pr-sweet-width:${summary.sweetWidthPct}%">
          <span class="play-readiness-sweet" aria-hidden="true"></span>
          <span class="play-readiness-fill" aria-hidden="true"></span>
        </div>
        <div class="pb-readiness-stats">
          <span><strong>${escapeHtml(weightedText)}</strong> weighted</span>
          <span><strong>${summary.actualReps}</strong> reps</span>
          <span><strong>${escapeHtml(weeklyText)}</strong> 7-day</span>
          <span><strong>${escapeHtml(getPlayReadinessLiveAverageText(summary))}</strong> live avg</span>
        </div>
      </div>
      ${renderPlayReadinessRollup(summary, { variant: "playbook" })}
      <div class="pb-readiness-score" role="group" aria-label="Quick score selected play">
        <span>Quick score</span>
        ${renderPlayReadinessScoreButtons("quickPlayReadinessPlaybookScore", lastReport?.score || 0)}
      </div>
      <div class="pb-readiness-actions">
        <button type="button" class="play-readiness-btn" data-action="openPlayReadinessPlaybookRepModal"
          data-arg="${filteredIndex}">Add Rep</button>
        <button type="button" class="play-readiness-btn" data-action="openPlayReadinessPlaybookActionModal"
          data-arg="${filteredIndex}">Action Report</button>
        <button type="button" class="play-readiness-btn" data-action="showPlayReadinessPlaybookHistory"
          data-arg="${filteredIndex}">History</button>
        <button type="button" class="play-readiness-btn play-readiness-btn--ghost"
          data-action="openPlaybookPresentation" data-arg="${filteredIndex}">Present</button>
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
          Select any play to quick-score it here. In Script rows, use Add Rep, Action Report, or History.
          In presentation, switch to Coaches mode and score the rep from the coach table.
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

function openPlayReadinessRepModalForPlay(play, context = {}) {
  if (!play || !isPlayReadinessCoachRole()) return;
  const summary = getPlayReadinessSummary(play);
  const defaultType = PLAY_READINESS_REP_TYPES[7];
  const playLabel = getPlayReadinessPlayLabel(play);
  const options = PLAY_READINESS_REP_TYPES.map(
    (type) =>
      `<option value="${escapeHtml(type.id)}" ${type.id === defaultType.id ? "selected" : ""}>${escapeHtml(type.label)} (${type.weight})</option>`,
  ).join("");
  const statusOptions = PLAY_READINESS_INSTALL_STATUSES.map(
    (status) =>
      `<option value="${escapeHtml(status)}" ${summary.installStatus === status ? "selected" : ""}>${escapeHtml(status)}</option>`,
  ).join("");
  const complexityOptions = PLAY_READINESS_COMPLEXITIES.map(
    (complexity) =>
      `<option value="${escapeHtml(complexity)}" ${summary.complexity === complexity ? "selected" : ""}>${escapeHtml(complexity)}</option>`,
  ).join("");

  closePlayReadinessModal();
  const overlay = document.createElement("div");
  overlay.id = "playReadinessModalOverlay";
  overlay.className = "modal-overlay show play-readiness-modal-overlay";
  overlay.dataset.action = "closePlayReadinessModalOverlay";
  overlay.innerHTML = `
    <div class="modal-content play-readiness-modal" role="dialog" aria-modal="true" aria-labelledby="playReadinessRepTitle">
      <div class="modal-header">
        <h3 id="playReadinessRepTitle">Add Weighted Rep</h3>
        <button type="button" class="modal-close-btn" data-action="closePlayReadinessModal" aria-label="Close">x</button>
      </div>
      <form id="playReadinessRepForm" class="play-readiness-form">
        <p class="play-readiness-modal-sub">${escapeHtml(playLabel)}</p>
        <div class="play-readiness-form-grid">
          <label>Rep Type
            <select data-auth-allow-input="true" name="repType">${options}</select>
          </label>
          <label>Actual Reps
            <input data-auth-allow-input="true" name="actualReps" type="number" min="1" step="1" value="${getPlayReadinessDefaultRepCount(play)}" />
          </label>
          <label>Date
            <input data-auth-allow-input="true" name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" />
          </label>
          <label>Install Status
            <select data-auth-allow-input="true" name="installStatus">${statusOptions}</select>
          </label>
          <label>Complexity
            <select data-auth-allow-input="true" name="complexity">${complexityOptions}</select>
          </label>
          <label class="play-readiness-form-wide">Notes
            <input data-auth-allow-input="true" name="notes" type="text" placeholder="What did you get done?" />
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" data-action="closePlayReadinessModal">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Rep</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  wireScriptOverlayDismiss(overlay);
  overlay.querySelector("#playReadinessRepForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    savePlayReadinessRepForPlay(play, event.currentTarget, context);
  });
  overlay.querySelector("select[name='repType']")?.focus();
}

function openPlayReadinessRepModal(index) {
  const play = getPlayReadinessScriptPlay(index);
  openPlayReadinessRepModalForPlay(play, { source: "script", index });
}

function openPlayReadinessPlaybookRepModal(index) {
  const play = getPlayReadinessPlaybookPlay(index);
  openPlayReadinessRepModalForPlay(play, { source: "playbook", index });
}

function savePlayReadinessRepForPlay(play, form, context = {}) {
  if (!play || !form || !isPlayReadinessCoachRole()) return;
  const data = new FormData(form);
  const repType = getPlayReadinessRepType(data.get("repType"));
  const actualReps = Math.max(1, parseInt(data.get("actualReps"), 10) || 1);
  const weightedValue = repType.weight * actualReps;
  upsertPlayReadinessRecord(play, (record) => {
    record.installStatus = normalizePlayReadinessInstallStatus(data.get("installStatus"));
    record.complexity = normalizePlayReadinessComplexity(data.get("complexity"));
    record.reps = Array.isArray(record.reps) ? record.reps : [];
    record.reps.push({
      id: createPlayId("rep"),
      date: String(data.get("date") || new Date().toISOString().slice(0, 10)),
      repType: repType.id,
      repLabel: repType.label,
      weight: repType.weight,
      actualReps,
      weightedValue,
      notes: String(data.get("notes") || "").trim(),
      createdAt: new Date().toISOString(),
    });
  });
  closePlayReadinessModal();
  refreshPlayReadinessSurfaces(context.source);
  showToast(`Added ${formatPlayReadinessNumber(weightedValue)} weighted reps.`, {
    type: "success",
    duration: 2200,
  });
}

function savePlayReadinessRep(index, form) {
  const play = getPlayReadinessScriptPlay(index);
  savePlayReadinessRepForPlay(play, form, { source: "script", index });
}

function openPlayReadinessActionModalForPlay(play, context = {}) {
  if (!play || !isPlayReadinessCoachRole()) return;
  const playLabel = getPlayReadinessPlayLabel(play);
  closePlayReadinessModal();
  const overlay = document.createElement("div");
  overlay.id = "playReadinessModalOverlay";
  overlay.className = "modal-overlay show play-readiness-modal-overlay";
  overlay.dataset.action = "closePlayReadinessModalOverlay";
  overlay.innerHTML = `
    <div class="modal-content play-readiness-modal" role="dialog" aria-modal="true" aria-labelledby="playReadinessActionTitle">
      <div class="modal-header">
        <h3 id="playReadinessActionTitle">Add Action Report</h3>
        <button type="button" class="modal-close-btn" data-action="closePlayReadinessModal" aria-label="Close">x</button>
      </div>
      <form id="playReadinessActionForm" class="play-readiness-form">
        <p class="play-readiness-modal-sub">${escapeHtml(playLabel)}</p>
        <div class="play-readiness-form-grid">
          <label>Date
            <input data-auth-allow-input="true" name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" />
          </label>
          <label>Practice / Game Label
            <input data-auth-allow-input="true" name="label" type="text" placeholder="Team, scout, scrimmage..." />
          </label>
          <label>Defensive Look
            <input data-auth-allow-input="true" name="defensiveLook" type="text" placeholder="Front / pressure / coverage" />
          </label>
          <label>Situation
            <input data-auth-allow-input="true" name="situation" type="text" placeholder="3rd short, red zone..." />
          </label>
          <label>Result Score
            <select data-auth-allow-input="true" name="score">
              <option value="3">3 - Functional</option>
              <option value="1">1 - Disaster</option>
              <option value="2">2 - Poor</option>
              <option value="4">4 - Good</option>
              <option value="5">5 - Excellent / Explosive</option>
            </select>
          </label>
          <label>Yards
            <input data-auth-allow-input="true" name="yards" type="number" step="1" value="0" />
          </label>
          <label>Coach Confidence
            <select data-auth-allow-input="true" name="coachConfidence">
              <option>Medium</option>
              <option>Low</option>
              <option>High</option>
            </select>
          </label>
          <div class="play-readiness-checks play-readiness-form-wide">
            ${[
    ["explosive", "Explosive"],
    ["touchdown", "TD"],
    ["turnover", "Turnover"],
    ["sackTfl", "Sack/TFL"],
    ["missedAssignment", "Missed assignment"],
    ["penalty", "Penalty"],
  ].map(([name, label]) => `<label><input data-auth-allow-input="true" type="checkbox" name="${name}" /> ${label}</label>`).join("")}
          </div>
          <label class="play-readiness-form-wide">Notes
            <input data-auth-allow-input="true" name="notes" type="text" placeholder="Result, correction, coaching point..." />
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" data-action="closePlayReadinessModal">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Report</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  wireScriptOverlayDismiss(overlay);
  overlay.querySelector("#playReadinessActionForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    savePlayReadinessActionReportForPlay(play, event.currentTarget, context);
  });
  overlay.querySelector("select[name='score']")?.focus();
}

function openPlayReadinessActionModal(index) {
  const play = getPlayReadinessScriptPlay(index);
  openPlayReadinessActionModalForPlay(play, { source: "script", index });
}

function openPlayReadinessPlaybookActionModal(index) {
  const play = getPlayReadinessPlaybookPlay(index);
  openPlayReadinessActionModalForPlay(play, { source: "playbook", index });
}

function getPlayReadinessCurrentPresentationPlay() {
  if (typeof playPresentationState === "undefined") return null;
  const item = playPresentationState?.items?.[playPresentationState.index];
  return item?.play || null;
}

function openPlayReadinessPresentationActionModal() {
  const play = getPlayReadinessCurrentPresentationPlay();
  openPlayReadinessActionModalForPlay(play, { source: "presentation" });
}

function savePlayReadinessActionReportForPlay(play, form, context = {}) {
  if (!play || !form || !isPlayReadinessCoachRole()) return;
  const data = new FormData(form);
  upsertPlayReadinessRecord(play, (record) => {
    record.actionReports = Array.isArray(record.actionReports) ? record.actionReports : [];
    record.actionReports.push({
      id: createPlayId("action"),
      date: String(data.get("date") || new Date().toISOString().slice(0, 10)),
      label: String(data.get("label") || "").trim(),
      defensiveLook: String(data.get("defensiveLook") || "").trim(),
      situation: String(data.get("situation") || "").trim(),
      score: Math.max(1, Math.min(5, parseInt(data.get("score"), 10) || 3)),
      yards: parseInt(data.get("yards"), 10) || 0,
      explosive: data.has("explosive"),
      touchdown: data.has("touchdown"),
      turnover: data.has("turnover"),
      sackTfl: data.has("sackTfl"),
      missedAssignment: data.has("missedAssignment"),
      penalty: data.has("penalty"),
      notes: String(data.get("notes") || "").trim(),
      coachConfidence: String(data.get("coachConfidence") || "Medium"),
      createdAt: new Date().toISOString(),
    });
  });
  closePlayReadinessModal();
  refreshPlayReadinessSurfaces(context.source);
  showToast("Action report saved.", { type: "success", duration: 2200 });
}

function savePlayReadinessActionReport(index, form) {
  const play = getPlayReadinessScriptPlay(index);
  savePlayReadinessActionReportForPlay(play, form, { source: "script", index });
}

function getPlayReadinessQuickYards(score) {
  if (score >= 5) return 12;
  if (score >= 4) return 6;
  if (score >= 3) return 3;
  if (score >= 2) return -1;
  return -4;
}

function quickScorePlayReadiness(play, rawScore, context = {}) {
  if (!play || !isPlayReadinessCoachRole()) return;
  const score = Math.max(1, Math.min(5, parseInt(rawScore, 10) || 3));
  const date = new Date().toISOString().slice(0, 10);
  const repType = getPlayReadinessRepType("team_scout");
  const yards = getPlayReadinessQuickYards(score);
  const repId = createPlayId("quick_rep");
  const sourceLabel = context.source === "playbook"
    ? "Playbook"
    : context.source === "presentation"
      ? "Coach presentation"
      : "Script";

  upsertPlayReadinessRecord(play, (record) => {
    record.reps = Array.isArray(record.reps) ? record.reps : [];
    record.actionReports = Array.isArray(record.actionReports) ? record.actionReports : [];
    record.reps.push({
      id: repId,
      date,
      repType: repType.id,
      repLabel: repType.label,
      weight: repType.weight,
      actualReps: 1,
      weightedValue: repType.weight,
      notes: `Quick score from ${sourceLabel}`,
      createdAt: new Date().toISOString(),
    });
    record.actionReports.push({
      id: createPlayId("quick_action"),
      date,
      label: sourceLabel,
      quickScore: true,
      linkedRepId: repId,
      defensiveLook: [play.defFront || play.practiceFront, play.defCoverage || play.practiceCoverage]
        .filter(Boolean)
        .join(" / "),
      situation: [play.preferredDown ? `${play.preferredDown} down` : "", play.preferredDistance]
        .filter(Boolean)
        .join(" "),
      score,
      yards,
      explosive: score >= 5,
      touchdown: false,
      turnover: score <= 1,
      sackTfl: score <= 2,
      missedAssignment: score <= 2,
      penalty: false,
      notes: "",
      coachConfidence: score >= 4 ? "High" : score <= 2 ? "Low" : "Medium",
      createdAt: new Date().toISOString(),
    });
  });
  refreshPlayReadinessSurfaces(context.source);
  showToast(`Scored ${score}/5 for ${getPlayReadinessPlayLabel(play)}.`, {
    type: "success",
    duration: 1800,
  });
}

function quickPlayReadinessPlaybookScore(score) {
  quickScorePlayReadiness(getPlayReadinessPlaybookPlay(selectedRowIndex), score, {
    source: "playbook",
  });
}

function quickPlayReadinessScriptScore(score, element) {
  const idx = parseInt(element?.dataset?.idx, 10);
  quickScorePlayReadiness(getPlayReadinessScriptPlay(idx), score, {
    source: "script",
    index: idx,
  });
}

function quickPlayReadinessPresentationScore(score) {
  quickScorePlayReadiness(getPlayReadinessCurrentPresentationPlay(), score, {
    source: "presentation",
  });
}

function getPlayReadinessScoreConfidence(score) {
  return score >= 4 ? "High" : score <= 2 ? "Low" : "Medium";
}

function renderPlayReadinessReportScoreControls(playKey, report) {
  const reportId = report?.id || "";
  const activeScore = parseInt(report?.score, 10) || 0;
  return `
    <div class="play-readiness-report-score-controls" role="group"
      aria-label="Update score for ${escapeHtml(report?.label || "action report")}">
      ${[1, 2, 3, 4, 5]
        .map((score) => {
          const active = activeScore === score ? " active" : "";
          return `<button type="button" class="play-readiness-score-btn${active}"
            data-action="updatePlayReadinessReportScore"
            data-arg="${score}"
            data-play-key="${escapeHtml(playKey)}"
            data-report-id="${escapeHtml(reportId)}"
            aria-label="Update this report to ${score} out of 5">${score}</button>`;
        })
        .join("")}
      <button type="button" class="play-readiness-report-delete"
        data-action="deletePlayReadinessReport"
        data-play-key="${escapeHtml(playKey)}"
        data-report-id="${escapeHtml(reportId)}"
        aria-label="Delete this action report">Delete</button>
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
  const reportId = button?.dataset.reportId || "";
  const nextScore = Math.max(1, Math.min(5, parseInt(score, 10) || 3));
  if (!playKey || !reportId || !isPlayReadinessCoachRole()) return;

  const record = updatePlayReadinessRecordByKey(playKey, (draft) => {
    const report = (draft.actionReports || []).find((item) => item.id === reportId);
    if (!report) return;
    report.score = nextScore;
    report.coachConfidence = getPlayReadinessScoreConfidence(nextScore);
    report.updatedAt = new Date().toISOString();
    if (report.quickScore) {
      report.yards = getPlayReadinessQuickYards(nextScore);
      report.explosive = nextScore >= 5;
      report.turnover = nextScore <= 1;
      report.sackTfl = nextScore <= 2;
      report.missedAssignment = nextScore <= 2;
    }
  });
  if (!record) return;
  refreshPlayReadinessSurfaces();
  rerenderPlayReadinessHistoryModal(playKey);
  showToast(`Score updated to ${nextScore}/5.`, { type: "success", duration: 1600 });
}

async function deletePlayReadinessReport(element) {
  const button = element instanceof Element ? element : null;
  const playKey = button?.dataset.playKey || "";
  const reportId = button?.dataset.reportId || "";
  if (!playKey || !reportId || !isPlayReadinessCoachRole()) return;
  const ok = await showConfirm("Delete this action report score?", {
    title: "Delete Score",
    icon: "🗑️",
    confirmText: "Delete",
    cancelText: "Keep",
    danger: true,
  });
  if (!ok) return;

  const record = updatePlayReadinessRecordByKey(playKey, (draft) => {
    const reports = Array.isArray(draft.actionReports) ? draft.actionReports : [];
    const report = reports.find((item) => item.id === reportId);
    draft.actionReports = reports.filter((item) => item.id !== reportId);
    if (report?.linkedRepId && Array.isArray(draft.reps)) {
      draft.reps = draft.reps.filter((rep) => rep.id !== report.linkedRepId);
    }
  });
  if (!record) return;
  refreshPlayReadinessSurfaces();
  rerenderPlayReadinessHistoryModal(playKey);
  showToast("Score deleted.", { type: "success", duration: 1600 });
}

function showPlayReadinessHistoryForPlay(play) {
  if (!play || !isPlayReadinessCoachRole()) return;
  const summary = getPlayReadinessSummary(play);
  playReadinessHistoryContext = {
    key: summary.key,
    play,
  };
  const repRows = (summary.record.reps || [])
    .slice()
    .reverse()
    .slice(0, 12)
    .map(
      (rep) => `<div class="play-readiness-history-row">
        <strong>${escapeHtml(rep.date || "")}</strong>
        <span>${escapeHtml(rep.repLabel || rep.repType || "Rep")}</span>
        <span>${escapeHtml(formatPlayReadinessNumber(rep.weightedValue))} weighted / ${parseInt(rep.actualReps, 10) || 0} actual</span>
        <em>${escapeHtml(rep.notes || "")}</em>
      </div>`,
    )
    .join("") || `<div class="play-readiness-empty">No weighted reps logged yet.</div>`;
  const reportRows = (summary.record.actionReports || [])
    .slice()
    .reverse()
    .slice(0, 12)
    .map(
      (report) => `<div class="play-readiness-history-row">
        <strong>${escapeHtml(report.date || "")}</strong>
        <span>${escapeHtml(report.label || report.situation || "Action report")}</span>
        <span>Score ${parseInt(report.score, 10) || "-"} / ${parseInt(report.yards, 10) || 0} yd / ${escapeHtml(report.coachConfidence || "Medium")}</span>
        <em>${escapeHtml(report.notes || report.defensiveLook || "")}</em>
        ${renderPlayReadinessReportScoreControls(summary.key, report)}
      </div>`,
    )
    .join("") || `<div class="play-readiness-empty">No action reports logged yet.</div>`;

  closePlayReadinessModal();
  const overlay = document.createElement("div");
  overlay.id = "playReadinessModalOverlay";
  overlay.className = "modal-overlay show play-readiness-modal-overlay";
  overlay.dataset.action = "closePlayReadinessModalOverlay";
  overlay.innerHTML = `
    <div class="modal-content play-readiness-modal play-readiness-history-modal" role="dialog" aria-modal="true" aria-labelledby="playReadinessHistoryTitle">
      <div class="modal-header">
        <h3 id="playReadinessHistoryTitle">Readiness History</h3>
        <button type="button" class="modal-close-btn" data-action="closePlayReadinessModal" aria-label="Close">x</button>
      </div>
      <div class="play-readiness-history-summary">
        <div><strong>${summary.readinessPercent}%</strong><span>${escapeHtml(summary.readinessLabel)}</span></div>
        <div><strong>${escapeHtml(formatPlayReadinessNumber(summary.weightedReps))}</strong><span>Weighted reps</span></div>
        <div><strong>${summary.metrics.liveReps ? summary.metrics.averageScore.toFixed(1) : "-"}</strong><span>Live avg</span></div>
        <div><strong>${summary.confidenceScore}</strong><span>${escapeHtml(summary.confidenceLabel)}</span></div>
      </div>
      <div class="play-readiness-history-grid">
        <section>
          <h4>Weighted Rep Log</h4>
          ${repRows}
        </section>
        <section>
          <h4>Action Reports</h4>
          <div class="play-readiness-rate-grid">
            <span>Best ${summary.metrics.bestScore || "-"}</span>
            <span>Worst ${summary.metrics.worstScore || "-"}</span>
            <span>Explosive ${summary.metrics.explosiveRate}%</span>
            <span>TD ${summary.metrics.touchdownRate}%</span>
            <span>Negative ${summary.metrics.negativePlayRate}%</span>
            <span>MA ${summary.metrics.missedAssignmentRate}%</span>
            <span>Penalty ${summary.metrics.penaltyRate}%</span>
            <span>Turnover ${summary.metrics.turnoverRate}%</span>
            <span>Trend ${escapeHtml(summary.metrics.confidenceTrend)}</span>
          </div>
          ${reportRows}
        </section>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-action="closePlayReadinessModal">Close</button>
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
    const play = findPlayReadinessSeedPlay(seed) || {
      id: `sample_readiness_${seed.play.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      play: seed.play,
      formation: "Sample",
      personnel: "11",
      basePlay: seed.play,
      type: seed.play.includes("Screen") || seed.play.includes("Shot") ? "Pass" : "Run",
    };
    const key = getPlayReadinessKey(play);
    const date = new Date(Date.now() - seedIndex * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    store.records[key] = {
      installStatus: seed.status,
      complexity: seed.complexity,
      notes: "Sample readiness seed",
      playSnapshot: getPlayReadinessSnapshot(play),
      reps: [
        {
          id: createPlayId("seed_rep"),
          date,
          repType: "team_scout",
          repLabel: "Team vs scout",
          weight: 1,
          actualReps: seed.reps,
          weightedValue: seed.reps,
          notes: "Sample weighted reps",
          createdAt: new Date().toISOString(),
        },
      ],
      actionReports: seed.reports.map((score, reportIndex) => ({
        id: createPlayId("seed_action"),
        date,
        label: reportIndex === 0 ? "Sample scrimmage" : "Sample team period",
        defensiveLook: "Sample look",
        situation: reportIndex % 2 ? "3rd down" : "1st and 10",
        score,
        yards: score >= 4 ? 8 : score === 3 ? 4 : -2,
        explosive: score >= 5,
        touchdown: score >= 5 && seed.play !== "Screen",
        turnover: score <= 1,
        sackTfl: score <= 2,
        missedAssignment: score <= 2,
        penalty: false,
        notes: "Sample action report",
        coachConfidence: score >= 4 ? "High" : score <= 2 ? "Low" : "Medium",
        createdAt: new Date().toISOString(),
      })),
      updatedAt: new Date().toISOString(),
    };
  });
  savePlayReadinessStore(store);
  if (typeof requestRenderScript === "function") requestRenderScript();
  showToast("Seeded five sample play readiness records.", {
    type: "success",
    duration: 2600,
  });
}
