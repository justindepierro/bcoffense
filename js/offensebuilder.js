// ============ Offense Builder ============
// A brainstorming / planning tab that lets coaches:
//   • See base concepts and rate them by priority (star rating)
//   • Drill down into a concept to see all plays, constraints, and counters
//   • Identify gaps (missing constraints, thin personnel, key-player dependencies)
//   • Get smart recommendations for building out the offense

// ── Storage ────────────────────────────────────────────────────────
const OB_STORAGE_KEY = "ob_conceptRatings"; // { conceptName: 1-5 }

function obLoadRatings() {
  return storageManager.get(OB_STORAGE_KEY, {});
}

function obSaveRatings(ratings) {
  storageManager.set(OB_STORAGE_KEY, ratings);
}

// ── Concept extraction ─────────────────────────────────────────────
/**
 * Build a rich map of base concepts from the playbook.
 * Each concept bundles all underlying plays, their constraints, key players,
 * formations, personnel, play types (run/pass), etc.
 *
 * @returns {Map<string, Object>} conceptName → { plays, types, formations, ... }
 */
function obBuildConceptMap() {
  const map = new Map();
  if (!plays || plays.length === 0) return map;

  plays.forEach((p) => {
    const base = (p.basePlay || "").trim();
    if (!base) return;

    let entry = map.get(base);
    if (!entry) {
      entry = {
        name: base,
        plays: [],
        types: new Set(),
        formations: new Set(),
        personnel: new Set(),
        motions: new Set(),
        shifts: new Set(),
        protections: new Set(),
        tempos: new Set(),
        constraints: new Set(),
        deadVs: new Set(),
        keyPositions: new Set(),
        keyPlayers: new Map(), // position → Set of names
        playNames: new Set(),
      };
      map.set(base, entry);
    }

    entry.plays.push(p);
    if (p.type) entry.types.add(p.type);
    if (p.formation) entry.formations.add(p.formation.trim());
    if (p.personnel) entry.personnel.add(p.personnel.trim());
    if (p.motion) entry.motions.add(p.motion.trim());
    if (p.shift) entry.shifts.add(p.shift.trim());
    if (p.protection) entry.protections.add(p.protection.trim());
    if (p.tempo) entry.tempos.add(p.tempo.trim());
    if (p.play) entry.playNames.add(p.play.trim());

    [p.constraint1, p.constraint2, p.constraint3]
      .filter(Boolean)
      .forEach((c) => entry.constraints.add(c.trim()));

    if (p.deadVs) entry.deadVs.add(p.deadVs.trim());

    // Key players (positions + names)
    [
      { pos: p.keyPlayer1, name: p.keyPlayerName1 },
      { pos: p.keyPlayer2, name: p.keyPlayerName2 },
      { pos: p.keyPlayer3, name: p.keyPlayerName3 },
    ].forEach(({ pos, name }) => {
      if (pos && pos.trim()) {
        const posKey = pos.trim();
        entry.keyPositions.add(posKey);
        if (name && name.trim()) {
          if (!entry.keyPlayers.has(posKey)) {
            entry.keyPlayers.set(posKey, new Set());
          }
          entry.keyPlayers.get(posKey).add(name.trim());
        }
      }
    });
  });

  return map;
}

/**
 * Build a constraint → concept reverse index.
 * Tells us which concepts serve as constraints for others.
 */
function obBuildConstraintIndex(conceptMap) {
  // concept names (lowered) for matching
  const conceptNames = new Map();
  conceptMap.forEach((_, name) => conceptNames.set(name.toLowerCase(), name));

  // constraint name → array of concept names that list it
  const index = {};
  conceptMap.forEach((entry) => {
    entry.constraints.forEach((c) => {
      const key = c.toLowerCase();
      if (!index[key]) index[key] = [];
      index[key].push(entry.name);
    });
  });
  return { index, conceptNames };
}

// ── Analysis helpers ───────────────────────────────────────────────

/**
 * Detect gaps and produce recommendations.
 * Returns an array of { type, severity, message, concept?, suggestion? }
 */
function obAnalyzeGaps(conceptMap, ratings) {
  const recs = [];
  const rated = Object.entries(ratings).filter(([, r]) => r >= 1);
  const ratedConcepts = new Set(rated.map(([n]) => n));

  // All constraint names referenced across rated concepts
  const neededConstraints = new Set();
  const constraintSources = {}; // constraint → which concept needs it

  conceptMap.forEach((entry, name) => {
    if (!ratedConcepts.has(name)) return;

    // 1. Constraint coverage
    entry.constraints.forEach((c) => {
      const cLow = c.toLowerCase();
      neededConstraints.add(cLow);
      if (!constraintSources[cLow]) constraintSources[cLow] = [];
      constraintSources[cLow].push(name);
    });

    // 2. Dead-vs warnings
    entry.deadVs.forEach((dv) => {
      recs.push({
        type: "dead-vs",
        severity: "warn",
        concept: name,
        message: `"${name}" is listed as dead vs ${dv}`,
        suggestion: `Make sure you have a constraint or check-with-me for ${dv}`,
      });
    });

    // 3. Key player single-point-of-failure
    entry.keyPlayers.forEach((names, pos) => {
      if (names.size === 1) {
        const playerName = Array.from(names)[0];
        recs.push({
          type: "depth",
          severity: "info",
          concept: name,
          message: `"${name}" depends on one player at ${pos}: ${playerName}`,
          suggestion: `Consider who backs up ${playerName} at ${pos}`,
        });
      }
    });

    // 4. Thin formation diversity (only 1 formation for a core concept)
    if (ratings[name] >= 4 && entry.formations.size <= 1) {
      recs.push({
        type: "variety",
        severity: "info",
        concept: name,
        message: `"${name}" is rated ★${ratings[name]} but only runs from ${entry.formations.size} formation`,
        suggestion: `Consider adding another formation look`,
      });
    }
  });

  // Check if constraints are themselves in the playbook
  neededConstraints.forEach((cLow) => {
    const found = conceptMap.has(cLow) ||
      Array.from(conceptMap.keys()).some((k) => k.toLowerCase() === cLow);
    if (!found) {
      recs.push({
        type: "missing-constraint",
        severity: "critical",
        concept: constraintSources[cLow]?.join(", "),
        message: `Constraint "${cLow}" referenced but not found as a base concept in the playbook`,
        suggestion: `Add plays that use "${cLow}" as the base play, or verify spelling`,
      });
    }
  });

  // 5. Run/pass balance among rated concepts
  let runCount = 0;
  let passCount = 0;
  ratedConcepts.forEach((name) => {
    const entry = conceptMap.get(name);
    if (!entry) return;
    entry.types.forEach((t) => {
      const tl = t.toLowerCase();
      if (tl === "run" || tl === "option" || tl === "rpo") runCount++;
      if (tl === "drop" || tl === "play action" || tl === "play pass" || tl === "quick" || tl === "screen" || tl === "movement") passCount++;
    });
  });
  const total = runCount + passCount;
  if (total > 0) {
    const runPct = Math.round((runCount / total) * 100);
    if (runPct > 70) {
      recs.push({ type: "balance", severity: "warn", message: `Your rated concepts skew heavily run (${runPct}% run types). Consider adding more passing concepts.` });
    } else if (runPct < 30) {
      recs.push({ type: "balance", severity: "warn", message: `Your rated concepts skew heavily pass (${100 - runPct}% pass types). Consider adding more run concepts.` });
    }
  }

  return recs;
}

// ── State ──────────────────────────────────────────────────────────
let obActiveConceptName = null;
let obSearchTerm = "";
let obFilterType = ""; // "", "run", "pass"
let obShowRatedOnly = false;

// ── Render ─────────────────────────────────────────────────────────

function initOffenseBuilder() {
  renderOffenseBuilder();
}

function renderOffenseBuilder() {
  const container = document.getElementById("offenseBuilderContent");
  if (!container) return;

  if (!plays || plays.length === 0) {
    container.innerHTML = `
      <div class="ob-empty">
        <h3>🧠 No playbook loaded</h3>
        <p>Upload a playbook CSV first — the Offense Builder will map out your concepts.</p>
      </div>`;
    return;
  }

  const conceptMap = obBuildConceptMap();
  const ratings = obLoadRatings();

  // Convert map to sorted array
  let concepts = Array.from(conceptMap.values());

  // Filters
  if (obSearchTerm) {
    const q = obSearchTerm.toLowerCase();
    concepts = concepts.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      Array.from(c.playNames).some((pn) => pn.toLowerCase().includes(q))
    );
  }
  if (obFilterType === "run") {
    concepts = concepts.filter((c) =>
      Array.from(c.types).some((t) => ["Run", "Option", "RPO"].includes(t))
    );
  } else if (obFilterType === "pass") {
    concepts = concepts.filter((c) =>
      Array.from(c.types).some((t) => ["Drop", "Play Action", "Play Pass", "Quick", "Screen", "Movement"].includes(t))
    );
  }
  if (obShowRatedOnly) {
    concepts = concepts.filter((c) => (ratings[c.name] || 0) >= 1);
  }

  // Sort: rated first (highest first), then alphabetical
  concepts.sort((a, b) => {
    const ra = ratings[a.name] || 0;
    const rb = ratings[b.name] || 0;
    if (rb !== ra) return rb - ra;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  // Stats
  const totalConcepts = conceptMap.size;
  const ratedCount = Object.values(ratings).filter((r) => r >= 1).length;

  // Recommendations (only for rated concepts)
  const recs = obAnalyzeGaps(conceptMap, ratings);
  const criticalRecs = recs.filter((r) => r.severity === "critical");
  const warnRecs = recs.filter((r) => r.severity === "warn");
  const infoRecs = recs.filter((r) => r.severity === "info");

  let html = `
    <div class="ob-container">
      <!-- Header -->
      <div class="ob-header">
        <div class="ob-header-left">
          <h2 class="ob-title">🧠 Offense Builder</h2>
          <p class="ob-subtitle">Rate your base concepts, explore constraints, and find gaps</p>
        </div>
        <div class="ob-header-right">
          <div class="ob-stat"><span class="ob-stat-num">${totalConcepts}</span><span class="ob-stat-label">Base Concepts</span></div>
          <div class="ob-stat"><span class="ob-stat-num">${ratedCount}</span><span class="ob-stat-label">Rated</span></div>
          <div class="ob-stat ob-stat-alert"><span class="ob-stat-num">${criticalRecs.length}</span><span class="ob-stat-label">Gaps</span></div>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="ob-toolbar">
        <input type="text" class="ob-search" placeholder="Search concepts or plays..."
               value="${escapeAttr(obSearchTerm)}" oninput="obSearchTerm=this.value; renderOffenseBuilder();">
        <select class="ob-filter-select" onchange="obFilterType=this.value; renderOffenseBuilder();">
          <option value=""${obFilterType === "" ? " selected" : ""}>All Types</option>
          <option value="run"${obFilterType === "run" ? " selected" : ""}>🏃 Run Game</option>
          <option value="pass"${obFilterType === "pass" ? " selected" : ""}>🎯 Pass Game</option>
        </select>
        <label class="ob-toggle-label">
          <input type="checkbox" ${obShowRatedOnly ? "checked" : ""} onchange="obShowRatedOnly=this.checked; renderOffenseBuilder();">
          <span>Rated only</span>
        </label>
      </div>

      <div class="ob-body">
        <!-- Concept List -->
        <div class="ob-concept-list">
          ${concepts.map((c) => obRenderConceptCard(c, ratings, conceptMap)).join("")}
          ${concepts.length === 0 ? '<div class="ob-empty-list">No concepts match your filters</div>' : ""}
        </div>

        <!-- Detail + Recs Sidebar -->
        <div class="ob-sidebar">
          ${obRenderDetailPanel(conceptMap, ratings)}
          ${obRenderRecommendations(recs)}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// ── Concept Card ───────────────────────────────────────────────────

function obRenderConceptCard(concept, ratings, conceptMap) {
  const rating = ratings[concept.name] || 0;
  const isActive = obActiveConceptName === concept.name;
  const typeLabels = Array.from(concept.types).slice(0, 3).join(", ");
  const formationCount = concept.formations.size;
  const playCount = concept.plays.length;
  const constraintCount = concept.constraints.size;
  const hasGap = constraintCount > 0 &&
    Array.from(concept.constraints).some((c) => {
      const cLow = c.toLowerCase();
      return !Array.from(conceptMap.keys()).some((k) => k.toLowerCase() === cLow);
    });

  return `
    <div class="ob-card ${isActive ? "ob-card-active" : ""} ${rating >= 4 ? "ob-card-core" : ""}"
         onclick="obActiveConceptName='${escapeAttr(concept.name)}'; renderOffenseBuilder();">
      <div class="ob-card-top">
        <div class="ob-card-name">${escapeHtml(concept.name)}</div>
        <div class="ob-card-stars" onclick="event.stopPropagation();">
          ${obRenderStarPicker(concept.name, rating)}
        </div>
      </div>
      <div class="ob-card-meta">
        <span class="ob-meta-tag ob-meta-type">${escapeHtml(typeLabels)}</span>
        <span class="ob-meta-tag">📐 ${formationCount}</span>
        <span class="ob-meta-tag">🏈 ${playCount} plays</span>
        ${constraintCount > 0 ? `<span class="ob-meta-tag ob-meta-constraint">🔗 ${constraintCount}</span>` : ""}
        ${hasGap ? '<span class="ob-meta-tag ob-meta-gap">⚠️ Gap</span>' : ""}
      </div>
    </div>
  `;
}

function obRenderStarPicker(conceptName, current) {
  let html = "";
  for (let i = 1; i <= 5; i++) {
    const filled = i <= current;
    html += `<span class="ob-star ${filled ? "ob-star-filled" : "ob-star-empty"}"
                   onclick="obSetRating('${escapeAttr(conceptName)}', ${i})"
                   title="${i} star${i > 1 ? "s" : ""}">★</span>`;
  }
  if (current > 0) {
    html += `<span class="ob-star-clear" onclick="obSetRating('${escapeAttr(conceptName)}', 0)" title="Clear rating">✕</span>`;
  }
  return html;
}

function obSetRating(conceptName, stars) {
  const ratings = obLoadRatings();
  if (stars <= 0) {
    delete ratings[conceptName];
  } else {
    ratings[conceptName] = stars;
  }
  obSaveRatings(ratings);
  renderOffenseBuilder();
}

// ── Detail Panel ───────────────────────────────────────────────────

function obRenderDetailPanel(conceptMap, ratings) {
  if (!obActiveConceptName) {
    return `<div class="ob-detail ob-detail-empty"><p>👈 Select a concept to explore</p></div>`;
  }

  const concept = conceptMap.get(obActiveConceptName);
  if (!concept) {
    return `<div class="ob-detail ob-detail-empty"><p>Concept not found</p></div>`;
  }

  const rating = ratings[concept.name] || 0;
  const installData = typeof getInstallationData === "function" ? getInstallationData() : { installed: {} };
  const installedPlays = installData.installed?.play || [];
  const installedSet = new Set(installedPlays.map((v) => v.trim()));

  // Build constraint links
  const constraintHtml = concept.constraints.size > 0
    ? Array.from(concept.constraints).map((c) => {
        const exists = Array.from(conceptMap.keys()).some((k) => k.toLowerCase() === c.toLowerCase());
        return `<span class="ob-constraint-chip ${exists ? "ob-constraint-found" : "ob-constraint-missing"}"
                      onclick="${exists ? `obActiveConceptName='${escapeAttr(c)}'; renderOffenseBuilder();` : ""}"
                      title="${exists ? "Click to explore" : "Not in playbook"}">${escapeHtml(c)} ${exists ? "✅" : "⚠️"}</span>`;
      }).join("")
    : '<span class="ob-no-data">None listed</span>';

  // Dead vs
  const deadVsHtml = concept.deadVs.size > 0
    ? Array.from(concept.deadVs).map((d) => `<span class="ob-dead-chip">🚫 ${escapeHtml(d)}</span>`).join("")
    : '<span class="ob-no-data">None listed</span>';

  // Key players (Jimmys & Joes)
  let keyPlayerHtml = "";
  if (concept.keyPlayers.size > 0) {
    concept.keyPlayers.forEach((names, pos) => {
      const nameList = Array.from(names).join(", ");
      keyPlayerHtml += `<div class="ob-kp-row"><span class="ob-kp-pos">${escapeHtml(pos)}</span><span class="ob-kp-names">${escapeHtml(nameList)}</span></div>`;
    });
  } else if (concept.keyPositions.size > 0) {
    concept.keyPositions.forEach((pos) => {
      keyPlayerHtml += `<div class="ob-kp-row"><span class="ob-kp-pos">${escapeHtml(pos)}</span><span class="ob-kp-names ob-no-data">—</span></div>`;
    });
  } else {
    keyPlayerHtml = '<span class="ob-no-data">None listed</span>';
  }

  // Plays table
  const playRows = concept.plays.map((p) => {
    const playName = p.play || "—";
    const isInstalled = installedSet.has(playName.trim());
    const tags = [p.playTag1, p.playTag2].filter(Boolean).join(", ");
    const formation = p.formation || "";
    const motion = p.motion || "";
    return `<tr class="${isInstalled ? "ob-play-installed" : ""}">
      <td>${isInstalled ? "✅" : "⬜"}</td>
      <td>${escapeHtml(playName)}</td>
      <td>${escapeHtml(p.type || "")}</td>
      <td>${escapeHtml(formation)}</td>
      <td>${escapeHtml(motion)}</td>
      <td>${escapeHtml(tags)}</td>
    </tr>`;
  }).join("");

  // Hit chart summary across all plays for this concept
  const hitChartCounts = {};
  concept.plays.forEach((p) => {
    [p.hitChart1, p.hitChart2, p.hitChart3].filter(Boolean).forEach((hc) => {
      const key = hc.trim();
      if (key) hitChartCounts[key] = (hitChartCounts[key] || 0) + 1;
    });
  });
  const hitChartHtml = Object.keys(hitChartCounts).length > 0
    ? Object.entries(hitChartCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([area, count]) => `<span class="ob-hc-chip">${escapeHtml(area)} <small>(${count})</small></span>`)
        .join("")
    : '<span class="ob-no-data">None</span>';

  // Formations list
  const formationsHtml = Array.from(concept.formations).sort().map((f) =>
    `<span class="ob-form-chip">${escapeHtml(f)}</span>`
  ).join("") || '<span class="ob-no-data">—</span>';

  // Personnel
  const personnelHtml = Array.from(concept.personnel).map((p) =>
    `<span class="ob-pers-chip">${getPersonnelEmoji(p)} ${escapeHtml(p)}</span>`
  ).join("") || '<span class="ob-no-data">—</span>';

  return `
    <div class="ob-detail">
      <div class="ob-detail-title">
        <h3>${escapeHtml(concept.name)}</h3>
        <div class="ob-detail-stars">${obRenderStarPicker(concept.name, rating)}</div>
      </div>

      <!-- Quick stats -->
      <div class="ob-detail-stats">
        <span>${concept.plays.length} plays</span>
        <span>${concept.formations.size} formations</span>
        <span>${Array.from(concept.types).join(", ")}</span>
      </div>

      <!-- Constraints & Counters -->
      <div class="ob-detail-section">
        <div class="ob-section-title">🔗 Constraints & Counters</div>
        <div class="ob-section-body">${constraintHtml}</div>
      </div>

      <!-- Dead Vs -->
      <div class="ob-detail-section">
        <div class="ob-section-title">🚫 Dead Vs</div>
        <div class="ob-section-body">${deadVsHtml}</div>
      </div>

      <!-- Jimmys & Joes -->
      <div class="ob-detail-section">
        <div class="ob-section-title">👤 Jimmys & Joes (Key Players)</div>
        <div class="ob-section-body ob-kp-list">${keyPlayerHtml}</div>
      </div>

      <!-- Hit Chart Areas -->
      <div class="ob-detail-section">
        <div class="ob-section-title">🎯 Hit Chart Areas</div>
        <div class="ob-section-body">${hitChartHtml}</div>
      </div>

      <!-- Personnel -->
      <div class="ob-detail-section">
        <div class="ob-section-title">👥 Personnel</div>
        <div class="ob-section-body">${personnelHtml}</div>
      </div>

      <!-- Formations -->
      <div class="ob-detail-section">
        <div class="ob-section-title">📐 Formations</div>
        <div class="ob-section-body">${formationsHtml}</div>
      </div>

      <!-- All plays table -->
      <div class="ob-detail-section">
        <div class="ob-section-title">🏈 Plays (${concept.plays.length})</div>
        <div class="ob-plays-table-wrap">
          <table class="ob-plays-table">
            <thead><tr><th>Inst</th><th>Play</th><th>Type</th><th>Formation</th><th>Motion</th><th>Tags</th></tr></thead>
            <tbody>${playRows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ── Recommendations Panel ──────────────────────────────────────────

function obRenderRecommendations(recs) {
  if (recs.length === 0) {
    return `
      <div class="ob-recs">
        <div class="ob-recs-title">💡 Recommendations</div>
        <p class="ob-no-data">Rate some concepts (★) to get smart recommendations about gaps, balance, and key player depth.</p>
      </div>
    `;
  }

  const severityOrder = { critical: 0, warn: 1, info: 2 };
  const sorted = [...recs].sort((a, b) => (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9));

  const icons = { critical: "🔴", warn: "🟡", info: "🔵" };

  const rows = sorted.slice(0, 25).map((r) => `
    <div class="ob-rec-row ob-rec-${r.severity}">
      <span class="ob-rec-icon">${icons[r.severity] || "ℹ️"}</span>
      <div class="ob-rec-body">
        <div class="ob-rec-msg">${escapeHtml(r.message)}</div>
        ${r.suggestion ? `<div class="ob-rec-sug">${escapeHtml(r.suggestion)}</div>` : ""}
      </div>
    </div>
  `).join("");

  return `
    <div class="ob-recs">
      <div class="ob-recs-title">💡 Recommendations <span class="ob-recs-count">${recs.length}</span></div>
      ${rows}
      ${recs.length > 25 ? `<div class="ob-rec-more">+${recs.length - 25} more</div>` : ""}
    </div>
  `;
}

// ── escapeAttr helper (reuse from installation.js if available) ───
function obEscapeAttr(str) {
  return typeof escapeAttr === "function" ? escapeAttr(str) : String(str).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
}
