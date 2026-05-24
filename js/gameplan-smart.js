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
   Smart Plan Builder — plan-level recommendations
   ------------------------------------------------------------------------- */

const GP_SMART_PUSH_LIMIT_PER_GROUP = 5;

function _gpSmartPreferredHas(play, field, values) {
  const wanted = values.map((value) => String(value || "").toLowerCase());
  const actual = typeof splitPreferredValues === "function"
    ? splitPreferredValues(play?.[field])
    : String(play?.[field] || "").toLowerCase().split(/[,|;\/]+/).map((v) => v.trim());
  return actual.some((value) => wanted.includes(value));
}

function _gpSmartTextHas(play, fields, needles) {
  const haystack = fields.map((field) => String(play?.[field] || "")).join(" ").toLowerCase();
  return needles.some((needle) => haystack.includes(String(needle).toLowerCase()));
}

function _gpSmartNorm(value) {
  return String(value || "").trim().toLowerCase();
}

function _gpSmartConstraintValues(play) {
  return [play?.constraint1, play?.constraint2, play?.constraint3]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function _gpSmartPlayLabel(play) {
  return [play?.type, play?.personnel, play?.formation, play?.play || play?.basePlay]
    .filter(Boolean)
    .join(" • ") || "Unnamed play";
}

function _gpSmartBuildTendencyContext(opponentName) {
  const opponent = typeof _gpResolveOpponentTendencies === "function"
    ? _gpResolveOpponentTendencies()
    : null;
  if (!opponent || !Array.isArray(opponent.plays) || opponent.plays.length === 0) return null;
  if (typeof queryTendencies !== "function") return null;
  const intel = queryTendencies(opponent, {});
  const snapCount = intel?.total || intel?.plays?.length || opponent.plays.length || 0;
  if (!snapCount) return null;
  return {
    opponentName: opponent.name || opponentName || "",
    snapCount,
    summary: intel.summary || "",
    topFront: (intel.topFront || []).slice(0, 3),
    topCoverage: (intel.topCoverage || []).slice(0, 3),
    topBlitz: (intel.topBlitz || []).slice(0, 3),
    blitzRate: intel.blitzRate || 0,
  };
}

function _gpSmartDefenseItemFamily(item, category) {
  if (item?.family?.family) return item.family.family;
  if (typeof item?.family === "string") return item.family;
  if (typeof normalizeDefense !== "function") return "";
  return normalizeDefense(item?.term || item, category)?.family || "";
}

function _gpSmartMatchesDefenseTerm(value, items, category) {
  const actual = _gpSmartNorm(value);
  if (!actual || !Array.isArray(items) || items.length === 0) return null;
  const actualFamily = typeof normalizeDefense === "function"
    ? normalizeDefense(value, category)?.family || ""
    : "";
  return items.find((item) => {
    const term = _gpSmartNorm(item?.term || item);
    if (!term) return false;
    if (actual === term) return true;
    if (actual.length >= 3 && term.length >= 3 && (actual.includes(term) || term.includes(actual))) return true;
    const itemFamily = _gpSmartDefenseItemFamily(item, category);
    return actualFamily && itemFamily && actualFamily === itemFamily;
  }) || null;
}

function _gpSmartTendencyBoost(play, ctx) {
  const tendency = ctx?.tendency;
  if (!tendency) return { score: 0, reasons: [] };
  let score = 0;
  const reasons = [];
  const add = (points, reason) => {
    score += points;
    if (reason && !reasons.includes(reason)) reasons.push(reason);
  };

  const front = _gpSmartMatchesDefenseTerm(play?.practiceFront, tendency.topFront, "front");
  if (front) add(16, `vs ${front.term || front} front`);

  const coverage = _gpSmartMatchesDefenseTerm(play?.practiceCoverage, tendency.topCoverage, "coverage");
  if (coverage) add(18, `matches ${coverage.term || coverage}`);

  if (tendency.blitzRate >= 35) {
    const isAnswerType = ["Screen", "Quick", "RPO", "Movement"].includes(play?.type);
    const tagsPressure = _gpSmartTextHas(play, ["notes", "deadVs", "practiceBlitz", "play", "basePlay"], [
      "pressure",
      "blitz",
      "zero",
      "hot",
      "sight",
    ]);
    if (isAnswerType || tagsPressure) add(16, `${tendency.blitzRate}% blitz answer`);
  }

  const blitz = _gpSmartMatchesDefenseTerm(play?.practiceBlitz, tendency.topBlitz, "blitz");
  if (blitz) add(14, `preps ${blitz.term || blitz}`);

  if (typeof checkDeadVs === "function" && (tendency.topCoverage[0]?.term || tendency.topFront[0]?.term)) {
    const dead = checkDeadVs(play, tendency.topCoverage[0]?.term || "", tendency.topFront[0]?.term || "");
    if (dead?.isDead) {
      score -= 35;
      reasons.push(dead.reasons[0] || "dead vs top look");
    }
  }

  return { score, reasons };
}

function _gpSmartBaseScore(play, ctx) {
  let score = 0;
  if (ctx.opponent && typeof isPlayTaggedForOpponent === "function" && isPlayTaggedForOpponent(play, ctx.opponent)) {
    score += 40;
  }
  if (play?.oneWord) score += 10;
  if (play?.basePlay && (ctx.baseCounts.get(play.basePlay) || 0) >= 2) score += 8;
  if (play?.keyPlayerName1 || play?.keyPlayerName2 || play?.keyPlayerName3) score += 6;
  if (play?.preferredHash) score += 3;
  score += _gpSmartTendencyBoost(play, ctx).score;
  return score;
}

const GP_SMART_PLAN_GROUPS = [
  {
    id: "openers",
    icon: "🚀",
    label: "Openers",
    targetId: "Openers",
    targetLabel: "Openers",
    description: "Calls that can start the plan cleanly and reveal how the defense wants to play you.",
    limit: 8,
    evaluate(play, ctx) {
      let score = _gpSmartBaseScore(play, ctx);
      const reasons = [];
      reasons.push(..._gpSmartTendencyBoost(play, ctx).reasons);
      if (_gpSmartPreferredHas(play, "preferredSituation", ["opener"])) {
        score += 45;
        reasons.push("opener tag");
      }
      if (_gpSmartPreferredHas(play, "preferredDown", ["1"])) {
        score += 28;
        reasons.push("1st down");
      }
      if (["Run", "Quick", "RPO", "Play Action", "Movement"].includes(play?.type)) {
        score += 12;
        reasons.push(play.type);
      }
      if (!_gpSmartPreferredHas(play, "preferredFieldPosition", ["goal line", "backed up", "saigon"])) {
        score += 6;
      }
      return score >= 36 ? { score, reason: reasons.slice(0, 3).join(" / ") || "clean early-down call" } : null;
    },
  },
  {
    id: "must-haves",
    icon: "⭐",
    label: "Must-Haves",
    targetId: "Must Haves",
    targetLabel: "Must Haves",
    description: "Identity calls and opponent-tagged plays that should make the weekly menu.",
    limit: 8,
    evaluate(play, ctx) {
      let score = _gpSmartBaseScore(play, ctx);
      const reasons = [];
      reasons.push(..._gpSmartTendencyBoost(play, ctx).reasons);
      if (ctx.opponent && typeof isPlayTaggedForOpponent === "function" && isPlayTaggedForOpponent(play, ctx.opponent)) {
        reasons.push("opponent tagged");
      }
      if (play?.oneWord) {
        score += 22;
        reasons.push("one-word");
      }
      if (play?.basePlay && (ctx.baseCounts.get(play.basePlay) || 0) >= 2) {
        score += 18;
        reasons.push(`${play.basePlay} family`);
      }
      if (_gpSmartPreferredHas(play, "preferredSituation", ["short yardage", "4 minute"])) {
        score += 14;
        reasons.push("situational staple");
      }
      return score >= 30 ? { score, reason: reasons.slice(0, 3).join(" / ") || "identity call" } : null;
    },
  },
  {
    id: "answers",
    icon: "🧯",
    label: "Answers",
    targetId: "Answers",
    targetLabel: "Answers",
    description: "Pressure, coverage, leverage, and conflict answers to keep the call sheet flexible.",
    limit: 8,
    evaluate(play, ctx) {
      let score = _gpSmartBaseScore(play, ctx);
      const reasons = [];
      reasons.push(..._gpSmartTendencyBoost(play, ctx).reasons);
      if (["Screen", "Quick", "RPO", "Movement"].includes(play?.type)) {
        score += 30;
        reasons.push(play.type);
      }
      [["goodVsMan", "man"], ["goodVsBear", "bear"], ["goodVsOkie", "okie"]].forEach(([field, label]) => {
        if (play?.[field]) {
          score += 18;
          reasons.push(`vs ${label}`);
        }
      });
      if (_gpSmartTextHas(play, ["notes", "deadVs", "practiceBlitz"], ["pressure", "blitz", "zero", "hot", "man"])) {
        score += 14;
        reasons.push("pressure answer");
      }
      return score >= 34 ? { score, reason: reasons.slice(0, 3).join(" / ") || "defensive answer" } : null;
    },
  },
  {
    id: "constraints",
    icon: "🔗",
    label: "Constraints",
    targetId: "Constraints",
    targetLabel: "Constraints",
    description: "Complements and constraint calls that protect your best concepts.",
    limit: 8,
    evaluate(play, ctx) {
      const constraints = _gpSmartConstraintValues(play);
      let score = _gpSmartBaseScore(play, ctx) + constraints.length * 22;
      const tendency = _gpSmartTendencyBoost(play, ctx);
      const referenced = ctx.constraintTargets.has(String(play?.play || "").trim())
        || ctx.constraintTargets.has(String(play?.basePlay || "").trim());
      if (referenced) score += 18;
      if (constraints.length === 0 && !referenced) return null;
      const reasons = [constraints.length
        ? `links to ${constraints.slice(0, 2).join(" / ")}`
        : "named as a complement"];
      reasons.push(...tendency.reasons);
      return { score, reason: reasons.slice(0, 3).join(" / ") };
    },
  },
  {
    id: "situational",
    icon: "📍",
    label: "Situational",
    targetId: "Situational",
    targetLabel: "Situational",
    description: "Third down, red zone, backed-up, two-minute, four-minute, and finish-the-drive calls.",
    limit: 10,
    evaluate(play, ctx) {
      let score = _gpSmartBaseScore(play, ctx);
      const reasons = [];
      reasons.push(..._gpSmartTendencyBoost(play, ctx).reasons);
      if (_gpSmartPreferredHas(play, "preferredDown", ["3", "4"])) {
        score += 24;
        reasons.push(`${play.preferredDown} down`);
      }
      if (_gpSmartPreferredHas(play, "preferredDistance", ["short", "long"])) {
        score += 12;
        reasons.push(play.preferredDistance);
      }
      if (_gpSmartPreferredHas(play, "preferredFieldPosition", ["lo-rz", "hi-rz", "goal line", "backed up", "saigon"])) {
        score += 22;
        reasons.push(play.preferredFieldPosition);
      }
      if (_gpSmartPreferredHas(play, "preferredSituation", ["short yardage", "2 minute", "4 minute"])) {
        score += 22;
        reasons.push(play.preferredSituation);
      }
      return score >= 30 ? { score, reason: reasons.slice(0, 3).join(" / ") || "situational fit" } : null;
    },
  },
];

function _gpSmartRankCandidates(candidates, limit) {
  const sorted = candidates.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return _gpSmartPlayLabel(a.play).localeCompare(_gpSmartPlayLabel(b.play));
  });
  const selected = [];
  const seenFamilies = new Set();
  sorted.forEach((item) => {
    if (selected.length >= limit) return;
    const family = String(item.play?.basePlay || item.play?.play || "").toLowerCase();
    if (family && seenFamilies.has(family) && selected.length < Math.ceil(limit / 2)) return;
    selected.push(item);
    if (family) seenFamilies.add(family);
  });
  sorted.forEach((item) => {
    if (selected.length >= limit) return;
    if (!selected.some((chosen) => chosen.sig === item.sig)) selected.push(item);
  });
  return selected;
}

function _gpSmartConceptKey(value) {
  return _gpSmartNorm(value).replace(/\s+/g, " ");
}

function _gpSmartConceptLabel(play) {
  return String(play?.basePlay || play?.play || "").trim();
}

function _gpSmartConceptMatchesValue(value, target) {
  const actual = _gpSmartConceptKey(value);
  const wanted = _gpSmartConceptKey(target);
  if (!actual || !wanted) return false;
  if (actual === wanted) return true;
  return actual.length >= 4 && wanted.length >= 4 && (actual.includes(wanted) || wanted.includes(actual));
}

function _gpSmartPlayMatchesConcept(play, target) {
  return ["play", "basePlay", "oneWord"].some((field) => _gpSmartConceptMatchesValue(play?.[field], target));
}

function _gpSmartFindComplementCandidates(target, ctx) {
  const candidates = [];
  const seen = new Set();
  (plays || []).forEach((play) => {
    if (!_gpSmartPlayMatchesConcept(play, target)) return;
    const sig = _gpPlaySignature(play);
    if (seen.has(sig)) return;
    seen.add(sig);
    candidates.push({
      play,
      sig,
      score: _gpSmartBaseScore(play, ctx) + 30,
      reason: "fills missing complement",
    });
  });
  return _gpSmartRankCandidates(candidates, 3);
}

function _gpSmartBuildBalanceInsights(board, ctx) {
  const drafted = typeof _gpAllDraftedPlays === "function" ? _gpAllDraftedPlays(board) : [];
  const missingMap = new Map();
  const conceptCounts = new Map();

  drafted.forEach((play) => {
    const concept = _gpSmartConceptLabel(play);
    if (concept) {
      const key = _gpSmartConceptKey(concept);
      if (!conceptCounts.has(key)) conceptCounts.set(key, { label: concept, count: 0 });
      conceptCounts.get(key).count += 1;
    }

    _gpSmartConstraintValues(play).forEach((target) => {
      const key = _gpSmartConceptKey(target);
      if (!key) return;
      const isDrafted = drafted.some((draftedPlay) => _gpSmartPlayMatchesConcept(draftedPlay, target));
      if (isDrafted) return;
      if (!missingMap.has(key)) {
        missingMap.set(key, {
          target,
          sources: [],
          candidates: _gpSmartFindComplementCandidates(target, ctx),
        });
      }
      const source = _gpSmartPlayLabel(play);
      const item = missingMap.get(key);
      if (!item.sources.includes(source)) item.sources.push(source);
    });
  });

  const missingComplements = Array.from(missingMap.values())
    .sort((a, b) => {
      if (b.candidates.length !== a.candidates.length) return b.candidates.length - a.candidates.length;
      if (b.sources.length !== a.sources.length) return b.sources.length - a.sources.length;
      return a.target.localeCompare(b.target);
    })
    .slice(0, 5);

  const overloadThreshold = drafted.length > 0 ? Math.max(3, Math.ceil(drafted.length * 0.35)) : 0;
  const overloadedConcepts = Array.from(conceptCounts.values())
    .filter((item) => item.count >= overloadThreshold && item.count > 1)
    .map((item) => ({
      ...item,
      pct: drafted.length > 0 ? Math.round((item.count / drafted.length) * 100) : 0,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    })
    .slice(0, 4);

  return {
    draftedCount: drafted.length,
    missingComplements,
    overloadedConcepts,
  };
}

function _gpBuildSmartPlanRecommendations() {
  const board = _gpEnsureBoard();
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const opponent = gw?.opponentName || "";
  const tendency = _gpSmartBuildTendencyContext(opponent);
  const baseCounts = new Map();
  const constraintTargets = new Set();
  (plays || []).forEach((play) => {
    if (play?.basePlay) baseCounts.set(play.basePlay, (baseCounts.get(play.basePlay) || 0) + 1);
    _gpSmartConstraintValues(play).forEach((value) => constraintTargets.add(value));
  });
  const ctx = {
    board,
    opponent,
    tendency,
    baseCounts,
    constraintTargets,
  };
  const groups = GP_SMART_PLAN_GROUPS.map((group) => {
    const candidates = [];
    (plays || []).forEach((play) => {
      const result = group.evaluate(play, ctx);
      if (!result) return;
      candidates.push({
        play,
        sig: _gpPlaySignature(play),
        score: result.score,
        reason: result.reason,
      });
    });
    return {
      ...group,
      candidates: _gpSmartRankCandidates(candidates, group.limit),
    };
  });
  const balance = _gpSmartBuildBalanceInsights(board, ctx);
  return {
    opponent,
    tendency,
    balance,
    totalPlays: Array.isArray(plays) ? plays.length : 0,
    groups,
  };
}

function _gpSmartCollectPushItems(recs, opts = {}) {
  const source = recs || _gpBuildSmartPlanRecommendations();
  const limit = Math.max(1, Number(opts.limitPerGroup) || GP_SMART_PUSH_LIMIT_PER_GROUP);
  const seen = new Set();
  const items = [];
  (source.groups || []).forEach((group) => {
    (group.candidates || []).slice(0, limit).forEach((item) => {
      if (!item?.sig || seen.has(item.sig)) return;
      seen.add(item.sig);
      items.push({
        group,
        play: item.play,
        sig: item.sig,
        reason: item.reason,
      });
    });
  });
  return items;
}

function _gpSmartGroupPushItems(items) {
  const groups = [];
  const byId = new Map();
  items.forEach((entry) => {
    const id = entry.group?.id || "smart";
    if (!byId.has(id)) {
      const bucket = { group: entry.group, entries: [] };
      byId.set(id, bucket);
      groups.push(bucket);
    }
    byId.get(id).entries.push(entry);
  });
  return groups;
}

function _gpSmartEnsureCallSheetBuckets() {
  if (typeof callSheet !== "object" || !callSheet) return;
  if (typeof CALLSHEET_CATEGORIES === "undefined" || !Array.isArray(CALLSHEET_CATEGORIES)) return;
  CALLSHEET_CATEGORIES.forEach((cat) => {
    if (!callSheet[cat.id]) callSheet[cat.id] = { left: [], right: [] };
    if (!Array.isArray(callSheet[cat.id].left)) callSheet[cat.id].left = [];
    if (!Array.isArray(callSheet[cat.id].right)) callSheet[cat.id].right = [];
  });
}

function _gpSmartArg(payload) {
  return escapeAttr(JSON.stringify(payload));
}

function _gpRenderSmartRecommendationRow(group, item) {
  const callHtml = typeof getFullCall === "function"
    ? getFullCall(item.play, { showLineCall: false })
    : escapeHtml(item.play?.play || item.play?.basePlay || "Unnamed play");
  const meta = [item.play?.type, item.play?.personnel, item.play?.formation]
    .filter(Boolean)
    .join(" • ");
  return `
    <div class="gp-smart-builder-play">
      <div class="gp-smart-builder-play-copy">
        <div class="gp-smart-builder-call">${callHtml}</div>
        <div class="gp-smart-builder-meta">${escapeHtml([meta, item.reason].filter(Boolean).join(" — "))}</div>
      </div>
      <button class="btn btn-sm" type="button" data-action="addSmartGamePlanRecommendation"
        data-arg="${_gpSmartArg({ groupId: group.id, sig: item.sig })}">Add</button>
    </div>`;
}

function _gpRenderSmartRecommendationGroup(group) {
  const rows = group.candidates.length
    ? group.candidates.map((item) => _gpRenderSmartRecommendationRow(group, item)).join("")
    : `<div class="gp-smart-builder-empty">No matching plays found for this lane yet.</div>`;
  return `
    <section class="gp-smart-builder-group">
      <div class="gp-smart-builder-group-head">
        <div>
          <h4>${escapeHtml(group.icon)} ${escapeHtml(group.label)}</h4>
          <p>${escapeHtml(group.description)}</p>
        </div>
        <button class="btn btn-sm btn-primary" type="button" data-action="addSmartGamePlanRecommendationGroup"
          data-arg="${escapeAttr(group.id)}" ${group.candidates.length === 0 ? "disabled" : ""}>
          Add Top ${group.candidates.length}
        </button>
      </div>
      <div class="gp-smart-builder-target">Target bucket: <strong>${escapeHtml(group.targetLabel)}</strong></div>
      <div class="gp-smart-builder-list">${rows}</div>
    </section>`;
}

function _gpRenderSmartTendencySummary(tendency) {
  if (!tendency) {
    return `
      <div class="gp-smart-builder-tendency is-empty">
        <span class="gp-smart-builder-tendency-label">No opponent tendency data connected yet.</span>
      </div>`;
  }
  const chips = [];
  if (tendency.topFront[0]) chips.push(`<span class="gp-smart-builder-tendency-chip">${escapeHtml(tendency.topFront[0].term)} front · ${tendency.topFront[0].pct}%</span>`);
  if (tendency.topCoverage[0]) chips.push(`<span class="gp-smart-builder-tendency-chip">${escapeHtml(tendency.topCoverage[0].term)} · ${tendency.topCoverage[0].pct}%</span>`);
  if (tendency.topBlitz[0]) chips.push(`<span class="gp-smart-builder-tendency-chip">${escapeHtml(tendency.topBlitz[0].term)} · ${tendency.topBlitz[0].pct}%</span>`);
  if (tendency.blitzRate > 0) chips.push(`<span class="gp-smart-builder-tendency-chip">${tendency.blitzRate}% blitz</span>`);
  return `
    <div class="gp-smart-builder-tendency">
      <span class="gp-smart-builder-tendency-label">Tendency boost: ${escapeHtml(tendency.opponentName || "Opponent")}</span>
      <div class="gp-smart-builder-tendency-items">
        ${chips.join("") || `<span class="gp-smart-builder-tendency-chip">${escapeHtml(tendency.summary || `${tendency.snapCount} charted snaps`)}</span>`}
      </div>
      <span class="gp-smart-builder-tendency-note">${tendency.snapCount} charted snap${tendency.snapCount === 1 ? "" : "s"} factored into the rankings.</span>
    </div>`;
}

function _gpRenderSmartBalanceComplement(item) {
  const sourceText = item.sources.length > 0
    ? `Requested by ${item.sources.slice(0, 2).join(" / ")}${item.sources.length > 2 ? ` +${item.sources.length - 2} more` : ""}`
    : "Referenced by drafted plays";
  const candidateButtons = item.candidates.length
    ? item.candidates.map((candidate) => `
        <button class="btn btn-sm" type="button" data-action="addSmartGamePlanBalanceComplement"
          data-arg="${_gpSmartArg({ sig: candidate.sig, target: item.target })}">
          Add ${escapeHtml(candidate.play?.play || candidate.play?.basePlay || item.target)}
        </button>`).join("")
    : `<span class="gp-smart-builder-balance-empty">No matching playbook play yet.</span>`;
  return `
    <div class="gp-smart-builder-balance-card">
      <span class="gp-smart-builder-balance-kicker">Missing complement</span>
      <strong>${escapeHtml(item.target)}</strong>
      <span>${escapeHtml(sourceText)}</span>
      <div class="gp-smart-builder-balance-actions">${candidateButtons}</div>
    </div>`;
}

function _gpRenderSmartBalanceOverload(item) {
  return `
    <div class="gp-smart-builder-balance-card is-overload">
      <span class="gp-smart-builder-balance-kicker">Overloaded concept</span>
      <strong>${escapeHtml(item.label)}</strong>
      <span>${item.count} drafted placement${item.count === 1 ? "" : "s"} · ${item.pct}% of the plan</span>
    </div>`;
}

function _gpRenderSmartBalanceInsights(balance) {
  if (!balance || balance.draftedCount === 0) {
    return `
      <section class="gp-smart-builder-balance is-empty">
        <div class="gp-smart-builder-balance-head">
          <h4>Plan Balance</h4>
          <span>Add recommendations to unlock complement and overload checks.</span>
        </div>
      </section>`;
  }
  const issueCount = balance.missingComplements.length + balance.overloadedConcepts.length;
  const cards = [
    ...balance.missingComplements.map(_gpRenderSmartBalanceComplement),
    ...balance.overloadedConcepts.map(_gpRenderSmartBalanceOverload),
  ].join("");
  return `
    <section class="gp-smart-builder-balance ${issueCount === 0 ? "is-clean" : ""}">
      <div class="gp-smart-builder-balance-head">
        <h4>Plan Balance</h4>
        <span>${issueCount === 0
    ? `No missing complements or overloaded concepts in ${balance.draftedCount} drafted play${balance.draftedCount === 1 ? "" : "s"}.`
    : `${issueCount} balance alert${issueCount === 1 ? "" : "s"} across ${balance.draftedCount} drafted play${balance.draftedCount === 1 ? "" : "s"}.`}</span>
      </div>
      ${cards ? `<div class="gp-smart-builder-balance-grid">${cards}</div>` : ""}
    </section>`;
}

function _gpRenderSmartPushActions(recs) {
  const items = _gpSmartCollectPushItems(recs);
  const disabled = items.length === 0 ? "disabled" : "";
  return `
    <section class="gp-smart-builder-push">
      <div class="gp-smart-builder-push-copy">
        <h4>Use Top Picks</h4>
        <span>${items.length} unique call${items.length === 1 ? "" : "s"} selected from the top ${GP_SMART_PUSH_LIMIT_PER_GROUP} in each lane.</span>
      </div>
      <div class="gp-smart-builder-push-actions">
        <button class="btn btn-sm btn-primary" type="button" data-action="addSmartGamePlanTopPicks" ${disabled}>🎯 Board</button>
        <button class="btn btn-sm" type="button" data-action="pushSmartGamePlanRecommendationsToCallSheet" ${disabled}>➡️ Call Sheet</button>
        <button class="btn btn-sm" type="button" data-action="pushSmartGamePlanRecommendationsToScript" ${disabled}>📋 Script</button>
        <button class="btn btn-sm" type="button" data-action="pushSmartGamePlanRecommendationsToWristband" ${disabled}>🃏 Wristband</button>
      </div>
    </section>`;
}

function openSmartGamePlanBuilder() {
  if (!Array.isArray(plays) || plays.length === 0) {
    showToast("Import a playbook before building a smart game plan.", { type: "warning" });
    return;
  }
  document.getElementById("gpSmartBuilderOverlay")?.remove();
  const recs = _gpBuildSmartPlanRecommendations();
  const totalCandidates = recs.groups.reduce((sum, group) => sum + group.candidates.length, 0);
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "gpSmartBuilderOverlay";
  overlay.innerHTML = `
    <div class="custom-modal custom-modal-wide gp-smart-builder-modal" role="dialog" aria-modal="true" aria-labelledby="gpSmartBuilderTitle">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">🧠</span>
        <h3 class="custom-modal-title" id="gpSmartBuilderTitle">Smart Game Plan Builder</h3>
      </div>
      <div class="custom-modal-body">
        <div class="gp-smart-builder-summary">
          <strong>${totalCandidates}</strong>
          <span>recommended calls from ${recs.totalPlays} playbook plays${recs.opponent ? ` for ${escapeHtml(recs.opponent)}` : ""}</span>
        </div>
        ${_gpRenderSmartTendencySummary(recs.tendency)}
        ${_gpRenderSmartBalanceInsights(recs.balance)}
        ${_gpRenderSmartPushActions(recs)}
        <div class="gp-smart-builder-groups">
          ${recs.groups.map(_gpRenderSmartRecommendationGroup).join("")}
        </div>
      </div>
      <div class="custom-modal-actions">
        <button class="btn btn-sm" type="button" data-action="closeSmartGamePlanBuilder">Close</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeSmartGamePlanBuilder();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSmartGamePlanBuilder();
    }
  });
}

function closeSmartGamePlanBuilder() {
  const overlay = document.getElementById("gpSmartBuilderOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 180);
}

function _gpEnsureSmartRecommendationBoxInBoard(board, group) {
  if (!board || !group?.targetId) return;
  if (!board.assignments || typeof board.assignments !== "object") board.assignments = {};
  if (!Array.isArray(board.assignments[group.targetId])) board.assignments[group.targetId] = [];
  const isDefault = GP_DEFAULT_BOXES.some((box) => box.id === group.targetId);
  const isCustom = Array.isArray(board.customBoxes)
    && board.customBoxes.some((box) => box.id === group.targetId);
  if (!isDefault && !isCustom) {
    if (!Array.isArray(board.customBoxes)) board.customBoxes = [];
    board.customBoxes.push({
      id: group.targetId,
      label: group.targetLabel || group.label || group.targetId,
      template: "smart-builder",
    });
  }
}

function _gpEnsureSmartRecommendationBox(group) {
  if (!group?.targetId) return;
  _gpUpdateBoard((board) => _gpEnsureSmartRecommendationBoxInBoard(board, group));
}

function _gpAddSmartRecommendations(group, sigs) {
  if (!group || !Array.isArray(sigs) || sigs.length === 0) return;
  _gpEnsureSmartRecommendationBox(group);
  _gpAddSigsToBox(sigs, group.targetId);
}

function addSmartGamePlanRecommendationGroup(groupId) {
  const recs = _gpBuildSmartPlanRecommendations();
  const group = recs.groups.find((item) => item.id === groupId);
  if (!group || group.candidates.length === 0) {
    showToast("No recommendations available for that lane.", { type: "warning" });
    return;
  }
  _gpAddSmartRecommendations(group, group.candidates.map((item) => item.sig));
}

function addSmartGamePlanRecommendation(arg) {
  const data = safeJSONParse(arg, null);
  if (!data?.groupId || !data?.sig) return;
  const recs = _gpBuildSmartPlanRecommendations();
  const group = recs.groups.find((item) => item.id === data.groupId);
  if (!group) return;
  _gpAddSmartRecommendations(group, [data.sig]);
}

function addSmartGamePlanBalanceComplement(arg) {
  const data = safeJSONParse(arg, null);
  if (!data?.sig) return;
  const group = GP_SMART_PLAN_GROUPS.find((item) => item.id === "constraints");
  if (!group) return;
  _gpAddSmartRecommendations(group, [data.sig]);
}

function addSmartGamePlanTopPicks() {
  const entries = _gpSmartCollectPushItems();
  if (entries.length === 0) {
    showToast("No smart recommendations available yet.", { type: "warning" });
    return;
  }
  let added = 0;
  let skipped = 0;
  _gpUpdateBoard((board) => {
    entries.forEach((entry) => {
      const group = entry.group;
      if (!group?.targetId) return;
      _gpEnsureSmartRecommendationBoxInBoard(board, group);
      const list = board.assignments[group.targetId];
      const existing = new Set(list.map((play) => _gpPlaySignature(play)));
      if (existing.has(entry.sig)) {
        skipped += 1;
        return;
      }
      const play = _gpFindPlayBySig(entry.sig);
      if (!play) {
        skipped += 1;
        return;
      }
      list.push({ ...play });
      existing.add(entry.sig);
      added += 1;
    });
  });
  requestRenderGamePlan();
  showToast(
    added > 0
      ? `Added ${added} top pick${added === 1 ? "" : "s"} to the board${skipped > 0 ? ` (${skipped} skipped)` : ""}.`
      : "No top picks added; they may already be on the board.",
    { type: added > 0 ? "success" : "warning", duration: 3500 },
  );
}

async function pushSmartGamePlanRecommendationsToCallSheet() {
  if (typeof callSheet !== "object" || !callSheet) {
    showToast("Call sheet isn't ready yet.", { type: "error" });
    return;
  }
  const entries = _gpSmartCollectPushItems();
  if (entries.length === 0) {
    showToast("No smart recommendations available yet.", { type: "warning" });
    return;
  }
  if (typeof _gpComputeCallSheetTargets !== "function" || typeof _gpPushPlayIntoCategory !== "function") {
    showToast("Call sheet push tools are not ready yet.", { type: "error" });
    return;
  }

  const playerTargets = typeof buildPlayerCategoryAutoFillTargets === "function"
    ? buildPlayerCategoryAutoFillTargets(entries, { getPlay: (entry) => entry.play })
    : [];
  const fanOut = entries.map((entry, index) => {
    const targets = _gpComputeCallSheetTargets(entry.play, entry.group?.targetId);
    (playerTargets[index] || new Set()).forEach((catId) => targets.add(catId));
    return { ...entry, targets };
  });
  const byCat = {};
  fanOut.forEach(({ targets }) => {
    targets.forEach((id) => {
      byCat[id] = (byCat[id] || 0) + 1;
    });
  });
  const filledCatIds = Object.keys(byCat);
  if (filledCatIds.length === 0) {
    showToast("Top picks do not match any call sheet categories yet.", { type: "warning" });
    return;
  }

  const orderIds = Array.isArray(CALLSHEET_CATEGORIES) ? CALLSHEET_CATEGORIES.map((cat) => cat.id) : filledCatIds;
  const summaryItems = orderIds
    .filter((id) => byCat[id])
    .map((id) => {
      const cat = Array.isArray(CALLSHEET_CATEGORIES) ? CALLSHEET_CATEGORIES.find((item) => item.id === id) : null;
      const label = cat
        ? (typeof getCategoryDisplayName === "function" ? getCategoryDisplayName(cat) : cat.name)
        : id;
      return `<li>${escapeHtml(label)}: <strong>${byCat[id]}</strong></li>`;
    })
    .join("");

  const ok = await showConfirm(
    `<p>Append <strong>${entries.length}</strong> top smart pick${entries.length === 1 ? "" : "s"} into <strong>${filledCatIds.length}</strong> call sheet categor${filledCatIds.length === 1 ? "y" : "ies"}?</p>
     <details style="font-size:var(--font-size-sm);"><summary style="cursor:pointer;color:var(--color-text-muted);">Show breakdown</summary><ul style="margin:var(--space-xs) 0 0 var(--space-md);">${summaryItems}</ul></details>`,
    { title: "Push Smart Picks to Call Sheet", icon: "➡️", confirmText: "Push" },
  );
  if (!ok) return;

  _gpSmartEnsureCallSheetBuckets();
  let pushed = 0;
  fanOut.forEach(({ play, targets }) => {
    targets.forEach((id) => {
      if (_gpPushPlayIntoCategory(play, id)) pushed += 1;
    });
  });
  if (typeof saveCallSheet === "function") saveCallSheet();
  if (typeof scheduleRenderCallSheet === "function") {
    scheduleRenderCallSheet();
  } else if (typeof renderCallSheet === "function") {
    renderCallSheet();
  }
  showToast(`Pushed ${pushed} entr${pushed === 1 ? "y" : "ies"} from Smart Builder to Call Sheet`, {
    type: "success",
    duration: 3500,
  });
}

async function pushSmartGamePlanRecommendationsToScript() {
  if (typeof script === "undefined" || !Array.isArray(script)) {
    showToast("Script tab isn't ready yet.", { type: "error" });
    return;
  }
  const entries = _gpSmartCollectPushItems();
  if (entries.length === 0) {
    showToast("No smart recommendations available yet.", { type: "warning" });
    return;
  }
  const grouped = _gpSmartGroupPushItems(entries);
  const ok = await showConfirm(
    `Add ${entries.length} top smart pick${entries.length === 1 ? "" : "s"} to the practice script as ${grouped.length} labeled period${grouped.length === 1 ? "" : "s"}?`,
    { title: "Push Smart Picks to Script", icon: "📋", confirmText: "Push" },
  );
  if (!ok) return;

  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const opp = gw?.opponentName || "";
  let pushed = 0;
  grouped.forEach(({ group, entries: groupEntries }) => {
    if (!groupEntries.length) return;
    const label = `Smart ${group?.label || "Picks"}${opp ? ` — vs ${opp}` : ""}`;
    script.push({
      isSeparator: true,
      label,
      id: Date.now() + Math.random(),
    });
    groupEntries.forEach((entry) => {
      script.push({ ...entry.play, id: Date.now() + Math.random() });
      pushed += 1;
    });
  });

  if (typeof markScriptDirty === "function") markScriptDirty();
  if (typeof scheduleScriptAutosave === "function") scheduleScriptAutosave();
  if (typeof renderScript === "function") renderScript();
  showToast(`Pushed ${pushed} Smart Builder play${pushed === 1 ? "" : "s"} to the script`, {
    type: "success",
    duration: 3500,
  });
}

async function pushSmartGamePlanRecommendationsToWristband() {
  if (typeof wristbandCards === "undefined" || !Array.isArray(wristbandCards)) {
    showToast("Wristband module not ready yet.", { type: "error" });
    return;
  }
  if (typeof MAX_CARDS === "number" && wristbandCards.length >= MAX_CARDS) {
    showToast(`Maximum ${MAX_CARDS} wristband cards reached. Remove one first.`, {
      duration: 3500,
      type: "error",
    });
    return;
  }
  const entries = _gpSmartCollectPushItems();
  if (entries.length === 0) {
    showToast("No smart recommendations available yet.", { type: "warning" });
    return;
  }
  const cellsPerCard = typeof CELLS_PER_CARD === "number" ? CELLS_PER_CARD : 40;
  const toAdd = entries.slice(0, cellsPerCard);
  const trimText = entries.length > cellsPerCard ? ` Only the first ${cellsPerCard} will fit on one card.` : "";
  const ok = await showConfirm(
    `Build a new wristband card from ${toAdd.length} top smart pick${toAdd.length === 1 ? "" : "s"}?${trimText}`,
    { title: "Build Smart Wristband", icon: "🃏", confirmText: "Build Card" },
  );
  if (!ok) return;

  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const opp = gw?.opponentName || "";
  const cardName = opp ? `Smart Plan vs ${opp}` : "Smart Plan";
  const data = Array(cellsPerCard).fill(null);
  toAdd.forEach((entry, index) => {
    const copy = { ...entry.play };
    delete copy._gpFlags;
    data[index] = copy;
  });
  if (typeof mutateWristbandState === "function") {
    mutateWristbandState(() => {
      wristbandCards.push({ name: cardName, data, cardColor: "#dff3e3" });
      currentCardIndex = wristbandCards.length - 1;
    }, { updateCardColorPicker: true });
  } else {
    wristbandCards.push({ name: cardName, data, cardColor: "#dff3e3" });
    currentCardIndex = wristbandCards.length - 1;
    if (typeof markWristbandDirty === "function") markWristbandDirty();
    if (typeof scheduleWristbandAutosave === "function") scheduleWristbandAutosave();
    if (typeof refreshWristbandCardView === "function") refreshWristbandCardView({ updateCardColorPicker: true });
  }
  showToast(`Created wristband card "${cardName}" with ${toAdd.length} play${toAdd.length === 1 ? "" : "s"}.`, {
    type: "success",
    duration: 3500,
  });
  if (typeof showTab === "function") showTab("wristband");
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
  let opponents = Array.isArray(window.tendenciesOpponents)
    ? window.tendenciesOpponents
    : (typeof tendenciesOpponents !== "undefined" && Array.isArray(tendenciesOpponents) ? tendenciesOpponents : []);
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
  const currentIndex = typeof window.tendenciesCurrentOpponent === "number"
    ? window.tendenciesCurrentOpponent
    : (typeof tendenciesCurrentOpponent === "number" ? tendenciesCurrentOpponent : null);
  if (currentIndex !== null && opponents[currentIndex]) {
    return opponents[currentIndex];
  }
  return opponents[0];
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
