/**
 * Playbook Data Cleanup (Sanitize) tool.
 *
 * Lets you pick a field (e.g. preferredHash), see every play that has it
 * empty, and quickly fill them in inline without bouncing through the full
 * play editor for each row.
 *
 * Inputs commit on change/blur, Enter advances to the next row, and the
 * panel auto-removes rows once they're filled (toggleable).
 */

const SANITIZE_FIELDS = [
  { key: "type", label: "Play Type", type: "select", optionsFn: () => _editorOptions("type", _TYPE_DEFAULTS) },
  { key: "personnel", label: "Personnel" },
  { key: "formation", label: "Formation" },
  { key: "play", label: "Play Name" },
  { key: "basePlay", label: "Base Play" },
  { key: "oneWord", label: "One Word" },
  { key: "formTag1", label: "Form Tag 1", vocabKeys: ["formTag1", "formTag2"] },
  { key: "formTag2", label: "Form Tag 2", vocabKeys: ["formTag1", "formTag2"] },
  { key: "playTag1", label: "Play Tag 1", vocabKeys: ["playTag1", "playTag2"] },
  { key: "playTag2", label: "Play Tag 2", vocabKeys: ["playTag1", "playTag2"] },
  { key: "under", label: "Under" },
  { key: "back", label: "Back" },
  { key: "shift", label: "Shift" },
  { key: "motion", label: "Motion" },
  { key: "protection", label: "Protection" },
  { key: "lineCall", label: "Line Call" },
  { key: "preferredSituation", label: "Preferred Situation", type: "select", optionsFn: () => _editorOptions("preferredSituation", _SITUATION_DEFAULTS) },
  { key: "preferredDown", label: "Preferred Down", type: "select", options: ["", "1", "2", "3", "4"] },
  { key: "preferredDistance", label: "Preferred Distance", type: "select", options: ["", "Short", "Medium", "Long"] },
  { key: "preferredHash", label: "Preferred Hash", type: "select", options: ["", "Left", "Middle", "Right", "Any"] },
  { key: "preferredFieldPosition", label: "Preferred Field Position", type: "select", optionsFn: () => _editorOptions("preferredFieldPosition", _FIELD_POS_DEFAULTS) },
  { key: "tempo", label: "Tempo" },
  { key: "practiceFront", label: "Practice Front" },
  { key: "practiceDefense", label: "Practice Defense" },
  { key: "practiceCoverage", label: "Practice Coverage" },
  { key: "practiceBlitz", label: "Practice Blitz" },
  { key: "practiceStunt", label: "Practice Stunt" },
  { key: "keyPlayer1", label: "Key Player 1 Position", vocabKeys: ["keyPlayer1", "keyPlayer2", "keyPlayer3"] },
  { key: "keyPlayerName1", label: "Key Player 1 Name", vocabKeys: ["keyPlayerName1", "keyPlayerName2", "keyPlayerName3"] },
  { key: "keyPlayer2", label: "Key Player 2 Position", vocabKeys: ["keyPlayer1", "keyPlayer2", "keyPlayer3"] },
  { key: "keyPlayerName2", label: "Key Player 2 Name", vocabKeys: ["keyPlayerName1", "keyPlayerName2", "keyPlayerName3"] },
  { key: "keyPlayer3", label: "Key Player 3 Position", vocabKeys: ["keyPlayer1", "keyPlayer2", "keyPlayer3"] },
  { key: "keyPlayerName3", label: "Key Player 3 Name", vocabKeys: ["keyPlayerName1", "keyPlayerName2", "keyPlayerName3"] },
  { key: "constraint1", label: "Constraint 1", vocabKeys: ["constraint1", "constraint2", "constraint3"] },
  { key: "constraint2", label: "Constraint 2", vocabKeys: ["constraint1", "constraint2", "constraint3"] },
  { key: "constraint3", label: "Constraint 3", vocabKeys: ["constraint1", "constraint2", "constraint3"] },
  { key: "hitChart1", label: "Hit Chart 1", type: "select", canAddNew: true, vocabKeys: ["hitChart1", "hitChart2", "hitChart3"], optionsFn: () => _editorOptions("hitChart1", _HIT_CHART_DEFAULTS, ["hitChart1", "hitChart2", "hitChart3"]) },
  { key: "hitChart2", label: "Hit Chart 2", type: "select", canAddNew: true, vocabKeys: ["hitChart1", "hitChart2", "hitChart3"], optionsFn: () => _editorOptions("hitChart2", _HIT_CHART_DEFAULTS, ["hitChart1", "hitChart2", "hitChart3"]) },
  { key: "hitChart3", label: "Hit Chart 3", type: "select", canAddNew: true, vocabKeys: ["hitChart1", "hitChart2", "hitChart3"], optionsFn: () => _editorOptions("hitChart3", _HIT_CHART_DEFAULTS, ["hitChart1", "hitChart2", "hitChart3"]) },
  { key: "deadVs", label: "Dead Vs" },
  { key: "opponent", label: "Opponent" },
  { key: "notes", label: "Notes" },
];

let _sanitizeFieldKey = "preferredHash";
let _sanitizeHideCompleted = true;
let _sanitizeAutosaveTimer = null;
let _sanitizeVocabCache = null;
let _sanitizeVocabCacheKey = "";

function _sanitizeFieldDef(key) {
  return SANITIZE_FIELDS.find((f) => f.key === key) || SANITIZE_FIELDS[0];
}

/**
 * Build the sorted, distinct vocabulary for the active field. If the field
 * defines `vocabKeys`, values from all related fields are pooled (e.g. all
 * three constraint slots share a vocab so typing in constraint2 will
 * autocomplete from constraint1/3 too).
 */
function _sanitizeVocab(def) {
  const keys = (def.vocabKeys && def.vocabKeys.length ? def.vocabKeys : [def.key]).slice().sort();
  const cacheKey = keys.join("|") + ":" + (Array.isArray(plays) ? plays.length : 0);
  if (_sanitizeVocabCache && _sanitizeVocabCacheKey === cacheKey) return _sanitizeVocabCache;
  const set = new Set();
  if (Array.isArray(plays)) {
    plays.forEach((play) => {
      keys.forEach((k) => {
        const value = (play && play[k] != null ? String(play[k]) : "").trim();
        if (value) set.add(value);
      });
    });
  }
  _sanitizeVocabCache = [...set].sort((a, b) => a.localeCompare(b));
  _sanitizeVocabCacheKey = cacheKey;
  return _sanitizeVocabCache;
}

function _sanitizeInvalidateVocab() {
  _sanitizeVocabCache = null;
  _sanitizeVocabCacheKey = "";
}

/** Levenshtein distance with early-exit for large differences. */
function _sanitizeLevenshtein(a, b, max) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j += 1) prev[j] = j;
  for (let i = 1; i <= al; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

/**
 * Find similar existing values for a typed string. Returns up to 3 candidates
 * ranked by edit distance + prefix/contains bonus. Used to flag potential
 * typos ("Trps" → suggest "Trips") so we don't proliferate variants.
 */
function _sanitizeFindSimilar(value, vocab) {
  const v = String(value || "").trim();
  if (!v) return [];
  const vLower = v.toLowerCase();
  // Threshold scales with length: short words tolerate fewer typos.
  const threshold = v.length <= 3 ? 1 : v.length <= 6 ? 2 : 3;
  const scored = [];
  for (const candidate of vocab) {
    if (candidate === v) continue; // exact match → not a typo
    const cLower = candidate.toLowerCase();
    if (cLower === vLower) {
      scored.push({ candidate, score: 0 });
      continue;
    }
    const dist = _sanitizeLevenshtein(vLower, cLower, threshold);
    if (dist <= threshold) {
      // Prefer prefixes / contained matches.
      let bonus = 0;
      if (cLower.startsWith(vLower) || vLower.startsWith(cLower)) bonus -= 0.5;
      if (cLower.includes(vLower)) bonus -= 0.25;
      scored.push({ candidate, score: dist + bonus });
    }
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 3).map((s) => s.candidate);
}

function _sanitizeIsEmpty(play, key) {
  const value = (play && play[key] != null ? String(play[key]) : "").trim();
  return value === "";
}

function _sanitizePlaySummary(play) {
  // Full formatted call as it would appear on a wristband / call sheet.
  // getFullCall returns escaped HTML, so callers must NOT double-escape.
  if (typeof getFullCall === "function") {
    try {
      const html = getFullCall(play, { showLineCall: true });
      if (html && String(html).trim()) return html;
    } catch (_e) { /* fall through */ }
  }
  const bits = [
    play.type,
    play.personnel,
    play.formation,
    play.play,
  ].filter(Boolean);
  return escapeHtml(bits.join(" \u2022 ") || "(unnamed play)");
}

function _sanitizePlayContext(play) {
  // Short secondary line: type \u2022 personnel \u2022 formation
  const bits = [play.type, play.personnel, play.formation].filter(Boolean);
  return bits.join(" \u2022 ");
}

function openPlaybookSanitize() {
  if (!Array.isArray(plays) || plays.length === 0) {
    showToast("Import a playbook CSV first", { duration: 2500, type: "error" });
    return;
  }
  const overlay = document.getElementById("playbookSanitizeOverlay");
  if (!overlay) return;
  overlay.classList.add("visible");
  _renderSanitizePicker();
  _renderSanitizeList();
}

function closePlaybookSanitize() {
  const overlay = document.getElementById("playbookSanitizeOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
}

function _renderSanitizePicker() {
  const picker = document.getElementById("playbookSanitizeField");
  if (!picker) return;
  const html = SANITIZE_FIELDS.map((f) => {
    const missing = plays.filter((p) => _sanitizeIsEmpty(p, f.key)).length;
    const total = plays.length;
    const sel = f.key === _sanitizeFieldKey ? "selected" : "";
    return `<option value="${escapeHtml(f.key)}" ${sel}>${escapeHtml(f.label)} — ${missing}/${total} empty</option>`;
  }).join("");
  picker.innerHTML = html;

  const hideToggle = document.getElementById("playbookSanitizeHideToggle");
  if (hideToggle) hideToggle.checked = _sanitizeHideCompleted;
}

function setPlaybookSanitizeField(key) {
  _sanitizeFieldKey = key;
  _renderSanitizePicker();
  _renderSanitizeList();
}

function setPlaybookSanitizeHide(eventOrValue) {
  if (eventOrValue && eventOrValue.target && typeof eventOrValue.target.checked === "boolean") {
    _sanitizeHideCompleted = eventOrValue.target.checked;
  } else {
    _sanitizeHideCompleted = (eventOrValue === true || eventOrValue === "true");
  }
  _renderSanitizeList();
}

function _renderSanitizeList() {
  const body = document.getElementById("playbookSanitizeBody");
  const status = document.getElementById("playbookSanitizeStatus");
  if (!body) return;
  const def = _sanitizeFieldDef(_sanitizeFieldKey);
  const total = plays.length;
  const missingPlays = plays
    .map((play, idx) => ({ play, idx }))
    .filter(({ play }) => _sanitizeHideCompleted
      ? _sanitizeIsEmpty(play, def.key)
      : true);
  const missingCount = plays.filter((p) => _sanitizeIsEmpty(p, def.key)).length;
  if (status) {
    status.textContent = _sanitizeHideCompleted
      ? `${missingCount} of ${total} plays missing ${def.label}`
      : `${missingCount} of ${total} plays missing ${def.label} — showing all`;
  }

  if (missingPlays.length === 0) {
    body.innerHTML = `
      <div class="pb-sanitize-empty">
        <div class="pb-sanitize-empty-icon">🎉</div>
        <div class="pb-sanitize-empty-title">All plays have ${escapeHtml(def.label)} filled in.</div>
        <div class="pb-sanitize-empty-sub">Pick another field above to keep going.</div>
      </div>`;
    return;
  }

  // Build a single shared datalist of every existing value (including from
  // related fields if vocabKeys is set) so all text inputs autocomplete from
  // the same vocabulary. Drives the typo-suggestion logic in commit too.
  const vocab = _sanitizeVocab(def);
  const sharedDatalistId = "pbSanitizeSharedVocab";
  const sharedDatalistHtml = `
    <datalist id="${sharedDatalistId}">
      ${vocab.map((v) => `<option value="${escapeHtml(v)}"></option>`).join("")}
    </datalist>`;

  const inputHtmlFor = (play, masterIdx) => {
    const value = String(play[def.key] || "");
    const inputId = `pbSanitizeInput-${masterIdx}`;
    if (def.type === "select" && !def.canAddNew) {
      const optList = def.options || (def.optionsFn ? def.optionsFn() : [""]);
      const options = optList.map((o) => {
        const sel = o === value ? "selected" : "";
        const label = o === "" ? "—" : o;
        return `<option value="${escapeHtml(o)}" ${sel}>${escapeHtml(label)}</option>`;
      }).join("");
      return `
        <select id="${inputId}" class="pb-sanitize-input pb-sanitize-select"
          data-master-idx="${masterIdx}">
          ${options}
        </select>`;
    }
    // All text-y fields (including select+canAddNew) share the same datalist.
    return `
      <input id="${inputId}" type="text" list="${sharedDatalistId}" class="pb-sanitize-input"
        data-master-idx="${masterIdx}" value="${escapeHtml(value)}"
        placeholder="Type or pick — ${vocab.length} known" autocomplete="off" spellcheck="false" />`;
  };

  const rowsHtml = missingPlays.map(({ play, idx }) => {
    const fullCallHtml = _sanitizePlaySummary(play); // already HTML-safe
    const context = _sanitizePlayContext(play);
    const filled = !_sanitizeIsEmpty(play, def.key);
    return `
      <div class="pb-sanitize-row ${filled ? "is-filled" : ""}" data-master-idx="${idx}">
        <div class="pb-sanitize-row-info">
          <div class="pb-sanitize-row-name">${fullCallHtml}</div>
          ${context ? `<div class="pb-sanitize-row-summary">${escapeHtml(context)}</div>` : ""}
        </div>
        <div class="pb-sanitize-row-input">
          ${inputHtmlFor(play, idx)}
          <button class="btn btn-sm btn-secondary pb-sanitize-edit-btn" type="button"
            data-action="openPlayEditorFromSanitize" data-arg="${idx}"
            title="Open full play editor">✏️</button>
        </div>
        <div class="pb-sanitize-row-suggest" id="pbSanitizeSuggest-${idx}" hidden></div>
      </div>`;
  }).join("");

  body.innerHTML = sharedDatalistHtml + rowsHtml;
  _bindSanitizeRowHandlers(body);
}

function _bindSanitizeRowHandlers(scope) {
  const inputs = scope.querySelectorAll(".pb-sanitize-input");
  inputs.forEach((input) => {
    input.addEventListener("change", (e) => _commitSanitizeInput(e.target));
    input.addEventListener("blur", (e) => _commitSanitizeInput(e.target));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        _commitSanitizeInput(e.target);
        _focusNextSanitizeInput(e.target);
      }
    });
  });
}

function _commitSanitizeInput(el) {
  if (!el) return;
  const masterIdx = parseInt(el.dataset.masterIdx, 10);
  if (!Number.isFinite(masterIdx) || !plays[masterIdx]) return;
  const def = _sanitizeFieldDef(_sanitizeFieldKey);
  const value = String(el.value || "").trim();
  const play = plays[masterIdx];
  const previous = String(play[def.key] || "").trim();

  // Always re-render suggestions: a typed value that's new gets a typo
  // warning; an exact match clears any prior warning.
  if (def.type !== "select" || def.canAddNew) {
    _renderSanitizeSuggestions(masterIdx, value, def);
  }

  if (value === previous) return;
  play[def.key] = value;
  _sanitizeInvalidateVocab();

  // Update row visual state
  const row = el.closest(".pb-sanitize-row");
  if (row) {
    if (value) row.classList.add("is-filled");
    else row.classList.remove("is-filled");
  }

  // Debounced persist + filter cache invalidation
  clearTimeout(_sanitizeAutosaveTimer);
  _sanitizeAutosaveTimer = setTimeout(() => {
    storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof filterPlays === "function") filterPlays();
    _renderSanitizePicker();
  }, 500);

  // If hide-completed is on AND there are no suggestions to review, fade +
  // remove the row after a brief delay so the user gets visual confirmation.
  // If suggestions are showing, we let the user resolve them first.
  const suggestEl = document.getElementById(`pbSanitizeSuggest-${masterIdx}`);
  const hasSuggestions = suggestEl && !suggestEl.hidden;
  if (_sanitizeHideCompleted && value && row && !hasSuggestions) {
    setTimeout(() => {
      if (row.parentNode) {
        const status = document.getElementById("playbookSanitizeStatus");
        const def2 = _sanitizeFieldDef(_sanitizeFieldKey);
        const missingCount = plays.filter((p) => _sanitizeIsEmpty(p, def2.key)).length;
        if (status) status.textContent = `${missingCount} of ${plays.length} plays missing ${def2.label}`;
        row.classList.add("is-removing");
        setTimeout(() => {
          if (row.parentNode) row.parentNode.removeChild(row);
          const body = document.getElementById("playbookSanitizeBody");
          if (body && !body.querySelector(".pb-sanitize-row")) _renderSanitizeList();
        }, 200);
      }
    }, 400);
  }
}

/**
 * Render typo / similar-value suggestions under a row's input. Empty value
 * or exact-vocab-match clears the slot. Suggestions are clickable chips.
 */
function _renderSanitizeSuggestions(masterIdx, value, def) {
  const slot = document.getElementById(`pbSanitizeSuggest-${masterIdx}`);
  if (!slot) return;
  const v = String(value || "").trim();
  if (!v) {
    slot.hidden = true;
    slot.innerHTML = "";
    return;
  }
  const vocab = _sanitizeVocab(def);
  // If value already exists in vocab (exact, case-sensitive), no suggestion.
  if (vocab.includes(v)) {
    slot.hidden = true;
    slot.innerHTML = "";
    return;
  }
  // Case-insensitive exact match → offer the canonical capitalization.
  const ciExact = vocab.find((c) => c.toLowerCase() === v.toLowerCase());
  if (ciExact) {
    slot.hidden = false;
    slot.innerHTML = `
      <span class="pb-sanitize-suggest-label">Did you mean</span>
      <button type="button" class="pb-sanitize-suggest-chip"
        data-action="applySanitizeSuggestion" data-arg="${escapeAttrIfAvailable(masterIdx + "|" + ciExact)}"
        title="Apply existing capitalization">${escapeHtml(ciExact)}</button>
      <span class="pb-sanitize-suggest-hint">(matches existing capitalization)</span>`;
    return;
  }
  const similar = _sanitizeFindSimilar(v, vocab);
  if (similar.length === 0) {
    // Brand-new value with no fuzzy matches. Show a subtle "NEW" badge so
    // user is aware they're introducing a new value.
    slot.hidden = false;
    slot.innerHTML = `
      <span class="pb-sanitize-suggest-new">✨ New value added to vocabulary</span>`;
    return;
  }
  slot.hidden = false;
  const chips = similar.map((c) =>
    `<button type="button" class="pb-sanitize-suggest-chip"
      data-action="applySanitizeSuggestion" data-arg="${escapeAttrIfAvailable(masterIdx + "|" + c)}"
      title="Use existing value">${escapeHtml(c)}</button>`
  ).join("");
  slot.innerHTML = `
    <span class="pb-sanitize-suggest-label">⚠️ Similar existing values:</span>
    ${chips}
    <button type="button" class="pb-sanitize-suggest-keep"
      data-action="keepSanitizeNewValue" data-arg="${masterIdx}"
      title="Keep what I typed">Keep “${escapeHtml(v)}”</button>`;
}

function escapeAttrIfAvailable(s) {
  // Reuse global escapeAttr if defined, else fall back to escapeHtml.
  if (typeof escapeAttr === "function") return escapeAttr(s);
  return escapeHtml(String(s));
}

function applySanitizeSuggestion(arg) {
  const sep = String(arg || "").indexOf("|");
  if (sep < 0) return;
  const masterIdx = parseInt(String(arg).slice(0, sep), 10);
  const value = String(arg).slice(sep + 1);
  if (!Number.isFinite(masterIdx) || !plays[masterIdx]) return;
  const def = _sanitizeFieldDef(_sanitizeFieldKey);
  const input = document.getElementById(`pbSanitizeInput-${masterIdx}`);
  if (input) input.value = value;
  plays[masterIdx][def.key] = value;
  _sanitizeInvalidateVocab();
  const slot = document.getElementById(`pbSanitizeSuggest-${masterIdx}`);
  if (slot) { slot.hidden = true; slot.innerHTML = ""; }
  // Persist immediately on explicit suggestion accept.
  storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
  if (typeof invalidateFilterCache === "function") invalidateFilterCache();
  if (typeof filterPlays === "function") filterPlays();
  _renderSanitizePicker();
  // If hide-completed is on, remove the row.
  const row = document.querySelector(`.pb-sanitize-row[data-master-idx="${masterIdx}"]`);
  if (_sanitizeHideCompleted && row) {
    row.classList.add("is-removing");
    setTimeout(() => {
      if (row.parentNode) row.parentNode.removeChild(row);
      const body = document.getElementById("playbookSanitizeBody");
      if (body && !body.querySelector(".pb-sanitize-row")) _renderSanitizeList();
    }, 200);
  }
}

function keepSanitizeNewValue(masterIdxStr) {
  const masterIdx = parseInt(masterIdxStr, 10);
  const slot = document.getElementById(`pbSanitizeSuggest-${masterIdx}`);
  if (slot) { slot.hidden = true; slot.innerHTML = ""; }
  // Trigger the hide-completed removal flow if applicable.
  const row = document.querySelector(`.pb-sanitize-row[data-master-idx="${masterIdx}"]`);
  if (_sanitizeHideCompleted && row) {
    row.classList.add("is-removing");
    setTimeout(() => {
      if (row.parentNode) row.parentNode.removeChild(row);
      const body = document.getElementById("playbookSanitizeBody");
      if (body && !body.querySelector(".pb-sanitize-row")) _renderSanitizeList();
    }, 200);
  }
}

function _focusNextSanitizeInput(currentEl) {
  const inputs = Array.from(document.querySelectorAll("#playbookSanitizeBody .pb-sanitize-input"));
  const idx = inputs.indexOf(currentEl);
  if (idx < 0) return;
  for (let i = idx + 1; i < inputs.length; i += 1) {
    const next = inputs[i];
    const value = String(next.value || "").trim();
    if (!value) {
      try { next.focus(); } catch (_e) { /* ignore */ }
      if (typeof next.select === "function") {
        try { next.select(); } catch (_e) { /* ignore */ }
      }
      return;
    }
  }
  // Wrap around
  for (let i = 0; i < idx; i += 1) {
    const next = inputs[i];
    const value = String(next.value || "").trim();
    if (!value) {
      try { next.focus(); } catch (_e) { /* ignore */ }
      return;
    }
  }
}

function openPlayEditorFromSanitize(masterIdxStr) {
  const masterIdx = parseInt(masterIdxStr, 10);
  if (!Number.isFinite(masterIdx) || !plays[masterIdx]) return;
  const play = plays[masterIdx];
  // openPlayEditor expects an index into filteredPlays. Make sure the play is
  // present there; if not, temporarily expand filteredPlays so the editor can
  // open without disrupting the user's playbook view.
  let filteredIdx = filteredPlays.indexOf(play);
  if (filteredIdx < 0) {
    filteredPlays = [...plays];
    filteredIdx = filteredPlays.indexOf(play);
  }
  if (filteredIdx >= 0 && typeof openPlayEditor === "function") {
    openPlayEditor(filteredIdx);
  }
}
