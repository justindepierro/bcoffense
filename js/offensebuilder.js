// ============ Offense Builder ============
// Play-focused brainstorming tab — rate plays, explore constraints, find gaps.
// The left panel lists unique play names (grouped from CSV rows).
// The right panel shows detail, related plays, and smart recommendations.

// ── Storage ────────────────────────────────────────────────────────
const OB_STORAGE_KEY = STORAGE_KEYS.OB_PLAY_RATINGS;

function obLoadRatings() {
  try {
    return storageManager.get(OB_STORAGE_KEY, {});
  } catch (err) {
    console.error("obLoadRatings error:", err);
    return {};
  }
}

function obSaveRatings(ratings) {
  storageManager.set(OB_STORAGE_KEY, ratings);
}

// ── Play Map ───────────────────────────────────────────────────────
/**
 * Group all CSV rows by play name.
 * @returns {Map<string, Object>} playName → aggregated data
 */
function obBuildPlayMap() {
  try {
    const map = new Map();
    if (!plays || plays.length === 0) return map;

    plays.forEach((p) => {
      const name = (p.play || "").trim();
      if (!name) return;

      let entry = map.get(name);
      if (!entry) {
        entry = {
          name,
          rows: [],
          basePlays: new Set(),
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
          keyPlayers: new Map(), // position → Set<playerName>
          hitCharts: {}, // area → count
        };
        map.set(name, entry);
      }

      entry.rows.push(p);
      if (p.basePlay) entry.basePlays.add(p.basePlay.trim());
      if (p.type) entry.types.add(p.type.trim());
      if (p.formation) entry.formations.add(p.formation.trim());
      if (p.personnel) entry.personnel.add(p.personnel.trim());
      if (p.motion) entry.motions.add(p.motion.trim());
      if (p.shift) entry.shifts.add(p.shift.trim());
      if (p.protection) entry.protections.add(p.protection.trim());
      if (p.tempo) entry.tempos.add(p.tempo.trim());

      [p.constraint1, p.constraint2, p.constraint3]
        .filter(Boolean)
        .forEach((c) => entry.constraints.add(c.trim()));

      if (p.deadVs) entry.deadVs.add(p.deadVs.trim());

      [
        { pos: p.keyPlayer1, name: p.keyPlayerName1 },
        { pos: p.keyPlayer2, name: p.keyPlayerName2 },
        { pos: p.keyPlayer3, name: p.keyPlayerName3 },
      ].forEach(({ pos, name: playerName }) => {
        if (pos && pos.trim()) {
          const posKey = pos.trim();
          entry.keyPositions.add(posKey);
          if (playerName && playerName.trim()) {
            if (!entry.keyPlayers.has(posKey))
              entry.keyPlayers.set(posKey, new Set());
            entry.keyPlayers.get(posKey).add(playerName.trim());
          }
        }
      });

      [p.hitChart1, p.hitChart2, p.hitChart3].filter(Boolean).forEach((hc) => {
        const key = hc.trim();
        if (key) entry.hitCharts[key] = (entry.hitCharts[key] || 0) + 1;
      });
    });

    return map;
  } catch (err) {
    console.error("obBuildPlayMap error:", err);
    return new Map();
  }
}

// ── Concept Map (for constraint / gap analysis) ────────────────────
/**
 * Lightweight concept map keyed by basePlay.
 * Used to check whether constraints exist in the playbook.
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
        constraints: new Set(),
        deadVs: new Set(),
        playNames: new Set(),
      };
      map.set(base, entry);
    }
    entry.plays.push(p);
    if (p.type) entry.types.add(p.type);
    if (p.play) entry.playNames.add(p.play.trim());
    [p.constraint1, p.constraint2, p.constraint3]
      .filter(Boolean)
      .forEach((c) => entry.constraints.add(c.trim()));
    if (p.deadVs) entry.deadVs.add(p.deadVs.trim());
  });

  return map;
}

// ── Gap Analysis ───────────────────────────────────────────────────
function obAnalyzeGaps(playMap, conceptMap, ratings) {
  const recs = [];
  if (!playMap || !conceptMap) return recs;

  const ratedPlayNames = new Set(
    Object.entries(ratings)
      .filter(([, r]) => r >= 1)
      .map(([n]) => n),
  );
  if (ratedPlayNames.size === 0) return recs;

  // Collect base concepts that have at least one rated play
  const activeConcepts = new Set();
  playMap.forEach((entry, playName) => {
    if (ratedPlayNames.has(playName)) {
      entry.basePlays.forEach((bp) => activeConcepts.add(bp));
    }
  });

  // Constraint coverage
  const neededConstraints = new Set();
  const constraintSources = {};

  activeConcepts.forEach((conceptName) => {
    const concept = conceptMap.get(conceptName);
    if (!concept) return;

    concept.constraints.forEach((c) => {
      const cLow = c.toLowerCase();
      neededConstraints.add(cLow);
      if (!constraintSources[cLow]) constraintSources[cLow] = [];
      constraintSources[cLow].push(conceptName);
    });

    concept.deadVs.forEach((dv) => {
      recs.push({
        type: "dead-vs",
        severity: "warn",
        concept: conceptName,
        message: '"' + conceptName + '" is dead vs ' + dv,
        suggestion:
          "Make sure you have a constraint or check-with-me for " + dv,
      });
    });
  });

  neededConstraints.forEach((cLow) => {
    const found = Array.from(conceptMap.keys()).some(
      (k) => k.toLowerCase() === cLow,
    );
    if (!found) {
      recs.push({
        type: "missing-constraint",
        severity: "critical",
        concept: constraintSources[cLow]
          ? constraintSources[cLow].join(", ")
          : "",
        message:
          'Constraint "' +
          cLow +
          '" referenced but not found as a base concept',
        suggestion:
          'Add plays that use "' +
          cLow +
          '" as the base play, or verify spelling',
      });
    }
  });

  // Per-play analysis for rated plays
  ratedPlayNames.forEach((playName) => {
    const entry = playMap.get(playName);
    if (!entry) return;

    // Key player single-point-of-failure
    entry.keyPlayers.forEach((names, pos) => {
      if (names.size === 1) {
        const pName = Array.from(names)[0];
        recs.push({
          type: "depth",
          severity: "info",
          concept: playName,
          message:
            '"' + playName + '" depends on one player at ' + pos + ": " + pName,
          suggestion: "Consider who backs up " + pName + " at " + pos,
        });
      }
    });

    // Formation diversity for highly-rated plays
    const rating = ratings[playName] || 0;
    if (rating >= 4 && entry.formations.size <= 1) {
      recs.push({
        type: "variety",
        severity: "info",
        concept: playName,
        message:
          '"' +
          playName +
          '" is rated ' +
          rating +
          " stars but only runs from " +
          entry.formations.size +
          " formation",
        suggestion: "Consider adding another formation look",
      });
    }
  });

  // Run / pass balance among rated plays
  let runCount = 0;
  let passCount = 0;
  ratedPlayNames.forEach((playName) => {
    const entry = playMap.get(playName);
    if (!entry) return;
    entry.types.forEach((t) => {
      const tl = t.toLowerCase();
      if (["run", "option", "rpo"].includes(tl)) runCount++;
      if (
        [
          "drop",
          "play action",
          "play pass",
          "quick",
          "screen",
          "movement",
        ].includes(tl)
      )
        passCount++;
    });
  });
  const total = runCount + passCount;
  if (total > 0) {
    const runPct = Math.round((runCount / total) * 100);
    if (runPct > 70) {
      recs.push({
        type: "balance",
        severity: "warn",
        message:
          "Your rated plays skew heavily run (" +
          runPct +
          "%). Consider adding more passing plays.",
      });
    } else if (runPct < 30) {
      recs.push({
        type: "balance",
        severity: "warn",
        message:
          "Your rated plays skew heavily pass (" +
          (100 - runPct) +
          "%). Consider adding more run plays.",
      });
    }
  }

  return recs;
}

// ── State ──────────────────────────────────────────────────────────
let obActivePlayName = null;
let obSearchTerm = "";
let obFilterType = ""; // "" | "run" | "pass"
let obShowRatedOnly = false;

// Cached maps (rebuilt on init)
let _obPlayMap = null;
let _obConceptMap = null;

function _obRebuildMaps() {
  _obPlayMap = obBuildPlayMap();
  _obConceptMap = obBuildConceptMap();
}

// ── Filtering ──────────────────────────────────────────────────────
function obGetFilteredPlays() {
  if (!_obPlayMap) _obRebuildMaps();
  const ratings = obLoadRatings();
  let entries = Array.from(_obPlayMap.values());

  if (obSearchTerm) {
    const q = obSearchTerm.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        Array.from(e.basePlays).some((bp) => bp.toLowerCase().includes(q)) ||
        Array.from(e.formations).some((f) => f.toLowerCase().includes(q)) ||
        Array.from(e.personnel).some((p) => p.toLowerCase().includes(q)),
    );
  }

  if (obFilterType === "run") {
    entries = entries.filter((e) =>
      Array.from(e.types).some((t) => ["Run", "Option", "RPO"].includes(t)),
    );
  } else if (obFilterType === "pass") {
    entries = entries.filter((e) =>
      Array.from(e.types).some((t) =>
        [
          "Drop",
          "Play Action",
          "Play Pass",
          "Quick",
          "Screen",
          "Movement",
        ].includes(t),
      ),
    );
  }

  if (obShowRatedOnly) {
    entries = entries.filter((e) => (ratings[e.name] || 0) >= 1);
  }

  // Sort: rated first (highest), then alphabetical
  entries.sort((a, b) => {
    const ra = ratings[a.name] || 0;
    const rb = ratings[b.name] || 0;
    if (rb !== ra) return rb - ra;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  return entries;
}

// ── Init & Render Shell ────────────────────────────────────────────
function initOffenseBuilder() {
  _obRebuildMaps();
  renderOffenseBuilder();
}

/**
 * Render the full page shell (header, toolbar, empty body containers).
 * Sub-panels (play list, sidebar) are rendered separately so toolbar
 * inputs are never destroyed and never lose focus.
 */
function renderOffenseBuilder() {
  try {
    const container = document.getElementById("offenseBuilderContent");
    if (!container) return;

    if (!plays || plays.length === 0) {
      container.innerHTML =
        '<div class="ob-empty">' +
        "<h3>\u{1F9E0} No playbook loaded</h3>" +
        "<p>Upload a playbook CSV first \u2014 the Offense Builder will map out your plays.</p>" +
        "</div>";
      return;
    }

    if (!_obPlayMap) _obRebuildMaps();
    const ratings = obLoadRatings();
    const totalPlays = _obPlayMap.size;
    const ratedCount = Object.values(ratings).filter((r) => r >= 1).length;
    const recs = obAnalyzeGaps(_obPlayMap, _obConceptMap, ratings);
    const criticalRecs = recs.filter((r) => r.severity === "critical");

    container.innerHTML =
      '<div class="ob-container">' +
      '<div class="ob-header">' +
      '<div class="ob-header-left">' +
      '<h2 class="ob-title">\u{1F9E0} Offense Builder</h2>' +
      '<p class="ob-subtitle">Rate your plays, explore constraints, and find gaps</p>' +
      "</div>" +
      '<div class="ob-header-right">' +
      '<div class="ob-stat"><span class="ob-stat-num" id="obStatTotal">' +
      totalPlays +
      '</span><span class="ob-stat-label">Plays</span></div>' +
      '<div class="ob-stat"><span class="ob-stat-num" id="obStatRated">' +
      ratedCount +
      '</span><span class="ob-stat-label">Rated</span></div>' +
      '<div class="ob-stat ob-stat-alert"><span class="ob-stat-num" id="obStatGaps">' +
      criticalRecs.length +
      '</span><span class="ob-stat-label">Gaps</span></div>' +
      "</div>" +
      "</div>" +
      '<div class="ob-toolbar">' +
      '<input type="text" class="ob-search" id="obSearchInput" placeholder="Search plays, concepts, formations..." value="' +
      obEscapeAttr(obSearchTerm) +
      '">' +
      '<select class="ob-filter-select" id="obFilterType">' +
      '<option value=""' +
      (obFilterType === "" ? " selected" : "") +
      ">All Types</option>" +
      '<option value="run"' +
      (obFilterType === "run" ? " selected" : "") +
      ">\u{1F3C3} Run Game</option>" +
      '<option value="pass"' +
      (obFilterType === "pass" ? " selected" : "") +
      ">\u{1F3AF} Pass Game</option>" +
      "</select>" +
      '<label class="ob-toggle-label">' +
      '<input type="checkbox" id="obShowRated" ' +
      (obShowRatedOnly ? "checked" : "") +
      ">" +
      "<span>Rated only</span>" +
      "</label>" +
      "</div>" +
      '<div class="ob-body">' +
      '<div class="ob-play-list" id="obPlayList"></div>' +
      '<div class="ob-sidebar" id="obSidebar"></div>' +
      "</div>" +
      "</div>";

    // Attach toolbar event listeners (no inline handlers = input keeps focus)
    var searchInput = document.getElementById("obSearchInput");
    var filterSelect = document.getElementById("obFilterType");
    var ratedCheckbox = document.getElementById("obShowRated");

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        obSearchTerm = this.value;
        obRenderPlayList();
      });
    }
    if (filterSelect) {
      filterSelect.addEventListener("change", function () {
        obFilterType = this.value;
        obRenderPlayList();
      });
    }
    if (ratedCheckbox) {
      ratedCheckbox.addEventListener("change", function () {
        obShowRatedOnly = this.checked;
        obRenderPlayList();
      });
    }

    // Render sub-panels
    obRenderPlayList();
    obRenderSidebar();
  } catch (err) {
    console.error("renderOffenseBuilder error:", err);
    showToast("❌ Error rendering offense builder.", 3000);
  }
}

// ── Play List (left panel) ─────────────────────────────────────────
function obRenderPlayList() {
  var listEl = document.getElementById("obPlayList");
  if (!listEl) return;

  var entries = obGetFilteredPlays();
  var ratings = obLoadRatings();

  if (entries.length === 0) {
    listEl.innerHTML =
      '<div class="ob-empty-list">No plays match your filters</div>';
    return;
  }

  var html = "";
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var rating = ratings[entry.name] || 0;
    var isActive = obActivePlayName === entry.name;
    var typeLabels = Array.from(entry.types).slice(0, 3).join(", ");
    var formationCount = entry.formations.size;
    var rowCount = entry.rows.length;
    var basePlays = Array.from(entry.basePlays).join(", ");
    var hasGap =
      entry.constraints.size > 0 &&
      Array.from(entry.constraints).some(function (c) {
        var cLow = c.toLowerCase();
        return !Array.from(_obConceptMap.keys()).some(function (k) {
          return k.toLowerCase() === cLow;
        });
      });

    html +=
      '<div class="ob-card' +
      (isActive ? " ob-card-active" : "") +
      (rating >= 4 ? " ob-card-core" : "") +
      '" data-play="' +
      obEscapeAttr(entry.name) +
      '">';
    html += '<div class="ob-card-top">';
    html += '<div class="ob-card-name">' + escapeHtml(entry.name) + "</div>";
    html +=
      '<div class="ob-card-stars" data-star-target="' +
      obEscapeAttr(entry.name) +
      '">';
    html += obRenderStarPicker(entry.name, rating);
    html += "</div></div>";
    if (basePlays) {
      html += '<div class="ob-card-base">' + escapeHtml(basePlays) + "</div>";
    }
    html += '<div class="ob-card-meta">';
    html +=
      '<span class="ob-meta-tag ob-meta-type">' +
      escapeHtml(typeLabels) +
      "</span>";
    html += '<span class="ob-meta-tag">\u{1F4D0} ' + formationCount + "</span>";
    if (rowCount > 1)
      html +=
        '<span class="ob-meta-tag">\u{1F4CB} ' + rowCount + " rows</span>";
    if (entry.constraints.size > 0)
      html +=
        '<span class="ob-meta-tag ob-meta-constraint">\u{1F517} ' +
        entry.constraints.size +
        "</span>";
    if (hasGap)
      html += '<span class="ob-meta-tag ob-meta-gap">\u26A0\uFE0F Gap</span>';
    html += "</div></div>";
  }

  listEl.innerHTML = html;

  // Event delegation for card clicks & star clicks
  listEl.onclick = function (e) {
    var starEl = e.target.closest(".ob-star");
    var clearEl = e.target.closest(".ob-star-clear");
    if (starEl || clearEl) {
      e.stopPropagation();
      var container = e.target.closest("[data-star-target]");
      if (!container) return;
      var playName = container.dataset.starTarget;
      if (starEl) {
        var val = parseInt(starEl.dataset.value, 10);
        if (!isNaN(val)) obSetRating(playName, val);
      } else if (clearEl) {
        obSetRating(playName, 0);
      }
      return;
    }
    var card = e.target.closest(".ob-card");
    if (card) {
      obActivePlayName = card.dataset.play;
      obRenderPlayList();
      obRenderSidebar();
    }
  };
}

// ── Star Picker ────────────────────────────────────────────────────
function obRenderStarPicker(playName, current) {
  var html = "";
  for (var i = 1; i <= 5; i++) {
    var filled = i <= current;
    html +=
      '<span class="ob-star ' +
      (filled ? "ob-star-filled" : "ob-star-empty") +
      '" data-value="' +
      i +
      '" title="' +
      i +
      " star" +
      (i > 1 ? "s" : "") +
      '">\u2605</span>';
  }
  if (current > 0) {
    html += '<span class="ob-star-clear" title="Clear rating">\u2715</span>';
  }
  return html;
}

function obSetRating(playName, stars) {
  try {
    var ratings = obLoadRatings();
    if (stars <= 0) {
      delete ratings[playName];
    } else {
      ratings[playName] = stars;
    }
    obSaveRatings(ratings);
    _obUpdateHeaderStats();
    obRenderPlayList();
    obRenderSidebar();
  } catch (err) {
    console.error("obSetRating error:", err);
    showToast("❌ Error saving rating.", 3000);
  }
}

function _obUpdateHeaderStats() {
  var ratings = obLoadRatings();
  var ratedCount = Object.values(ratings).filter(function (r) {
    return r >= 1;
  }).length;
  var recs = obAnalyzeGaps(_obPlayMap, _obConceptMap, ratings);
  var criticalRecs = recs.filter(function (r) {
    return r.severity === "critical";
  });

  var ratedEl = document.getElementById("obStatRated");
  var gapsEl = document.getElementById("obStatGaps");
  if (ratedEl) ratedEl.textContent = ratedCount;
  if (gapsEl) gapsEl.textContent = criticalRecs.length;
}

// ── Sidebar (detail + recommendations) ─────────────────────────────
function obRenderSidebar() {
  var sidebarEl = document.getElementById("obSidebar");
  if (!sidebarEl) return;

  var ratings = obLoadRatings();
  var recs = obAnalyzeGaps(_obPlayMap, _obConceptMap, ratings);

  sidebarEl.innerHTML =
    _obBuildDetailHtml() +
    _obBuildTouchDistributionHtml() +
    _obBuildRecommendationsHtml(recs);
  _obAttachDetailHandlers();
}

// ── Touch Distribution Panel (whole playbook) ──────────────────────
/**
 * Compute and render touch distribution across all plays using the
 * global computeTouchAnalysis engine + renderTouchAnalysis renderer.
 */
function _obBuildTouchDistributionHtml() {
  if (!plays || plays.length === 0) return "";
  if (typeof computeTouchAnalysis !== "function") return "";

  var analysis = computeTouchAnalysis(plays);
  if (
    !analysis ||
    !analysis.players ||
    Object.keys(analysis.players).length === 0
  )
    return "";

  // Use the rich renderer from constraints.js if available
  if (typeof renderTouchAnalysis === "function") {
    return (
      '<div class="ob-detail-section"><div class="ob-section-body">' +
      renderTouchAnalysis(analysis, {
        title: "Touch Distribution (All Plays)",
        idPrefix: "ob-ta",
      }) +
      "</div></div>"
    );
  }

  // Fallback: simple text summary
  var html = Object.values(analysis.players)
    .map(function (p) {
      return (
        '<span class="cr-stat cr-touch">\uD83D\uDC64 ' +
        escapeHtml(p.name) +
        ": " +
        p.pct.toFixed(0) +
        "% (" +
        p.weightedPts +
        " pts)</span>"
      );
    })
    .join("");
  return (
    '<div class="ob-detail-section"><div class="ob-section-title">\uD83C\uDFC8 Touch Distribution (All Plays)</div><div class="ob-section-body">' +
    html +
    "</div></div>"
  );
}

// ── Detail Panel HTML ──────────────────────────────────────────────
function _obBuildDetailHtml() {
  if (!obActivePlayName) {
    return '<div class="ob-detail ob-detail-empty"><p>\u{1F448} Select a play to explore</p></div>';
  }

  var entry = _obPlayMap ? _obPlayMap.get(obActivePlayName) : null;
  if (!entry) {
    return '<div class="ob-detail ob-detail-empty"><p>Play not found</p></div>';
  }

  var ratings = obLoadRatings();
  var rating = ratings[entry.name] || 0;

  // Installation status
  var installData =
    typeof getInstallationData === "function"
      ? getInstallationData()
      : { installed: {} };
  var installedPlays =
    (installData.installed && installData.installed.play) || [];
  var installedSet = new Set(
    installedPlays.map(function (v) {
      return v.trim();
    }),
  );

  // Constraints
  var constraintParts = [];
  if (entry.constraints.size > 0) {
    entry.constraints.forEach(function (c) {
      var exists =
        _obConceptMap &&
        Array.from(_obConceptMap.keys()).some(function (k) {
          return k.toLowerCase() === c.toLowerCase();
        });
      constraintParts.push(
        '<span class="ob-constraint-chip ' +
          (exists ? "ob-constraint-found" : "ob-constraint-missing") +
          '"' +
          (exists ? ' data-concept="' + obEscapeAttr(c) + '"' : "") +
          ' title="' +
          (exists ? "Click to explore" : "Not in playbook") +
          '">' +
          escapeHtml(c) +
          " " +
          (exists ? "\u2705" : "\u26A0\uFE0F") +
          "</span>",
      );
    });
  }
  var constraintHtml =
    constraintParts.length > 0
      ? constraintParts.join("")
      : '<span class="ob-no-data">None listed</span>';

  // Dead vs
  var deadVsParts = [];
  entry.deadVs.forEach(function (d) {
    deadVsParts.push(
      '<span class="ob-dead-chip">\u{1F6AB} ' + escapeHtml(d) + "</span>",
    );
  });
  var deadVsHtml =
    deadVsParts.length > 0
      ? deadVsParts.join("")
      : '<span class="ob-no-data">None listed</span>';

  // Key players (Jimmys & Joes)
  var keyPlayerHtml = "";
  if (entry.keyPlayers.size > 0) {
    entry.keyPlayers.forEach(function (names, pos) {
      var nameList = Array.from(names).join(", ");
      keyPlayerHtml +=
        '<div class="ob-kp-row"><span class="ob-kp-pos">' +
        escapeHtml(pos) +
        '</span><span class="ob-kp-names">' +
        escapeHtml(nameList) +
        "</span></div>";
    });
  } else if (entry.keyPositions.size > 0) {
    entry.keyPositions.forEach(function (pos) {
      keyPlayerHtml +=
        '<div class="ob-kp-row"><span class="ob-kp-pos">' +
        escapeHtml(pos) +
        '</span><span class="ob-kp-names ob-no-data">\u2014</span></div>';
    });
  } else {
    keyPlayerHtml = '<span class="ob-no-data">None listed</span>';
  }

  // Hit chart
  var hitChartEntries = Object.entries(entry.hitCharts).sort(function (a, b) {
    return b[1] - a[1];
  });
  var hitChartHtml =
    hitChartEntries.length > 0
      ? hitChartEntries
          .map(function (pair) {
            return (
              '<span class="ob-hc-chip">' +
              escapeHtml(pair[0]) +
              " <small>(" +
              pair[1] +
              ")</small></span>"
            );
          })
          .join("")
      : '<span class="ob-no-data">None</span>';

  // Formations
  var formationsHtml =
    Array.from(entry.formations)
      .sort()
      .map(function (f) {
        return '<span class="ob-form-chip">' + escapeHtml(f) + "</span>";
      })
      .join("") || '<span class="ob-no-data">\u2014</span>';

  // Personnel
  var personnelHtml =
    Array.from(entry.personnel)
      .map(function (p) {
        return (
          '<span class="ob-pers-chip">' +
          getPersonnelEmoji(p) +
          " " +
          escapeHtml(p) +
          "</span>"
        );
      })
      .join("") || '<span class="ob-no-data">\u2014</span>';

  // Base concepts
  var basePlaysHtml =
    Array.from(entry.basePlays)
      .map(function (bp) {
        return '<span class="ob-form-chip">' + escapeHtml(bp) + "</span>";
      })
      .join("") || '<span class="ob-no-data">\u2014</span>';

  // Variations table
  var rowHtml = entry.rows
    .map(function (p) {
      var isInstalled = installedSet.has((p.play || "").trim());
      var tags = [p.playTag1, p.playTag2].filter(Boolean).join(", ");
      return (
        '<tr class="' +
        (isInstalled ? "ob-play-installed" : "") +
        '">' +
        "<td>" +
        (isInstalled ? "\u2705" : "\u2B1C") +
        "</td>" +
        "<td>" +
        escapeHtml(p.formation || "") +
        "</td>" +
        "<td>" +
        escapeHtml(p.personnel || "") +
        "</td>" +
        "<td>" +
        escapeHtml(p.motion || "\u2014") +
        "</td>" +
        "<td>" +
        escapeHtml(tags) +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  // Related plays (same base concept, different play name)
  var relatedHtml = "";
  if (entry.basePlays.size > 0 && _obPlayMap) {
    var relatedNames = [];
    _obPlayMap.forEach(function (otherEntry, otherName) {
      if (otherName === entry.name) return;
      var shared = Array.from(otherEntry.basePlays).some(function (bp) {
        return entry.basePlays.has(bp);
      });
      if (shared) relatedNames.push(otherName);
    });
    relatedNames.sort();
    if (relatedNames.length > 0) {
      var relatedChips = relatedNames
        .slice(0, 20)
        .map(function (rn) {
          var rRating = ratings[rn] || 0;
          return (
            '<span class="ob-constraint-chip ob-constraint-found ob-related-chip" data-related-play="' +
            obEscapeAttr(rn) +
            '">' +
            escapeHtml(rn) +
            (rRating > 0 ? " \u2605" + rRating : "") +
            "</span>"
          );
        })
        .join("");
      relatedHtml =
        '<div class="ob-detail-section">' +
        '<div class="ob-section-title">\u{1F500} Related Plays (same base concept)</div>' +
        '<div class="ob-section-body">' +
        relatedChips +
        (relatedNames.length > 20
          ? '<span class="ob-no-data">+' +
            (relatedNames.length - 20) +
            " more</span>"
          : "") +
        "</div>" +
        "</div>";
    }
  }

  // Notes
  var allNotes = entry.rows
    .map(function (p) {
      return (p.notes || "").trim();
    })
    .filter(Boolean);
  var uniqueNotes = [];
  var notesSeen = {};
  allNotes.forEach(function (n) {
    if (!notesSeen[n]) {
      notesSeen[n] = true;
      uniqueNotes.push(n);
    }
  });
  var notesHtml =
    uniqueNotes.length > 0
      ? uniqueNotes
          .map(function (n) {
            return '<div class="ob-note-item">' + escapeHtml(n) + "</div>";
          })
          .join("")
      : '<span class="ob-no-data">None</span>';

  return (
    '<div class="ob-detail" id="obDetailPanel">' +
    '<div class="ob-detail-title">' +
    "<h3>" +
    escapeHtml(entry.name) +
    "</h3>" +
    '<div class="ob-detail-stars" data-star-target="' +
    obEscapeAttr(entry.name) +
    '">' +
    obRenderStarPicker(entry.name, rating) +
    "</div>" +
    "</div>" +
    '<div class="ob-detail-stats">' +
    "<span>" +
    entry.rows.length +
    " variation" +
    (entry.rows.length > 1 ? "s" : "") +
    "</span>" +
    "<span>" +
    entry.formations.size +
    " formation" +
    (entry.formations.size !== 1 ? "s" : "") +
    "</span>" +
    "<span>" +
    escapeHtml(Array.from(entry.types).join(", ")) +
    "</span>" +
    "</div>" +
    '<div class="ob-detail-section"><div class="ob-section-title">\u{1F4E6} Base Concept</div><div class="ob-section-body">' +
    basePlaysHtml +
    "</div></div>" +
    '<div class="ob-detail-section"><div class="ob-section-title">\u{1F517} Constraints & Counters</div><div class="ob-section-body">' +
    constraintHtml +
    "</div></div>" +
    '<div class="ob-detail-section"><div class="ob-section-title">\u{1F6AB} Dead Vs</div><div class="ob-section-body">' +
    deadVsHtml +
    "</div></div>" +
    '<div class="ob-detail-section"><div class="ob-section-title">\u{1F464} Jimmys & Joes</div><div class="ob-section-body ob-kp-list">' +
    keyPlayerHtml +
    "</div></div>" +
    '<div class="ob-detail-section"><div class="ob-section-title">\u{1F3AF} Hit Chart Areas</div><div class="ob-section-body">' +
    hitChartHtml +
    "</div></div>" +
    '<div class="ob-detail-section"><div class="ob-section-title">\u{1F465} Personnel</div><div class="ob-section-body">' +
    personnelHtml +
    "</div></div>" +
    '<div class="ob-detail-section"><div class="ob-section-title">\u{1F4D0} Formations</div><div class="ob-section-body">' +
    formationsHtml +
    "</div></div>" +
    relatedHtml +
    '<div class="ob-detail-section"><div class="ob-section-title">\u{1F4CB} Variations (' +
    entry.rows.length +
    ")</div>" +
    '<div class="ob-plays-table-wrap"><table class="ob-plays-table">' +
    "<thead><tr><th>Inst</th><th>Formation</th><th>Personnel</th><th>Motion</th><th>Tags</th></tr></thead>" +
    "<tbody>" +
    rowHtml +
    "</tbody>" +
    "</table></div>" +
    "</div>" +
    '<div class="ob-detail-section"><div class="ob-section-title">\u{1F4DD} Notes</div><div class="ob-section-body">' +
    notesHtml +
    "</div></div>" +
    "</div>"
  );
}

// ── Attach interactive handlers in detail panel ────────────────────
function _obAttachDetailHandlers() {
  var panel = document.getElementById("obDetailPanel");
  if (!panel) return;

  // Constraint chip -> jump to a play under that concept
  var conceptChips = panel.querySelectorAll(
    ".ob-constraint-chip[data-concept]",
  );
  for (var i = 0; i < conceptChips.length; i++) {
    conceptChips[i].style.cursor = "pointer";
    conceptChips[i].addEventListener("click", function () {
      var concept = this.dataset.concept;
      if (!_obPlayMap) return;
      for (var entry of _obPlayMap) {
        var playName = entry[0];
        var data = entry[1];
        if (
          Array.from(data.basePlays).some(function (bp) {
            return bp.toLowerCase() === concept.toLowerCase();
          })
        ) {
          obActivePlayName = playName;
          obRenderPlayList();
          obRenderSidebar();
          return;
        }
      }
    });
  }

  // Related play chip -> jump to that play
  var relatedChips = panel.querySelectorAll("[data-related-play]");
  for (var j = 0; j < relatedChips.length; j++) {
    relatedChips[j].style.cursor = "pointer";
    relatedChips[j].addEventListener("click", function () {
      obActivePlayName = this.dataset.relatedPlay;
      obRenderPlayList();
      obRenderSidebar();
    });
  }

  // Star clicks inside detail panel
  var starContainer = panel.querySelector(".ob-detail-stars[data-star-target]");
  if (starContainer) {
    var playName = starContainer.dataset.starTarget;
    starContainer.addEventListener("click", function (e) {
      var star = e.target.closest(".ob-star");
      var clear = e.target.closest(".ob-star-clear");
      if (star) {
        var val = parseInt(star.dataset.value, 10);
        if (!isNaN(val)) obSetRating(playName, val);
      } else if (clear) {
        obSetRating(playName, 0);
      }
    });
  }
}

// ── Recommendations Panel HTML ─────────────────────────────────────
function _obBuildRecommendationsHtml(recs) {
  if (recs.length === 0) {
    return (
      '<div class="ob-recs">' +
      '<div class="ob-recs-title">\u{1F4A1} Recommendations</div>' +
      '<p class="ob-no-data">Rate some plays (\u2605) to get smart recommendations about gaps, balance, and key player depth.</p>' +
      "</div>"
    );
  }

  var severityOrder = { critical: 0, warn: 1, info: 2 };
  var sorted = recs.slice().sort(function (a, b) {
    return (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9);
  });
  var icons = { critical: "\u{1F534}", warn: "\u{1F7E1}", info: "\u{1F535}" };

  var rows = "";
  var limit = Math.min(sorted.length, 25);
  for (var i = 0; i < limit; i++) {
    var r = sorted[i];
    rows +=
      '<div class="ob-rec-row ob-rec-' +
      r.severity +
      '">' +
      '<span class="ob-rec-icon">' +
      (icons[r.severity] || "\u2139\uFE0F") +
      "</span>" +
      '<div class="ob-rec-body">' +
      '<div class="ob-rec-msg">' +
      escapeHtml(r.message) +
      "</div>" +
      (r.suggestion
        ? '<div class="ob-rec-sug">' + escapeHtml(r.suggestion) + "</div>"
        : "") +
      "</div>" +
      "</div>";
  }

  return (
    '<div class="ob-recs">' +
    '<div class="ob-recs-title">\u{1F4A1} Recommendations <span class="ob-recs-count">' +
    recs.length +
    "</span></div>" +
    rows +
    (recs.length > 25
      ? '<div class="ob-rec-more">+' + (recs.length - 25) + " more</div>"
      : "") +
    "</div>"
  );
}

// ── Helpers ─────────────────────────────────────────────────────────
function obEscapeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
