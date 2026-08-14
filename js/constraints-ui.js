// constraints-ui.js — Constraint panel UI, touch analysis rendering, and snapshot
// Extracted from constraints.js

function computeTouchAnalysis(playsArr) {
  if (!playsArr || playsArr.length === 0) {
    return {
      players: {},
      weighted: {},
      flat: {},
      byType: {},
      bySlot: {},
      hitZones: {},
      totalPlays: 0,
      totalWeightedPts: 0,
    };
  }

  const roleMap = CALLSHEET_CONSTRAINTS.roleMap;
  const weights = CALLSHEET_CONSTRAINTS.touchWeights || [3, 2, 1];

  // Accumulators
  const weighted = {}; // player → total weighted points
  const flat = {}; // player → flat play count (at least one KP slot)
  const byType = {}; // player → { Run: n, Pass: n, Screen: n, ... }
  const bySlot = {}; // player → { kp1: n, kp2: n, kp3: n }
  const hitZones = {}; // player → { zone: count }
  const playTypes = {}; // player → { typeName: Set<playIdx> } — to dedupe

  playsArr.forEach((play, idx) => {
    const cat = categorizePlay(play);

    // ── Weighted + flat touches from categorizePlay ──
    if (cat.weightedTouches) {
      Object.entries(cat.weightedTouches).forEach(([player, w]) => {
        weighted[player] = (weighted[player] || 0) + w;
      });
    }
    if (cat.touches) {
      cat.touches.forEach((player) => {
        flat[player] = (flat[player] || 0) + 1;
      });
    }

    // ── Per-slot breakdown (KP1 / KP2 / KP3) ──
    const kpSlots = [
      { pos: play.keyPlayer1, name: play.keyPlayerName1, slot: "kp1" },
      { pos: play.keyPlayer2, name: play.keyPlayerName2, slot: "kp2" },
      { pos: play.keyPlayer3, name: play.keyPlayerName3, slot: "kp3" },
    ];
    kpSlots.forEach(({ pos, name, slot }) => {
      let player = (name || "").trim();
      if (!player && pos) {
        const k = pos.trim().toUpperCase();
        player = roleMap[k] || "";
      }
      if (player) {
        if (!bySlot[player]) bySlot[player] = { kp1: 0, kp2: 0, kp3: 0 };
        bySlot[player][slot]++;
      }
    });

    // ── Per-type breakdown ──
    const typeName = (play.type || "Other").trim();
    kpSlots.forEach(({ pos, name }) => {
      let player = (name || "").trim();
      if (!player && pos) {
        const k = pos.trim().toUpperCase();
        player = roleMap[k] || "";
      }
      if (player) {
        if (!byType[player]) byType[player] = {};
        if (!playTypes[player]) playTypes[player] = {};
        if (!playTypes[player][typeName])
          playTypes[player][typeName] = new Set();
        // Only count once per play per player per type
        if (!playTypes[player][typeName].has(idx)) {
          playTypes[player][typeName].add(idx);
          byType[player][typeName] = (byType[player][typeName] || 0) + 1;
        }
      }
    });

    // ── QB runs ──
    if (cat.isQBRun) {
      const qbName = roleMap["QB"] || "Lucas";
      if (!byType[qbName]) byType[qbName] = {};
      byType[qbName]["QB Run"] = (byType[qbName]["QB Run"] || 0) + 1;
      if (!bySlot[qbName]) bySlot[qbName] = { kp1: 0, kp2: 0, kp3: 0 };
      bySlot[qbName].kp1++;
    }

    // ── Hit chart zones per player ──
    const hcSlots = [
      { name: play.keyPlayerName1, pos: play.keyPlayer1, hc: play.hitChart1 },
      { name: play.keyPlayerName2, pos: play.keyPlayer2, hc: play.hitChart2 },
      { name: play.keyPlayerName3, pos: play.keyPlayer3, hc: play.hitChart3 },
    ];
    hcSlots.forEach(({ name, pos, hc }) => {
      if (!hc || !hc.trim()) return;
      let player = (name || "").trim();
      if (!player && pos) {
        const k = pos.trim().toUpperCase();
        player = roleMap[k] || "";
      }
      if (player) {
        if (!hitZones[player]) hitZones[player] = {};
        const zone = hc.trim();
        hitZones[player][zone] = (hitZones[player][zone] || 0) + 1;
      }
    });
  });

  // ── Build sorted player summaries ──
  const totalWeightedPts = Object.values(weighted).reduce((s, v) => s + v, 0);
  const players = {};

  Object.keys(weighted)
    .sort((a, b) => weighted[b] - weighted[a])
    .forEach((name) => {
      const w = weighted[name] || 0;
      const f = flat[name] || 0;
      const pct = totalWeightedPts > 0 ? (w / totalWeightedPts) * 100 : 0;
      const slots = bySlot[name] || { kp1: 0, kp2: 0, kp3: 0 };
      const types = byType[name] || {};
      const zones = hitZones[name] || {};

      // Sort hit zones descending
      const sortedZones = Object.entries(zones).sort((a, b) => b[1] - a[1]);

      // Sort types descending
      const sortedTypes = Object.entries(types).sort((a, b) => b[1] - a[1]);

      players[name] = {
        name,
        weightedPts: w,
        pct,
        flatCount: f,
        slots,
        types: sortedTypes,
        hitZones: sortedZones,
        primaryRate:
          slots.kp1 + slots.kp2 + slots.kp3 > 0
            ? (slots.kp1 / (slots.kp1 + slots.kp2 + slots.kp3)) * 100
            : 0,
      };
    });

  return {
    players,
    weighted,
    flat,
    byType,
    bySlot,
    hitZones,
    totalPlays: playsArr.length,
    totalWeightedPts,
  };
}

function renderTouchAnalysis(analysis, opts) {
  if (
    !analysis ||
    !analysis.players ||
    Object.keys(analysis.players).length === 0
  )
    return "";

  const {
    title = "Touch Distribution",
    compact = false,
    idPrefix = "ta",
  } = opts || {};
  const playerArr = Object.values(analysis.players);
  const totalPts = analysis.totalWeightedPts || 0;

  // Bar colors per player (cycle through a curated palette)
  const palette = [
    "var(--color-primary, #667eea)",
    "var(--color-accent, #764ba2)",
    "var(--color-success, #28a745)",
    "var(--color-warning, #f0ad4e)",
    "var(--color-danger, #dc3545)",
    "var(--color-info, #17a2b8)",
  ];

  // Overview chips
  const summaryChips = playerArr
    .map((p, i) => {
      const color = palette[i % palette.length];
      return `<span class="ta-chip" style="--ta-color:${color}"><span class="ta-chip-dot"></span>${escapeHtml(p.name)} <b>${p.pct.toFixed(0)}%</b></span>`;
    })
    .join("");

  // Player rows with expandable detail
  const rows = playerArr
    .map((p, i) => {
      const color = palette[i % palette.length];
      const id = `${idPrefix}-${i}`;

      // Slot breakdown mini-bar
      const slotTotal = p.slots.kp1 + p.slots.kp2 + p.slots.kp3;
      const kp1Pct = slotTotal > 0 ? (p.slots.kp1 / slotTotal) * 100 : 0;
      const kp2Pct = slotTotal > 0 ? (p.slots.kp2 / slotTotal) * 100 : 0;
      const kp3Pct = slotTotal > 0 ? (p.slots.kp3 / slotTotal) * 100 : 0;

      const slotBar = `
        <div class="ta-slot-bar">
          <div class="ta-slot-seg ta-seg-kp1" style="--seg-width:${kp1Pct.toFixed(0)}%" title="KP1: ${p.slots.kp1}"></div>
          <div class="ta-slot-seg ta-seg-kp2" style="--seg-width:${kp2Pct.toFixed(0)}%" title="KP2: ${p.slots.kp2}"></div>
          <div class="ta-slot-seg ta-seg-kp3" style="--seg-width:${kp3Pct.toFixed(0)}%" title="KP3: ${p.slots.kp3}"></div>
        </div>`;

      const slotLabels = `
        <div class="ta-slot-labels">
          <span class="ta-slot-label ta-lbl-kp1">KP1: ${p.slots.kp1}</span>
          <span class="ta-slot-label ta-lbl-kp2">KP2: ${p.slots.kp2}</span>
          <span class="ta-slot-label ta-lbl-kp3">KP3: ${p.slots.kp3}</span>
        </div>`;

      // Play types
      const typeChips = p.types
        .map(
          ([t, n]) =>
            `<span class="ta-type-chip">${escapeHtml(t)} <b>${n}</b></span>`,
        )
        .join("");

      // Hit zones (top 6)
      let zoneHtml = "";
      if (!compact && p.hitZones.length > 0) {
        const zoneChips = p.hitZones
          .slice(0, 6)
          .map(
            ([z, n]) =>
              `<span class="ta-zone-chip">${escapeHtml(z)} <b>${n}</b></span>`,
          )
          .join("");
        const more =
          p.hitZones.length > 6
            ? `<span class="ta-zone-more">+${p.hitZones.length - 6} more</span>`
            : "";
        zoneHtml = `<div class="ta-detail-row"><span class="ta-detail-label">🎯 Hit Zones</span><div class="ta-detail-chips">${zoneChips}${more}</div></div>`;
      }

      return `
      <div class="ta-player-row" data-action="toggleTaDetail" data-arg="${id}">
        <span class="ta-player-dot" style="--ta-color:${color}"></span>
        <span class="ta-player-name">${escapeHtml(p.name)}</span>
        <div class="cr-dist-bar-track ta-bar">
          <div class="cr-dist-bar-fill" style="--fill-width:${p.pct.toFixed(1)}%;--fill-color:${color}"></div>
        </div>
        <span class="ta-player-pct">${p.pct.toFixed(0)}%</span>
        <span class="ta-player-pts">${Number.isInteger(p.weightedPts) ? p.weightedPts : p.weightedPts.toFixed(1)} pts</span>
        <span class="ta-player-flat">${p.flatCount} plays</span>
        <span class="ta-expand-arrow">›</span>
      </div>
      <div class="ta-detail hidden" id="${id}">
        <div class="ta-detail-row"><span class="ta-detail-label">🔵 Priority Slots</span>${slotBar}${slotLabels}</div>
        <div class="ta-detail-row"><span class="ta-detail-label">🏃 Play Types</span><div class="ta-detail-chips">${typeChips || '<span class="ta-none">—</span>'}</div></div>
        ${zoneHtml}
      </div>`;
    })
    .join("");

  return `
  <div class="ta-panel">
    <div class="ta-title">🏈 ${escapeHtml(title)}</div>
    <div class="ta-summary">${summaryChips}</div>
    <div class="ta-total">${analysis.totalPlays} plays · ${totalPts} weighted pts</div>
    <div class="ta-rows">${rows}</div>
  </div>`;
}

function toggleTaDetail(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const isOpen = !el.classList.contains("hidden");
  el.classList.toggle("hidden", isOpen);
  const row = el.previousElementSibling;
  if (row) {
    const arrow = row.querySelector(".ta-expand-arrow");
    if (arrow) arrow.textContent = isOpen ? "›" : "⌄";
  }
}

function runConstraintCheck(options = {}) {
  if (!CONSTRAINTS_ENABLED) {
    showToast("Constraints module is disabled (CONSTRAINTS_ENABLED = false)");
    return;
  }

  // The report is a true modal review surface: it has enough interactive
  // content that letting the Call Sheet remain touch-scrollable behind it is
  // both confusing and unsafe on a tablet. The shared layer owns that
  // lifecycle (background lock, focus loop, safe area, Escape, and return
  // focus) while the report body remains this dialog's only scroll region.
  const panel = document.getElementById("constraintPanel");
  if (!panel) return;
  panel.removeAttribute("inert");
  panel.setAttribute("aria-hidden", "false");
  panel.classList.add("visible");
  const body = document.getElementById("constraintPanelBody");
  const closeButton = panel.querySelector(".cr-close-btn");
  const returnFocus = options?.returnFocus instanceof HTMLElement
    ? options.returnFocus
    : null;
  if (panel.dataset.layerOpen !== "true") {
    openLayer(panel, {
      id: "constraintPanel",
      scrollElement: body || panel,
      blocking: true,
      initialFocus: closeButton || panel,
      returnFocus,
      onEscape: () => closeConstraintPanel(),
    });
  }

  try {
    const report = evaluateCallSheet(callSheet);
    renderConstraintPanel(report);
  } catch (err) {
    console.error("Constraint check failed:", err);
    const body = document.getElementById("constraintPanelBody");
    if (body)
      body.innerHTML = `<p class="cr-loading">⚠️ Evaluation failed — check console for details.</p>`;
  }
}

function closeConstraintPanel(options = {}) {
  const panel = document.getElementById("constraintPanel");
  if (!panel) return;
  closeLayer("constraintPanel", options);
  panel.classList.remove("visible");
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("inert", "");
}

function renderConstraintPanel(report) {
  const body = document.getElementById("constraintPanelBody");
  if (!body) return;

  const {
    overallScore,
    bucketReports,
    summary,
    globalWeightedTouches,
    globalFlatTouches,
  } = report;

  // Score colour
  const scoreClass =
    overallScore >= 80
      ? "constraint-score-ok"
      : overallScore >= 50
        ? "constraint-score-warn"
        : "constraint-score-error";

  // Build bucket rows — order: all non-empty first, then empty
  const sorted = Object.entries(bucketReports).sort((a, b) => {
    const order = { error: 0, warn: 1, ok: 2, empty: 3 };
    return (order[a[1].status] ?? 9) - (order[b[1].status] ?? 9);
  });

  const rows = sorted
    .map(([key, r]) => {
      const icon =
        r.status === "ok"
          ? "✅"
          : r.status === "warn"
            ? "⚠️"
            : r.status === "empty"
              ? "—"
              : "🚨";

      // Find human-readable bucket name
      const catDef = CALLSHEET_CATEGORIES?.find((c) => c.id === key);
      const name = catDef ? catDef.name : key;
      const safeKey = escapeHtml(key);

      return `
      <div class="cr-bucket-row cr-status-${r.status}" data-bucket="${safeKey}" data-action="toggleConstraintDetail" data-arg="${safeKey}">
        <span class="cr-bucket-icon">${icon}</span>
        <span class="cr-bucket-name">${escapeHtml(name)}</span>
        <span class="cr-bucket-count">${r.total} plays</span>
        <span class="cr-bucket-score">${r.status !== "empty" ? r.score + "%" : ""}</span>
        <span class="cr-bucket-arrow">›</span>
      </div>
      <div class="cr-bucket-detail hidden" id="cr-detail-${safeKey}">
        ${renderBucketDetail(key, r)}
      </div>
    `;
    })
    .join("");

  // Global touch distribution — rich analysis panel
  const allCsPlays = Object.values(callSheet).flatMap((b) => [
    ...(b.left || []),
    ...(b.right || []),
  ]);
  const touchAnalysis = computeTouchAnalysis(allCsPlays);
  const distHtml = renderTouchAnalysis(touchAnalysis, {
    title: "Touch Distribution",
    idPrefix: "cr-ta",
  });

  body.innerHTML = `
    <div class="cr-overview">
      <div class="cr-score ${scoreClass}">${overallScore}<span class="cr-score-pct">%</span></div>
      <div class="cr-summary">${summary}</div>
    </div>
    ${distHtml}
    <div class="cr-bucket-list">${rows || "<p class='cr-empty'>Call sheet is empty.</p>"}</div>
  `;
}

function renderBucketDetail(key, report) {
  if (report.status === "empty") {
    return `<p class="cr-detail-empty">Bucket is empty — add plays to evaluate.</p>`;
  }

  const philHtml = report.philosophy
    ? `<div class="cr-philosophy">💡 ${escapeHtml(report.philosophy)}</div>`
    : "";

  const statsHtml = `
    <div class="cr-stats">
      <span class="cr-stat"><b>${report.runCount}</b> Run</span>
      <span class="cr-stat"><b>${report.throwCount}</b> Throw</span>
      <span class="cr-stat"><b>${report.screenCount}</b> Screen</span>
      <span class="cr-stat"><b>${report.shotCount}</b> Shot</span>
    </div>
  `;

  // Per-bucket touch distribution — rich analysis
  const bucketPlays = callSheet[key]
    ? [...(callSheet[key].left || []), ...(callSheet[key].right || [])]
    : [];
  const bucketAnalysis = computeTouchAnalysis(bucketPlays);
  const bucketDistHtml = renderTouchAnalysis(bucketAnalysis, {
    compact: true,
    idPrefix: `cr-ta-${key}`,
  });

  const errorItems = report.errors
    .map((e) => `<li class="cr-item cr-item-error">${escapeHtml(e)}</li>`)
    .join("");
  const warnItems = report.warnings
    .map((w) => `<li class="cr-item cr-item-warn">${escapeHtml(w)}</li>`)
    .join("");
  const okItems = report.successes
    .map((s) => `<li class="cr-item cr-item-ok">${escapeHtml(s)}</li>`)
    .join("");

  const listHtml = `<ul class="cr-check-list">${errorItems}${warnItems}${okItems}</ul>`;

  const safeKey = escapeHtml(key);
  const suggestBtn =
    report.errors.length > 0
      ? `<button class="btn btn-sm btn-primary cr-suggest-btn" data-action="showSuggestions" data-arg="${safeKey}">💡 Suggest Fixes</button>`
      : "";

  const suggDiv = `<div class="cr-suggestions hidden" id="cr-suggest-${safeKey}"></div>`;

  return (
    philHtml + statsHtml + bucketDistHtml + listHtml + suggestBtn + suggDiv
  );
}

function toggleConstraintDetail(key) {
  const el = document.getElementById(`cr-detail-${key}`);
  if (!el) return;
  const isOpen = !el.classList.contains("hidden");
  el.classList.toggle("hidden", isOpen);
  // Update arrow
  const row = document.querySelector(`.cr-bucket-row[data-bucket="${key}"]`);
  if (row) {
    const arrow = row.querySelector(".cr-bucket-arrow");
    if (arrow) arrow.textContent = isOpen ? "›" : "⌄";
  }
}

function showSuggestions(key) {
  const bucket = callSheet[key];
  if (!bucket) return;
  if (typeof plays === "undefined" || !Array.isArray(plays)) return;

  const report = evaluateBucket(key, bucket);
  const suggestions = suggestFixesForBucket(report, plays);

  const el = document.getElementById(`cr-suggest-${key}`);
  if (!el) return;

  if (suggestions.length === 0) {
    el.innerHTML = `<p class="cr-sug-empty">No specific play suggestions available — check your playbook mapping.</p>`;
  } else {
    el.innerHTML = suggestions
      .map(
        (group) => `
      <div class="cr-sug-group">
        <div class="cr-sug-label">➕ ${escapeHtml(group.label)}</div>
        ${group.plays
            .map(
              (p) => `
          <div class="cr-sug-play" title="${escapeHtml([p.playTag1, p.playTag2].filter(Boolean).join(", "))}">
            <span class="cr-sug-type">${escapeHtml(p.type || "")}</span>
            <span class="cr-sug-call">${typeof getFullCall === "function" ? getFullCall(p) : escapeHtml((p.formation || "") + " " + (p.play || ""))}</span>
          </div>
        `,
            )
            .join("")}
      </div>
    `,
      )
      .join("");
  }

  el.classList.toggle("hidden");
}

function saveConstraintsSnapshot() {
  try {
    storageManager.set(STORAGE_KEYS.CALLSHEET_CONSTRAINTS, {
      version: 1,
      savedAt: new Date().toISOString(),
      rulesVersion: Object.keys(CALLSHEET_CONSTRAINTS.bucketRules).length,
    });
  } catch (e) {
    console.warn("Failed to save constraints snapshot:", e);
  }
}
