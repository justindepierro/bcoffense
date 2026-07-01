// gameplan-health.js — Game plan health, touch tracker, spotlight, coverage matrix, tendency mirror
// Extracted from gameplan-smart.js

function _gpComputePlanHealth(board, draftedPlays) {
  const drafted = Array.isArray(draftedPlays)
    ? draftedPlays
    : _gpAllDraftedPlays(board);
  if (drafted.length === 0) {
    return { score: 0, label: "No plan yet", parts: [] };
  }
  const parts = [];

  // 1. Target completion (40%)
  const targets = board.targets || {};
  const targetIds = Object.keys(targets).filter((k) => Number(targets[k]) > 0);
  let targetScore = 100;
  if (targetIds.length > 0) {
    let met = 0;
    targetIds.forEach((k) => {
      const t = Number(targets[k]) || 0;
      const c = (board.assignments[k] || []).length;
      if (c >= t) met += 1;
    });
    targetScore = Math.round((met / targetIds.length) * 100);
  }
  parts.push({
    key: "targets", label: "Targets met", score: targetScore, weight: 0.4,
    detail: targetIds.length === 0 ? "No targets set" : `${targetIds.filter((k) => (board.assignments[k] || []).length >= (Number(targets[k]) || 0)).length} / ${targetIds.length}`
  });

  // 2. Scenario coverage (30%)
  let covered = 0;
  GP_COVERAGE_SCENARIOS.forEach((s) => {
    const count = drafted.filter(s.match).length;
    if (count >= 3) covered += 1;
    else if (count >= 1) covered += 0.5;
  });
  const scenarioScore = Math.round((covered / GP_COVERAGE_SCENARIOS.length) * 100);
  parts.push({
    key: "scenarios", label: "Scenario coverage", score: scenarioScore, weight: 0.3,
    detail: `${Math.round(covered)} / ${GP_COVERAGE_SCENARIOS.length} scenarios`
  });

  // 3. Type balance (20%)
  const typeCounts = {};
  drafted.forEach((p) => {
    const t = GP_TYPE_ALIASES[p.type] || p.type || "Other";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const typesPresent = Object.keys(typeCounts).length;
  const balanceScore = Math.min(100, typesPresent * 20); // 5+ types = 100
  parts.push({
    key: "balance", label: "Type variety", score: balanceScore, weight: 0.2,
    detail: `${typesPresent} types in mix`
  });

  // 4. Holding cleared (10%)
  const holdingCount = (board.assignments[GP_HOLDING_ID] || []).length;
  const holdingScore = holdingCount === 0 ? 100 : Math.max(0, 100 - holdingCount * 10);
  parts.push({
    key: "holding", label: "Holding cleared", score: holdingScore, weight: 0.1,
    detail: holdingCount === 0 ? "Empty" : `${holdingCount} unrouted`
  });

  const score = Math.round(parts.reduce((sum, p) => sum + (p.score * p.weight), 0));
  let label = "Excellent";
  if (score < 40) label = "Needs work";
  else if (score < 65) label = "In progress";
  else if (score < 85) label = "Solid";
  return { score, label, parts };
}

function _gpRenderHealthGauge(board, draftedPlays) {
  const h = _gpComputePlanHealth(board, draftedPlays);
  const status = h.score >= 85 ? "ok" : h.score >= 65 ? "good" : h.score >= 40 ? "warn" : "low";
  // SVG circular progress
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (h.score / 100) * c;
  return `
    <button class="gp-health" data-action="openGamePlanHealthDetail"
      title="Plan Health: ${h.score}/100 — click for breakdown">
      <svg class="gp-health-svg" viewBox="0 0 50 50" aria-hidden="true">
        <circle class="gp-health-track" cx="25" cy="25" r="${r}" />
        <circle class="gp-health-fill gp-health-${status}" cx="25" cy="25" r="${r}"
          stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" />
      </svg>
      <div class="gp-health-text">
        <div class="gp-health-score">${h.score}</div>
        <div class="gp-health-label">${escapeHtml(h.label)}</div>
      </div>
    </button>`;
}

function openGamePlanHealthDetail() {
  const board = _gpEnsureBoard();
  const h = _gpComputePlanHealth(board);
  const rows = h.parts.map((p) => {
    const status = p.score >= 85 ? "ok" : p.score >= 65 ? "good" : p.score >= 40 ? "warn" : "low";
    return `
      <div class="gp-health-row">
        <div class="gp-health-row-label">
          <strong>${escapeHtml(p.label)}</strong>
          <span class="gp-health-row-detail">${escapeHtml(p.detail)}</span>
        </div>
        <div class="gp-health-row-bar">
          <div class="gp-health-row-fill gp-health-${status}" style="width:${p.score}%"></div>
        </div>
        <div class="gp-health-row-score">${p.score}</div>
      </div>`;
  }).join("");
  const html = `
    <div class="gp-health-detail">
      <div class="gp-health-detail-summary gp-health-${h.score >= 85 ? "ok" : h.score >= 65 ? "good" : h.score >= 40 ? "warn" : "low"}">
        <div class="gp-health-detail-score">${h.score}</div>
        <div class="gp-health-detail-label">${escapeHtml(h.label)}</div>
      </div>
      <div class="gp-health-rows">${rows}</div>
      <p class="gp-health-explainer">
        Score is a weighted blend of how many bucket targets are met (40%),
        coverage across the 9 game scenarios (30%), variety of play types (20%),
        and whether the Holding box is cleared (10%).
      </p>
    </div>`.replace(/\n\s+/g, " ");
  showModal(html, { title: "🩺 Plan Health Breakdown", icon: "🩺" });
}

function _gpComputeTouchCounts(board, draftedPlays) {
  const drafted = Array.isArray(draftedPlays)
    ? draftedPlays
    : _gpAllDraftedPlays(board);
  const counts = {}; // { displayName: { count, positions: Set } }
  drafted.forEach((p) => {
    [1, 2, 3].forEach((i) => {
      const pos = p[`keyPlayer${i}`] || "";
      const name = p[`keyPlayerName${i}`] || "";
      const display = (name && name.trim()) || (pos && pos.trim()) || "";
      if (!display) return;
      if (!counts[display]) counts[display] = { count: 0, positions: new Set() };
      counts[display].count += 1;
      if (pos) counts[display].positions.add(pos);
    });
  });
  return counts;
}

function _gpRenderTouchTracker(board, draftedPlays) {
  const counts = _gpComputeTouchCounts(board, draftedPlays);
  const entries = Object.entries(counts);
  if (entries.length === 0) return "";
  entries.sort((a, b) => b[1].count - a[1].count);
  const max = entries[0][1].count || 1;
  const spot = _gpFilters.spotlight;
  const tiles = entries.map(([name, info]) => {
    const heat = Math.round((info.count / max) * 100);
    const positions = Array.from(info.positions).join(", ");
    const isActive = spot && spot.kind === "player" && spot.name === name;
    return `
      <button class="gp-touch-tile${isActive ? " is-active" : ""}" data-action="filterGamePlanByPlayer"
        data-arg="${escapeHtml(name)}"
        title="${escapeHtml(name)} — ${info.count} touches${positions ? ` • ${escapeHtml(positions)}` : ""}. Click to spotlight buckets featuring this player.">
        <div class="gp-touch-name">${escapeHtml(name)}</div>
        <div class="gp-touch-count">${info.count}</div>
        <div class="gp-touch-bar">
          <div class="gp-touch-bar-fill" style="width:${heat}%"></div>
        </div>
      </button>`;
  }).join("");
  return `
    <details class="gp-touch-tracker" ${entries.length <= 8 ? "open" : ""}>
      <summary>👥 Touch Tracker <span class="gp-touch-hint">${entries.length} player${entries.length === 1 ? "" : "s"} • click a tile to spotlight buckets</span></summary>
      <div class="gp-touch-grid">${tiles}</div>
    </details>`;
}

function filterGamePlanByPlayer(name) {
  if (!name) return;
  const spot = _gpFilters.spotlight;
  const alreadyActive = spot && spot.kind === "player" && spot.name === name;
  if (alreadyActive) {
    _gpFilters.spotlight = null;
    _gpFilters.search = "";
  } else {
    _gpFilters.spotlight = { kind: "player", name };
    _gpFilters.search = name;
  }
  renderGamePlan();
  const search = document.getElementById("gpSearch");
  if (search) search.value = _gpFilters.search;
}

function _gpPlayMatchesSpotlight(play) {
  const spot = _gpFilters.spotlight;
  if (!spot || !play) return false;
  if (spot.kind === "scenario") {
    const sc = GP_COVERAGE_SCENARIOS.find((s) => s.id === spot.id);
    return !!(sc && sc.match(play));
  }
  if (spot.kind === "player") {
    const target = (spot.name || "").trim().toLowerCase();
    if (!target) return false;
    const names = [play.keyPlayerName1, play.keyPlayerName2, play.keyPlayerName3]
      .filter(Boolean).map((n) => String(n).trim().toLowerCase());
    return names.includes(target);
  }
  return false;
}

function clearGamePlanSpotlight() {
  if (!_gpFilters.spotlight) return;
  const spot = _gpFilters.spotlight;
  _gpFilters.spotlight = null;
  // Also clear the library filter side-effects so the library returns to normal.
  if (spot.kind === "scenario") {
    const sc = GP_COVERAGE_SCENARIOS.find((s) => s.id === spot.id);
    if (sc) Object.keys(sc.filters).forEach((k) => { _gpFilters[k] = ""; });
  } else if (spot.kind === "player") {
    _gpFilters.search = "";
  }
  renderGamePlan();
}

function openGamePlanCoverageMatrix() {
  const board = _gpEnsureBoard();
  const visibleBoxes = [...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
  // Compute matrix
  let max = 0;
  const matrix = visibleBoxes.map((b) => {
    const list = board.assignments[b.id] || [];
    const cells = GP_COVERAGE_SCENARIOS.map((s) => {
      const c = list.filter(s.match).length;
      if (c > max) max = c;
      return c;
    });
    return { box: b, cells, total: list.length };
  });
  const headerCells = GP_COVERAGE_SCENARIOS.map((s) =>
    `<th class="gp-cmx-col-head" title="${escapeHtml(s.label)}">${escapeHtml(s.icon || "")}<br>${escapeHtml(s.shortLabel || s.label)}</th>`,
  ).join("");
  const bodyRows = matrix.map((row) => {
    const cells = row.cells.map((c, i) => {
      const intensity = max > 0 ? c / max : 0;
      const cls = c === 0 ? "gp-cmx-zero" : intensity >= 0.66 ? "gp-cmx-hot" : intensity >= 0.33 ? "gp-cmx-warm" : "gp-cmx-cool";
      return `<td class="gp-cmx-cell ${cls}" title="${escapeHtml(row.box.label)} × ${escapeHtml(GP_COVERAGE_SCENARIOS[i].label)}: ${c}">${c}</td>`;
    }).join("");
    return `
      <tr>
        <th class="gp-cmx-row-head">${escapeHtml(row.box.label)}</th>
        ${cells}
        <td class="gp-cmx-total">${row.total}</td>
      </tr>`;
  }).join("");
  const html = `
    <div class="gp-cmx">
      <p class="gp-cmx-help">Heatmap of how each box covers the 9 game scenarios. Hot cells = strong coverage, gray = no plays match. Use this to spot gaps.</p>
      <div class="gp-cmx-scroll">
        <table class="gp-cmx-table">
          <thead><tr><th class="gp-cmx-corner">Box \\ Scenario</th>${headerCells}<th class="gp-cmx-col-head">Total</th></tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </div>`.replace(/\n\s+/g, " ");
  showModal(html, { title: "🌡️ Coverage Matrix", icon: "🌡️" });
}

function _gpResolveOpponentTendencies() {
  let opponents =
    typeof tendenciesOpponents !== "undefined" &&
    Array.isArray(tendenciesOpponents)
      ? tendenciesOpponents
      : [];
  if (opponents.length === 0 && typeof storageManager !== "undefined" && typeof STORAGE_KEYS !== "undefined") {
    opponents = storageManager.get(STORAGE_KEYS.DEFENSIVE_TENDENCIES, []);
  }
  if (opponents.length === 0) return null;
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const oppName = gw && gw.opponentName ? gw.opponentName : null;
  if (oppName) {
    const exact = opponents.find((o) => o.name && o.name.toLowerCase() === oppName.toLowerCase());
    if (exact) return exact;
  }
  // Fallback: current opponent index
  const currentIndex =
    typeof tendenciesCurrentOpponent === "number"
      ? tendenciesCurrentOpponent
      : null;
  if (currentIndex !== null && opponents[currentIndex]) {
    return opponents[currentIndex];
  }
  return opponents[0];
}

function openGamePlanTendencyMirror() {
  const opp = _gpResolveOpponentTendencies();
  if (!opp || !Array.isArray(opp.plays) || opp.plays.length === 0) {
    showToast("No defensive tendencies recorded for this opponent. Chart some on the Opponent Scout tab first.", { type: "warning", duration: 4000 });
    return;
  }
  const board = _gpEnsureBoard();
  const drafted = _gpAllDraftedPlays(board);

  const tally = (rows, key) => {
    const m = new Map();
    rows.forEach((r) => {
      const v = (r[key] || "").toString().trim();
      if (!v) return;
      m.set(v, (m.get(v) || 0) + 1);
    });
    return m;
  };
  const pct = (count, total) => total === 0 ? 0 : Math.round((count / total) * 100);

  // Defensive front + coverage seen most by opponent
  const dFront = tally(opp.plays, "defFront");
  const dCov = tally(opp.plays, "defCoverage");
  const dBlitz = tally(opp.plays, "defBlitz");
  const oppTotal = opp.plays.length;
  const topN = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  const frontTop = topN(dFront, 4);
  const covTop = topN(dCov, 4);
  const blitzTop = topN(dBlitz, 4);

  // Offensive coverage in plan
  const oFront = tally(drafted, "practiceFront");
  const oCov = tally(drafted, "practiceCoverage");
  const oBlitz = tally(drafted, "practiceBlitz");
  const planTotal = drafted.length;

  const renderMatchRow = (oppMap, planMap, oppKey, planKey, total, totalPlan) => {
    const items = topN(oppMap, 5);
    if (items.length === 0) return `<li class="gp-tm-empty">No data</li>`;
    return items.map(([val, cnt]) => {
      const oppPct = pct(cnt, total);
      const planCnt = planMap.get(val) || 0;
      const planPct = pct(planCnt, totalPlan);
      const status = planCnt === 0 ? "low" : planPct >= oppPct * 0.6 ? "ok" : "warn";
      return `
        <li class="gp-tm-row gp-tm-${status}">
          <span class="gp-tm-label">${escapeHtml(val)}</span>
          <span class="gp-tm-bars">
            <span class="gp-tm-bar-opp" style="width:${oppPct}%" title="Opp shows ${cnt} (${oppPct}%)"></span>
            <span class="gp-tm-bar-plan" style="width:${planPct}%" title="Plan covers ${planCnt} (${planPct}%)"></span>
          </span>
          <span class="gp-tm-counts">${cnt} / ${planCnt}</span>
        </li>`;
    }).join("");
  };

  // Down/distance run-pass tendencies (opp)
  const ddBuckets = ["1-Any", "2-Short", "2-Medium", "2-Long", "3-Short", "3-Medium", "3-Long"];
  const bucketOf = (down, dist) => {
    const d = String(down || "").trim();
    const distNum = parseInt(dist, 10);
    let band = "Medium";
    if (!Number.isNaN(distNum)) {
      if (distNum <= 3) band = "Short";
      else if (distNum >= 8) band = "Long";
    } else if (typeof dist === "string") {
      const s = dist.toLowerCase();
      if (s.includes("short")) band = "Short";
      else if (s.includes("long") || s.includes("20+") || s.includes("16-20") || s.includes("11-15")) band = "Long";
    }
    if (d === "1") return "1-Any";
    if (d === "2") return `2-${band}`;
    if (d === "3") return `3-${band}`;
    return null;
  };
  const ddRows = ddBuckets.map((bucket) => {
    const matching = opp.plays.filter((p) => bucketOf(p.down, p.distance) === bucket);
    if (matching.length === 0) return null;
    const blitzes = matching.filter((p) => p.defBlitz && p.defBlitz !== "None").length;
    const blitzPct = pct(blitzes, matching.length);
    return `
      <li class="gp-tm-dd-row">
        <span class="gp-tm-dd-label">${escapeHtml(bucket)}</span>
        <span class="gp-tm-dd-count">${matching.length} snaps</span>
        <span class="gp-tm-dd-blitz ${blitzPct >= 40 ? "gp-tm-warn" : ""}">${blitzPct}% blitz</span>
      </li>`;
  }).filter(Boolean).join("");

  const html = `
    <div class="gp-tm">
      <div class="gp-tm-summary">
        <strong>${escapeHtml(opp.name || "Opponent")}</strong> — ${oppTotal} charted snap${oppTotal === 1 ? "" : "s"}
        · Plan has ${planTotal} drafted play${planTotal === 1 ? "" : "s"}
      </div>
      <p class="gp-tm-help">Compares opponent's most-shown defensive looks (top bar) vs how often your drafted plays practice that look (bottom bar). Yellow = under-prepped, red = uncovered.</p>
      <div class="gp-tm-grid">
        <section>
          <h4>🛡️ Fronts seen</h4>
          <ul class="gp-tm-list">${renderMatchRow(dFront, oFront, "defFront", "practiceFront", oppTotal, planTotal)}</ul>
        </section>
        <section>
          <h4>👁️ Coverages seen</h4>
          <ul class="gp-tm-list">${renderMatchRow(dCov, oCov, "defCoverage", "practiceCoverage", oppTotal, planTotal)}</ul>
        </section>
        <section>
          <h4>🔥 Blitz/Pressure</h4>
          <ul class="gp-tm-list">${renderMatchRow(dBlitz, oBlitz, "defBlitz", "practiceBlitz", oppTotal, planTotal)}</ul>
        </section>
        ${ddRows ? `
        <section>
          <h4>📊 Down & Distance pressure</h4>
          <ul class="gp-tm-dd">${ddRows}</ul>
        </section>` : ""}
      </div>
    </div>`.replace(/\n\s+/g, " ");
  showModal(html, { title: "🪞 Tendency Mirror", icon: "🪞" });
}
