/* =========================================================================
   Game Plan — smart features (criteria detect, suggest fill, templates, health, touches, spotlight, coverage matrix, tendency mirror)
   Split out of gameplan.js — see AGENTS.md for ownership map.
   ========================================================================= */

function openGamePlanStats() {
  const board = _gpEnsureBoard();
  const allPlays = [];
  Object.values(board.assignments || {}).forEach((arr) => {
    (arr || []).forEach((p) => allPlays.push(p));
  });
  if (allPlays.length === 0) {
    showToast("No plays drafted yet.", { type: "warning" });
    return;
  }

  const tally = (key) => {
    const map = new Map();
    allPlays.forEach((p) => {
      const v = (p[key] || "").trim();
      if (!v) return;
      map.set(v, (map.get(v) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };

  const card = (title, rows) => `
    <div class="gp-stats-card">
      <div class="gp-stats-card-title">${escapeHtml(title)}</div>
      <div class="gp-stats-list">
        ${rows.length === 0
      ? `<div class="gp-stats-row"><span class="gp-stats-row-value">—</span></div>`
      : rows.map(([v, c]) => `
            <div class="gp-stats-row">
              <span class="gp-stats-row-value">${escapeHtml(v)}</span>
              <span class="gp-stats-row-count">${c}</span>
            </div>`).join("")}
      </div>
    </div>`;

  const html = `
    <div class="gp-stats-grid">
      ${card("Type", tally("type"))}
      ${card("Personnel", tally("personnel"))}
      ${card("Formation", tally("formation"))}
      ${card("Base Play / Family", tally("basePlay"))}
      ${card("Protection", tally("protection"))}
      ${card("Tempo", tally("tempo"))}
    </div>`;

  showModal(html, { title: `📊 Variety — ${allPlays.length} drafted plays` });
}
/**
 * Detect common preferred values across the box's current plays.
 * A value is "common" if it appears in >= threshold (default 0.5) of plays.
 * Returns a partial criteria object (only fields with detections).
 */
function _gpSmartDetectCriteriaFromBox(boxId, threshold = 0.5) {
  const board = _gpEnsureBoard();
  const list = (board.assignments[boxId] || []).slice();
  if (list.length === 0) return null;
  const splitPV = (v) =>
    typeof splitPreferredValues === "function" ? splitPreferredValues(v) : [];
  const counts = { down: {}, distance: {}, situation: {}, fieldPosition: {}, type: {} };
  list.forEach((p) => {
    const tally = (key, arr) => {
      const seen = new Set();
      arr.forEach((v) => {
        if (!v || seen.has(v)) return;
        seen.add(v);
        counts[key][v] = (counts[key][v] || 0) + 1;
      });
    };
    tally("down", splitPV(p.preferredDown));
    tally("distance", splitPV(p.preferredDistance));
    tally("situation", splitPV(p.preferredSituation));
    tally("fieldPosition", splitPV(p.preferredFieldPosition));
    tally("type", p.type ? [p.type] : []);
  });
  const out = _gpEmptyCriteria();
  const minHits = Math.max(1, Math.ceil(list.length * threshold));
  Object.keys(counts).forEach((k) => {
    Object.entries(counts[k]).forEach(([val, n]) => {
      if (n >= minHits) {
        // Restore canonical case for type
        if (k === "type") {
          const canonical = list.find((p) => (p.type || "").toLowerCase() === val);
          out.type.push(canonical ? canonical.type : val);
        } else {
          out[k].push(val);
        }
      }
    });
  });
  return out;
}

async function editGamePlanBoxMatching(boxId) {
  if (!boxId) return;
  const board = _gpEnsureBoard();
  const meta = _gpGetBoxMeta(board, boxId);
  // Resolve display label
  const allBoxes = [
    ...GP_DEFAULT_BOXES,
    ...((board.customBoxes || [])),
  ];
  const box = allBoxes.find((b) => b.id === boxId);
  const labelOverride = (board.boxLabels && board.boxLabels[boxId]) || (box && box.label) || boxId;

  // Build choice arrays
  const checks = (name, choices, selected, formatter) => choices
    .map((c) => {
      const checked = selected.includes(c) ? "checked" : "";
      const label = formatter ? formatter(c) : c;
      return `<label class="gp-meta-check"><input type="checkbox" data-meta-field="${name}" value="${escapeHtml(c)}" ${checked}> ${escapeHtml(label)}</label>`;
    })
    .join("");

  const csOptions = ["<option value=\"\">— None (auto-detect only) —</option>"]
    .concat(
      (typeof CALLSHEET_CATEGORIES !== "undefined" ? CALLSHEET_CATEGORIES : []).map((cat) => {
        const dn = typeof getCategoryDisplayName === "function" ? getCategoryDisplayName(cat) : cat.name;
        const sel = meta.callSheetCategoryId === cat.id ? "selected" : "";
        return `<option value="${escapeHtml(cat.id)}" ${sel}>${escapeHtml(dn)}</option>`;
      }),
    )
    .join("");

  // Remove any existing instance
  document.getElementById("gpBoxMatchingOverlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "gpBoxMatchingOverlay";
  overlay.innerHTML = `
    <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="gpBoxMatchingTitle" style="max-width:680px;">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">🧩</span>
        <h3 class="custom-modal-title" id="gpBoxMatchingTitle">Matching Rules — ${escapeHtml(labelOverride)}</h3>
      </div>
      <div class="custom-modal-body">
        <p style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin:0 0 var(--space-sm);">
          Plays whose preferred fields match these rules will be auto-routed into this box (Send to Game Plan)
          and pushed to the matching Call Sheet category (Push to Call Sheet).
        </p>
        <div class="gp-meta-grid" style="display:grid;gap:var(--space-sm);">
          <div>
            <strong>Down</strong>
            <div class="gp-meta-row">${checks("down", GP_DOWN_CHOICES, meta.criteria.down)}</div>
          </div>
          <div>
            <strong>Distance</strong>
            <div class="gp-meta-row">${checks("distance", GP_DISTANCE_CHOICES, meta.criteria.distance, (s) => s.replace(/\b\w/g, (m) => m.toUpperCase()))}</div>
          </div>
          <div>
            <strong>Situation</strong>
            <div class="gp-meta-row">${checks("situation", GP_SITUATION_CHOICES, meta.criteria.situation, (s) => s.replace(/\b\w/g, (m) => m.toUpperCase()))}</div>
          </div>
          <div>
            <strong>Field Position</strong>
            <div class="gp-meta-row">${checks("fieldPosition", GP_FIELD_POSITION_CHOICES, meta.criteria.fieldPosition, (s) => s.replace(/\b\w/g, (m) => m.toUpperCase()))}</div>
          </div>
          <div>
            <strong>Play Type</strong>
            <div class="gp-meta-row">${checks("type", GP_TYPE_CHOICES, meta.criteria.type)}</div>
          </div>
          <div>
            <strong>Key Player</strong>
            <input type="text" id="gpMetaKeyPlayer" placeholder="e.g. Marco" value="${escapeHtml(meta.criteria.keyPlayer || "")}" style="width:100%;padding:var(--space-xs);border:1px solid var(--color-border-input);border-radius:var(--radius-sm);background:var(--color-bg-input);" />
            <small style="color:var(--color-text-muted);">Matches against keyPlayerName1/2/3 on each play (case-insensitive).</small>
          </div>
          <div>
            <strong>Push to Call Sheet target</strong>
            <select id="gpMetaCsCategory" style="width:100%;padding:var(--space-xs);border:1px solid var(--color-border-input);border-radius:var(--radius-sm);background:var(--color-bg-input);">${csOptions}</select>
            <small style="color:var(--color-text-muted);">Optional. When set, this box always pushes to this category in addition to auto-detected ones.</small>
          </div>
        </div>
      </div>
      <div class="custom-modal-actions" style="justify-content:space-between;">
        <div style="display:flex;gap:var(--space-xs);">
          <button class="btn btn-sm btn-secondary" id="gpMetaSmartBtn" title="Auto-detect rules from this box's current plays">🪄 Smart Detect</button>
          <button class="btn btn-sm btn-warning" id="gpMetaClearBtn">Clear All</button>
        </div>
        <div style="display:flex;gap:var(--space-xs);">
          <button class="btn btn-sm" id="gpMetaCancelBtn">Cancel</button>
          <button class="btn btn-sm btn-primary" id="gpMetaSaveBtn">Save</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Inline styles for the meta rows so we don't need a CSS bump
  const style = document.createElement("style");
  style.textContent = `
    #gpBoxMatchingOverlay .gp-meta-row { display:flex; flex-wrap:wrap; gap:var(--space-xs); margin-top:var(--space-xs); }
    #gpBoxMatchingOverlay .gp-meta-check { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border:1px solid var(--color-border-light); border-radius:var(--radius-pill); cursor:pointer; font-size:var(--font-size-sm); background:var(--color-bg-light); }
    #gpBoxMatchingOverlay .gp-meta-check input { margin:0; }
    #gpBoxMatchingOverlay .gp-meta-check:has(input:checked) { background:var(--color-primary); color:var(--color-white); border-color:var(--color-primary); }
  `;
  overlay.appendChild(style);

  if (typeof trapFocus === "function") trapFocus(overlay);

  const close = () => {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 180);
  };

  const collectFromUI = () => {
    const out = _gpEmptyCriteria();
    overlay.querySelectorAll("input[type=checkbox][data-meta-field]").forEach((el) => {
      if (el.checked) out[el.dataset.metaField].push(el.value);
    });
    out.keyPlayer = (overlay.querySelector("#gpMetaKeyPlayer").value || "").trim();
    return out;
  };

  overlay.querySelector("#gpMetaCancelBtn").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } });

  overlay.querySelector("#gpMetaClearBtn").addEventListener("click", () => {
    overlay.querySelectorAll("input[type=checkbox][data-meta-field]").forEach((el) => { el.checked = false; });
    overlay.querySelector("#gpMetaKeyPlayer").value = "";
    overlay.querySelector("#gpMetaCsCategory").value = "";
  });

  overlay.querySelector("#gpMetaSmartBtn").addEventListener("click", () => {
    const detected = _gpSmartDetectCriteriaFromBox(boxId);
    if (!detected) {
      showToast("This box has no plays yet — nothing to detect.", { type: "warning" });
      return;
    }
    const hasAny = _gpHasCriteria(detected);
    if (!hasAny) {
      showToast("No common preferred fields found across the plays in this box.", { type: "warning", duration: 3500 });
      return;
    }
    overlay.querySelectorAll("input[type=checkbox][data-meta-field]").forEach((el) => {
      const field = el.dataset.metaField;
      el.checked = (detected[field] || []).some((v) => v === el.value);
    });
    showToast("Detected common values from this box.", { type: "success", duration: 1800 });
  });

  overlay.querySelector("#gpMetaSaveBtn").addEventListener("click", () => {
    const criteria = collectFromUI();
    const csCat = overlay.querySelector("#gpMetaCsCategory").value || null;
    _gpUpdateBoard((b) => {
      if (!b.boxMeta || typeof b.boxMeta !== "object") b.boxMeta = {};
      const hasAnything = _gpHasCriteria(criteria) || !!csCat;
      if (hasAnything) {
        b.boxMeta[boxId] = { criteria, callSheetCategoryId: csCat };
      } else {
        delete b.boxMeta[boxId];
      }
    });
    renderGamePlan();
    close();
    showToast("Box matching rules saved.", { type: "success", duration: 1800 });
  });
}
/* -------------------------------------------------------------------------
   Smart Fill (per box) — opens picker pre-filtered to box intent
   ------------------------------------------------------------------------- */

const GP_BOX_INTENT_TYPES = {
  Run: ["Run"],
  Pass: ["Pass", "Drop"],
  Screen: ["Screen"],
  Quick: ["Quick"],
  "Play Action": ["Play Action", "Play Pass"],
  RPO: ["RPO"],
  "Run Option": ["Run Option"],
  Movement: ["Movement"],
};

// Vision Mode: per-box preferred Picture order. When Vision is ON, the
// 💡 Suggest list ranks plays whose Picture matches the box's preference
// before plays without a Picture tag. Run-flavored boxes lead with Wide
// Zone; pass-flavored boxes lead with Pullers (conflict throws); etc.
// Boxes not listed fall back to no Picture preference.
const GP_BOX_PICTURE_PREF = {
  Run: ["wideZone", "pullers", "downhill", "antiFront"],
  RPO: ["wideZone", "pullers", "downhill", "antiFront"],
  "Run Option": ["wideZone", "pullers", "downhill"],
  Pass: ["pullers", "wideZone", "downhill", "antiFront"],
  "Play Action": ["wideZone", "pullers", "downhill"],
  Movement: ["wideZone", "pullers"],
  Screen: [],
  Quick: ["pullers", "wideZone"],
};

async function gpSuggestFillBox(boxId) {
  if (!boxId || !Array.isArray(plays)) return;
  const board = _gpEnsureBoard();
  const inBoxSigs = new Set((board.assignments[boxId] || []).map(_gpPlaySignature));
  const intent = GP_BOX_INTENT_TYPES[boxId];
  let candidates = plays.filter((p) => !inBoxSigs.has(_gpPlaySignature(p)));
  if (Array.isArray(intent) && intent.length > 0) {
    candidates = candidates.filter((p) => intent.includes(p.type));
  }
  // Rank: opponent-tagged first, then by base play group, then alphabetical
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const opponent = gw && gw.opponentName ? gw.opponentName : null;
  const visionOn = typeof isVisionMode === "function" && isVisionMode();
  const pictureOrder = visionOn ? (GP_BOX_PICTURE_PREF[boxId] || []) : [];
  const pictureRank = (p) => {
    if (!visionOn || pictureOrder.length === 0) return 99;
    if (typeof getPlayPicture !== "function") return 99;
    const pic = getPlayPicture(p);
    if (!pic) return 50; // untagged sorts after matched, before unmatched
    const idx = pictureOrder.indexOf(pic);
    return idx === -1 ? 60 : idx;
  };
  candidates.sort((a, b) => {
    if (opponent && typeof isPlayTaggedForOpponent === "function") {
      const ta = isPlayTaggedForOpponent(a, opponent) ? 0 : 1;
      const tb = isPlayTaggedForOpponent(b, opponent) ? 0 : 1;
      if (ta !== tb) return ta - tb;
    }
    const pa = pictureRank(a);
    const pb = pictureRank(b);
    if (pa !== pb) return pa - pb;
    return (a.play || "").localeCompare(b.play || "");
  });
  if (candidates.length === 0) {
    showToast(intent ? `No more ${intent.join("/")} plays available.` : "No more plays available.", { type: "warning" });
    return;
  }
  const assignedSigs = _gpAllAssignedSigs(board);
  const pictureLabels = {
    wideZone: "🌊 WZ",
    pullers: "🔁 Pull",
    downhill: "⛏ DH",
    antiFront: "🧱 AF",
  };
  const items = candidates.map((p) => {
    const sig = _gpPlaySignature(p);
    const tagged = opponent && typeof isPlayTaggedForOpponent === "function" && isPlayTaggedForOpponent(p, opponent) ? "🎯 " : "";
    const pic = visionOn && typeof getPlayPicture === "function" ? getPlayPicture(p) : null;
    const picBadge = pic && pictureLabels[pic] ? ` [${pictureLabels[pic]}]` : "";
    const dup = assignedSigs.has(sig) ? " ⓘ on board" : "";
    const label = tagged + [p.type, p.formation, p.personnel, p.play].filter(Boolean).join(" • ") + picBadge + dup;
    return { value: sig, label };
  });
  const choice = await showListPicker(
    `💡 ${candidates.length} suggestion${candidates.length === 1 ? "" : "s"} for ${boxId}${opponent ? ` (opponent-tagged first)` : ""}${visionOn && pictureOrder.length ? ` • 🎯 Vision: ${pictureOrder.map((k) => pictureLabels[k] || k).join(" → ")}` : ""}:`,
    items,
    { title: "Smart Fill", icon: "💡" },
  );
  if (!choice) return;
  _gpAddSigsToBox([choice], boxId);
}
/* -------------------------------------------------------------------------
   Add Bucket — template-driven custom box creator
   ------------------------------------------------------------------------- */

const GP_BUCKET_TEMPLATES = [
  {
    id: "blank", icon: "📦", label: "Blank Bucket",
    description: "Free-form box. Add any plays you want.",
    promptName: "Bucket name:", defaultName: ""
  },
  {
    id: "down-distance", icon: "🔢", label: "Down & Distance",
    description: "Auto-target plays for a specific down/distance situation.",
    fields: [
      { key: "preferredDown", label: "Down", options: ["1", "2", "3", "4"] },
      { key: "preferredDistance", label: "Distance", options: ["Short", "Medium", "Long"] },
    ]
  },
  {
    id: "field-position", icon: "🟩", label: "Field Position",
    description: "Auto-target plays preferred for a specific zone of the field.",
    fields: [
      {
        key: "preferredFieldPosition", label: "Position",
        options: ["Green", "Lo-RZ", "Hi-RZ", "Goal Line", "Backed Up", "Saigon"]
      },
    ]
  },
  {
    id: "situation", icon: "🕒", label: "Special Situation",
    description: "Short Yardage / 2-Min / 4-Min plays.",
    fields: [
      {
        key: "preferredSituation", label: "Situation",
        options: ["Short Yardage", "2 Minute", "4 Minute"]
      },
    ]
  },
  {
    id: "tempo", icon: "⏱️", label: "Tempo Group",
    description: "Group plays by tempo designation.",
    fields: [{ key: "tempo", label: "Tempo", source: "tempo" }]
  },
  {
    id: "personnel", icon: "🧮", label: "Personnel Group",
    description: "Group plays by personnel.",
    fields: [{ key: "personnel", label: "Personnel", source: "personnel" }]
  },
  {
    id: "formation", icon: "📐", label: "Formation Group",
    description: "Group plays by formation.",
    fields: [{ key: "formation", label: "Formation", source: "formation" }]
  },
  {
    id: "vs-coverage", icon: "🛡️", label: "vs. Defense",
    description: "Plays tagged good vs. specific fronts/coverages.",
    fields: [
      { key: "vsTag", label: "Versus", options: ["Man", "Bear", "Okie"] },
    ]
  },
  {
    id: "must-haves", icon: "⭐", label: "Must Haves",
    description: "Free-form list of staple plays you must run this game.",
    promptName: "Bucket name:", defaultName: "Must Haves"
  },
  {
    id: "openers", icon: "🚀", label: "Openers / Script",
    description: "First 10–15 scripted plays.",
    promptName: "Bucket name:", defaultName: "Openers"
  },
];

function _gpUniqueValues(field) {
  if (!Array.isArray(plays)) return [];
  const seen = new Set();
  plays.forEach((p) => {
    const v = p[field];
    if (v && typeof v === "string") seen.add(v.trim());
  });
  return Array.from(seen).sort();
}

async function openGamePlanAddBucket() {
  const items = GP_BUCKET_TEMPLATES.map((t) => ({
    value: t.id,
    label: `${t.icon}  ${t.label} — ${t.description}`,
  }));
  const choice = await showListPicker(
    "Pick a bucket template:",
    items,
    { title: "➕ Add Bucket", icon: "➕" },
  );
  if (!choice) return;
  const template = GP_BUCKET_TEMPLATES.find((t) => t.id === choice);
  if (!template) return;
  await _gpCreateBucketFromTemplate(template);
}

async function _gpCreateBucketFromTemplate(template) {
  // Resolve dynamic field values via per-field pickers
  const filterCriteria = {};
  let dynamicLabelPart = "";
  if (Array.isArray(template.fields)) {
    for (const field of template.fields) {
      let opts = field.options;
      if (!opts && field.source) opts = _gpUniqueValues(field.source);
      if (!opts || opts.length === 0) {
        showToast(`No values found for ${field.label}.`, { type: "warning" });
        return;
      }
      const picked = await showListPicker(
        `Pick ${field.label}:`,
        opts.map((o) => ({ value: o, label: o })),
        { title: `${template.icon} ${template.label}`, icon: template.icon },
      );
      if (!picked) return;
      filterCriteria[field.key] = picked;
      dynamicLabelPart = dynamicLabelPart ? `${dynamicLabelPart} · ${picked}` : picked;
    }
  }

  // Compose default name
  let defaultName = template.defaultName || "";
  if (!defaultName) {
    if (template.id === "down-distance") defaultName = `${filterCriteria.preferredDown}rd & ${filterCriteria.preferredDistance}`;
    else if (template.id === "field-position") defaultName = filterCriteria.preferredFieldPosition;
    else if (template.id === "situation") defaultName = filterCriteria.preferredSituation;
    else if (template.id === "tempo") defaultName = `${filterCriteria.tempo} Tempo`;
    else if (template.id === "personnel") defaultName = `${filterCriteria.personnel} Pers`;
    else if (template.id === "formation") defaultName = filterCriteria.formation;
    else if (template.id === "vs-coverage") defaultName = `vs ${filterCriteria.vsTag}`;
  }
  const name = await showPrompt("Bucket name:", defaultName, {
    title: `${template.icon} ${template.label}`,
    icon: template.icon,
    placeholder: "Bucket name",
  });
  if (!name || !name.trim()) return;
  const trimmed = name.trim();

  // Generate unique id
  const board = _gpEnsureBoard();
  const taken = new Set([
    ...GP_DEFAULT_BOXES.map((b) => b.id),
    ...(board.customBoxes || []).map((b) => b.id),
    GP_HOLDING_ID,
  ]);
  let id = trimmed;
  let n = 2;
  while (taken.has(id)) id = `${trimmed} ${n++}`;

  _gpUpdateBoard((b) => {
    b.customBoxes = b.customBoxes || [];
    b.customBoxes.push({ id, label: trimmed, template: template.id, criteria: filterCriteria });
    b.assignments[id] = [];
  });

  // Auto-fill if a template specified criteria
  if (template.fields && Array.isArray(plays) && plays.length > 0) {
    const matches = plays.filter((p) => _gpPlayMatchesTemplateCriteria(p, template.id, filterCriteria));
    if (matches.length > 0) {
      const ok = await showConfirm(
        `Found <strong>${matches.length}</strong> play${matches.length === 1 ? "" : "s"} matching this template. Add them all to the new bucket?`,
        { title: "Auto-fill bucket?", icon: "✨", confirmText: `Add ${matches.length}`, cancelText: "Skip" },
      );
      if (ok) {
        _gpAddSigsToBox(matches.map(_gpPlaySignature), id);
        showToast(`Added ${matches.length} plays to “${trimmed}”`, { type: "success" });
      }
    } else {
      showToast(`Bucket “${trimmed}” added (no matching plays yet)`, { type: "info" });
    }
  } else {
    showToast(`Added bucket “${trimmed}”`, { type: "success" });
  }
  renderGamePlan();
}

function _gpPlayMatchesTemplateCriteria(play, templateId, criteria) {
  if (!play || !criteria) return false;
  if (templateId === "vs-coverage") {
    if (criteria.vsTag === "Man") return !!play.goodVsMan;
    if (criteria.vsTag === "Bear") return !!play.goodVsBear;
    if (criteria.vsTag === "Okie") return !!play.goodVsOkie;
    return false;
  }
  return Object.entries(criteria).every(([k, v]) => (play[k] || "") === v);
}
/* -------------------------------------------------------------------------
   Plan Health Score
   ------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------
   Player Touch Tracker
   ------------------------------------------------------------------------- */

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

// True if a play matches the active spotlight (used to highlight plays in boxes).
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
/* -------------------------------------------------------------------------
   Coverage Matrix (heatmap: rows = boxes, cols = scenarios)
   ------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------
   Tendency Mirror — match opponent defensive tendencies vs offense plan
   ------------------------------------------------------------------------- */

function _gpResolveOpponentTendencies() {
  if (!Array.isArray(window.tendenciesOpponents) || window.tendenciesOpponents.length === 0) return null;
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const oppName = gw && gw.opponentName ? gw.opponentName : null;
  if (oppName) {
    const exact = window.tendenciesOpponents.find((o) => o.name && o.name.toLowerCase() === oppName.toLowerCase());
    if (exact) return exact;
  }
  // Fallback: current opponent index
  if (typeof window.tendenciesCurrentOpponent === "number" && window.tendenciesOpponents[window.tendenciesCurrentOpponent]) {
    return window.tendenciesOpponents[window.tendenciesCurrentOpponent];
  }
  return window.tendenciesOpponents[0];
}

function openGamePlanTendencyMirror() {
  const opp = _gpResolveOpponentTendencies();
  if (!opp || !Array.isArray(opp.plays) || opp.plays.length === 0) {
    showToast("No defensive tendencies recorded for this opponent. Chart some on the Tendencies tab first.", { type: "warning", duration: 4000 });
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
