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
  { key: "goodVsMan", label: "Good vs. Man", type: "boolean" },
  { key: "goodVsBear", label: "Good vs. Bear", type: "boolean" },
  { key: "goodVsOkie", label: "Good vs. Okie", type: "boolean" },
];

let _sanitizeFieldKey = "preferredHash";
let _sanitizeHideCompleted = true;
let _sanitizeUseFiltered = false;
let _sanitizeAutosaveTimer = null;
let _sanitizeVocabCache = null;
let _sanitizeVocabCacheKey = "";

// Returns the array of plays the cleanup tool should iterate over. When the
// "Only filtered plays" toggle is on, we walk `filteredPlays` and resolve
// each entry back to its master index in `plays` so commits stay correct.
// Falls back to full `plays` if filteredPlays isn't populated.
function _sanitizeSourceEntries() {
  const master = Array.isArray(plays) ? plays : [];
  if (
    _sanitizeUseFiltered &&
    Array.isArray(filteredPlays) &&
    filteredPlays.length > 0
  ) {
    const seen = new Set();
    const entries = [];
    filteredPlays.forEach((play) => {
      const idx = master.indexOf(play);
      if (idx >= 0 && !seen.has(idx)) {
        seen.add(idx);
        entries.push({ play, idx });
      }
    });
    return entries;
  }
  return master.map((play, idx) => ({ play, idx }));
}

function _sanitizeScopeLabel() {
  return _sanitizeUseFiltered ? "filtered plays" : "plays";
}

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
  const def = SANITIZE_FIELDS.find((f) => f.key === key);
  if (def && def.type === "boolean") {
    // Boolean fields are "missing" only until they're explicitly set to
    // either true or false. Anything else (undefined, null, "", etc.) counts.
    return typeof (play && play[key]) !== "boolean";
  }
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
  _sanitizeUseFiltered = false;
  const overlay = document.getElementById("playbookSanitizeOverlay");
  if (!overlay) return;
  overlay.classList.add("visible");
  _renderSanitizePicker();
  _renderSanitizeList();
}

// Open the cleanup tool scoped to the currently filtered plays.
// If no filters are active (or the filter result equals the full playbook),
// falls back to the full playbook scope so the modal is never empty.
function openPlaybookSanitizeFiltered() {
  if (!Array.isArray(plays) || plays.length === 0) {
    showToast("Import a playbook CSV first", { duration: 2500, type: "error" });
    return;
  }
  const hasFilter =
    Array.isArray(filteredPlays) &&
    filteredPlays.length > 0 &&
    filteredPlays.length < plays.length;
  _sanitizeUseFiltered = hasFilter;
  if (!hasFilter) {
    showToast("No active filters — showing full playbook", {
      duration: 2200,
      type: "info",
    });
  } else {
    showToast(`Cleaning up ${filteredPlays.length} filtered plays`, {
      duration: 2000,
      type: "info",
    });
  }
  const overlay = document.getElementById("playbookSanitizeOverlay");
  if (!overlay) return;
  overlay.classList.add("visible");
  _renderSanitizePicker();
  _renderSanitizeList();
}

function setPlaybookSanitizeFiltered(eventOrValue) {
  let next;
  if (eventOrValue && eventOrValue.target && typeof eventOrValue.target.checked === "boolean") {
    next = eventOrValue.target.checked;
  } else {
    next = (eventOrValue === true || eventOrValue === "true");
  }
  // If turning on but no filters are active, ignore and warn.
  if (
    next &&
    (!Array.isArray(filteredPlays) ||
      filteredPlays.length === 0 ||
      filteredPlays.length === plays.length)
  ) {
    showToast("No active filters", { duration: 1800, type: "info" });
    const cb = document.getElementById("playbookSanitizeFilteredToggle");
    if (cb) cb.checked = false;
    return;
  }
  _sanitizeUseFiltered = next;
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
  const entries = _sanitizeSourceEntries();
  const total = entries.length;
  const html = SANITIZE_FIELDS.map((f) => {
    const missing = entries.filter(({ play }) => _sanitizeIsEmpty(play, f.key)).length;
    const sel = f.key === _sanitizeFieldKey ? "selected" : "";
    return `<option value="${escapeHtml(f.key)}" ${sel}>${escapeHtml(f.label)} — ${missing}/${total} empty</option>`;
  }).join("");
  picker.innerHTML = html;

  const hideToggle = document.getElementById("playbookSanitizeHideToggle");
  if (hideToggle) hideToggle.checked = _sanitizeHideCompleted;
  const filteredToggle = document.getElementById("playbookSanitizeFilteredToggle");
  if (filteredToggle) filteredToggle.checked = _sanitizeUseFiltered;
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
  const entries = _sanitizeSourceEntries();
  const total = entries.length;
  const scopeLabel = _sanitizeScopeLabel();
  const missingPlays = entries.filter(({ play }) =>
    _sanitizeHideCompleted ? _sanitizeIsEmpty(play, def.key) : true,
  );
  const missingCount = entries.filter(({ play }) => _sanitizeIsEmpty(play, def.key)).length;
  if (status) {
    status.textContent = _sanitizeHideCompleted
      ? `${missingCount} of ${total} ${scopeLabel} missing ${def.label}`
      : `${missingCount} of ${total} ${scopeLabel} missing ${def.label} — showing all`;
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
    if (def.type === "boolean") {
      const v = play[def.key];
      const cur = v === true ? "true" : v === false ? "false" : "";
      return `
        <select id="${inputId}" class="pb-sanitize-input pb-sanitize-select pb-sanitize-bool"
          data-master-idx="${masterIdx}" data-bool="1">
          <option value="" ${cur === "" ? "selected" : ""}>—</option>
          <option value="true" ${cur === "true" ? "selected" : ""}>✅ Yes</option>
          <option value="false" ${cur === "false" ? "selected" : ""}>❌ No</option>
        </select>`;
    }
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
  const play = plays[masterIdx];

  // Boolean fields: convert "true"/"false"/"" → true/false/delete
  if (def.type === "boolean") {
    const raw = String(el.value || "");
    const previous = play[def.key];
    let next;
    if (raw === "true") next = true;
    else if (raw === "false") next = false;
    else next = undefined;
    if (next === previous || (next === undefined && typeof previous !== "boolean")) return;
    if (next === undefined) delete play[def.key];
    else play[def.key] = next;

    const row = el.closest(".pb-sanitize-row");
    if (row) {
      if (typeof play[def.key] === "boolean") row.classList.add("is-filled");
      else row.classList.remove("is-filled");
    }

    clearTimeout(_sanitizeAutosaveTimer);
    _sanitizeAutosaveTimer = setTimeout(() => {
      storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
      if (typeof invalidateFilterCache === "function") invalidateFilterCache();
      if (typeof filterPlays === "function") filterPlays();
      _renderSanitizePicker();
    }, 500);

    if (_sanitizeHideCompleted && typeof play[def.key] === "boolean" && row) {
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
      }, 300);
    }
    return;
  }

  const value = String(el.value || "").trim();
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
  if (filteredIdx < 0 || typeof openPlayEditor !== "function") return;

  // The sanitize overlay shares .custom-modal-overlay with the play editor and
  // sits later in the DOM, so without intervention it stacks on top and blocks
  // edits. Hide it while the editor is open, then re-show + re-render once the
  // editor closes (whether via Save, Cancel, Delete, Escape, or backdrop click).
  const sanitizeOverlay = document.getElementById("playbookSanitizeOverlay");
  const sanitizeWasVisible = sanitizeOverlay && sanitizeOverlay.classList.contains("visible");
  if (sanitizeWasVisible) sanitizeOverlay.classList.remove("visible");

  // Wrap closePlayEditor exactly once so any close path restores the sanitize
  // modal. Restore the original after firing so we don't intercept future
  // unrelated edits.
  if (sanitizeWasVisible && typeof window.closePlayEditor === "function" && !window.closePlayEditor.__sanitizeWrapped) {
    const originalClose = window.closePlayEditor;
    const wrapped = function sanitizePatchedClosePlayEditor(...args) {
      const result = originalClose.apply(this, args);
      window.closePlayEditor = originalClose;
      try {
        sanitizeOverlay.classList.add("visible");
        _renderSanitizePicker();
        _renderSanitizeList();
      } catch (_e) { /* ignore */ }
      return result;
    };
    wrapped.__sanitizeWrapped = true;
    window.closePlayEditor = wrapped;
  }

  openPlayEditor(filteredIdx);
}

/* =========================================================================
   Cleanup BY Call Sheet Category
   Pick a Call Sheet category → see plays in scope (full or filtered) with a
   single ✅ checkbox. Checking the box writes the right preferred fields so
   the play matches the category and will be picked up by Push to Call Sheet.
   ========================================================================= */

let _catCleanupScope = "filtered"; // "all" | "filtered" | "gameplan"
let _catCleanupCategoryId = "";
let _catCleanupHideMatching = false;
let _catCleanupSearch = "";
let _catCleanupTypeFilter = ""; // "" | type string (e.g. "Run", "Pass")
let _catCleanupShowMode = "all"; // "all" | "matching" | "unmatched"
let _catCleanupSearchTimer = null;

function _catNormPV(v) {
  if (typeof splitPreferredValues === "function") return splitPreferredValues(v);
  if (!v) return [];
  return String(v).split(/[,|;\/]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
}

function _catCategoryDisplayName(cat) {
  if (typeof getCategoryDisplayName === "function") return getCategoryDisplayName(cat);
  return cat && cat.name ? cat.name : "";
}

function _catFieldPosAliasGroup(value) {
  const map = {
    green: ["green", "fringe"],
    fringe: ["green", "fringe"],
    "lo-rz": ["lo-rz", "low red zone", "low rz"],
    "hi-rz": ["hi-rz", "high red zone", "high rz", "red zone"],
    "red zone": ["hi-rz", "red zone"],
    "goal line": ["goal line", "goalline"],
    goalline: ["goal line", "goalline"],
    "backed up": ["backed up", "backedup", "own territory"],
    backedup: ["backed up", "backedup"],
    saigon: ["saigon"],
  };
  const v = (value || "").toLowerCase();
  return map[v] || [v];
}

/** True if the play already matches this category (uses findMatchingCategories when available). */
function _catPlayMatches(play, cat) {
  if (!play || !cat) return false;
  if (typeof findMatchingCategories === "function") {
    try { return findMatchingCategories(play).includes(cat.id); } catch (_) { /* fall through */ }
  }
  // Manual fallback
  if (cat.playerSpecific) {
    const dn = (_catCategoryDisplayName(cat) || "").toLowerCase().trim();
    if (!dn) return false;
    return [play.keyPlayerName1, play.keyPlayerName2, play.keyPlayerName3]
      .some((n) => (n || "").toLowerCase().trim() === dn);
  }
  if (cat.playType) return (play.type || "").toLowerCase() === cat.playType.toLowerCase();
  return false;
}

/** Append `value` to a comma-separated preferred field if not already present (case-insensitive). */
function _catAddToCsv(play, key, value) {
  if (!value) return false;
  const cur = String(play[key] || "");
  const parts = _catNormPV(cur);
  const v = String(value).toLowerCase().trim();
  if (parts.includes(v)) return false;
  // Preserve original casing for the new value
  const next = cur.trim() ? `${cur.trim()},${value}` : value;
  play[key] = next;
  return true;
}

/** Remove `value` from a comma-separated preferred field (case-insensitive). */
function _catRemoveFromCsv(play, key, value) {
  if (!value || !play[key]) return false;
  const v = String(value).toLowerCase().trim();
  const remaining = String(play[key])
    .split(/[,|;\/]+/)
    .map((x) => x.trim())
    .filter((x) => x && x.toLowerCase() !== v);
  const next = remaining.join(",");
  if (next === play[key]) return false;
  play[key] = next;
  return true;
}

/** Apply the metadata required to make `play` match `cat`. Returns true if mutated. */
function _catApplyMetadata(play, cat) {
  if (!play || !cat) return false;
  let changed = false;
  if (cat.playerSpecific) {
    const dn = _catCategoryDisplayName(cat);
    if (!dn) return false;
    const norm = dn.toLowerCase().trim();
    const slots = ["keyPlayerName1", "keyPlayerName2", "keyPlayerName3"];
    const already = slots.some((k) => (play[k] || "").toLowerCase().trim() === norm);
    if (!already) {
      const empty = slots.find((k) => !play[k] || !String(play[k]).trim());
      if (empty) { play[empty] = dn; changed = true; }
      else { play.keyPlayerName3 = dn; changed = true; }
    }
    return changed;
  }
  if (cat.situation) changed = _catAddToCsv(play, "preferredSituation", cat.situation) || changed;
  if (cat.down) changed = _catAddToCsv(play, "preferredDown", String(cat.down)) || changed;
  if (cat.distance) changed = _catAddToCsv(play, "preferredDistance", cat.distance) || changed;
  if (cat.position) changed = _catAddToCsv(play, "preferredFieldPosition", cat.position) || changed;
  if (cat.playType && (!play.type || !String(play.type).trim())) {
    play.type = cat.playType;
    changed = true;
  }
  return changed;
}

/** Inverse of _catApplyMetadata. Returns true if mutated. */
function _catRemoveMetadata(play, cat) {
  if (!play || !cat) return false;
  let changed = false;
  if (cat.playerSpecific) {
    const norm = (_catCategoryDisplayName(cat) || "").toLowerCase().trim();
    if (!norm) return false;
    ["keyPlayerName1", "keyPlayerName2", "keyPlayerName3"].forEach((k) => {
      if ((play[k] || "").toLowerCase().trim() === norm) { play[k] = ""; changed = true; }
    });
    return changed;
  }
  if (cat.situation) changed = _catRemoveFromCsv(play, "preferredSituation", cat.situation) || changed;
  if (cat.down) changed = _catRemoveFromCsv(play, "preferredDown", String(cat.down)) || changed;
  if (cat.distance) changed = _catRemoveFromCsv(play, "preferredDistance", cat.distance) || changed;
  if (cat.position) changed = _catRemoveFromCsv(play, "preferredFieldPosition", cat.position) || changed;
  // Don't touch play.type on uncheck (could destroy classification)
  return changed;
}

function _catCriteriaSummary(cat) {
  if (!cat) return "";
  if (cat.playerSpecific) return `Sets Key Player → ${escapeHtml(_catCategoryDisplayName(cat))}`;
  const parts = [];
  if (cat.down) parts.push(`Down ${cat.down}`);
  if (cat.distance) parts.push(cat.distance);
  if (cat.situation) parts.push(cat.situation);
  if (cat.position) parts.push(cat.position);
  if (cat.playType) parts.push(`Type: ${cat.playType}`);
  return parts.length ? `Adds: ${escapeHtml(parts.join(" + "))}` : "Manual category";
}

function _catCleanupScopeEntries() {
  let source = plays;
  if (_catCleanupScope === "filtered") {
    if (
      Array.isArray(filteredPlays) &&
      filteredPlays.length > 0 &&
      filteredPlays.length <= plays.length
    ) {
      source = filteredPlays;
    }
  } else if (_catCleanupScope === "gameplan") {
    const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
    const opp = gw && gw.opponentName ? gw.opponentName : "";
    if (opp && typeof getGamePlanTags === "function" && typeof playSignature === "function") {
      const tags = getGamePlanTags() || {};
      const sigs = new Set(tags[opp] || []);
      source = plays.filter((p) => sigs.has(playSignature(p)));
    } else {
      source = [];
    }
  }
  return source
    .map((play) => ({ play, masterIdx: plays.indexOf(play) }))
    .filter((e) => e.masterIdx >= 0);
}

function openPlaybookCategoryCleanup() {
  if (!Array.isArray(plays) || plays.length === 0) {
    showToast("Import a playbook CSV first", { duration: 2500, type: "error" });
    return;
  }
  if (typeof CALLSHEET_CATEGORIES === "undefined" || !Array.isArray(CALLSHEET_CATEGORIES)) {
    showToast("Call sheet categories not loaded", { duration: 2500, type: "error" });
    return;
  }
  // Default category: first non-manual one. Also re-snap if the remembered
  // id no longer exists or points to a manual category (manual categories
  // are hidden from this tool — see _renderCatCleanupSelect).
  const _curCat = _catCleanupCategoryId
    ? CALLSHEET_CATEGORIES.find((c) => c.id === _catCleanupCategoryId)
    : null;
  if (!_curCat || _curCat.manual) {
    const def = CALLSHEET_CATEGORIES.find((c) => !c.manual);
    _catCleanupCategoryId = def ? def.id : (CALLSHEET_CATEGORIES[0] && CALLSHEET_CATEGORIES[0].id) || "";
  }
  document.getElementById("playbookCatCleanupOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "playbookCatCleanupOverlay";
  overlay.innerHTML = `
    <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="catCleanupTitle" style="max-width:960px;width:96vw;">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">🧹</span>
        <h3 class="custom-modal-title" id="catCleanupTitle">Cleanup by Call Sheet Category</h3>
        <button class="modal-close" aria-label="Close" data-action="closePlaybookCategoryCleanup">×</button>
      </div>
      <div class="custom-modal-body cat-cleanup-body">
        <!-- Row 1: Category + Scope -->
        <div class="cat-cleanup-row1">
          <label class="cat-cleanup-cat-label">
            <strong>Category:</strong>
            <select id="catCleanupSelect" data-onchange="setPlaybookCategoryCleanupCategory" data-pass="value"></select>
          </label>
          <div class="cat-cleanup-scope" role="group" aria-label="Scope">
            <label><input type="radio" name="catCleanupScope" value="filtered" data-action="setPlaybookCategoryCleanupScope" data-arg="filtered"> Filtered</label>
            <label><input type="radio" name="catCleanupScope" value="gameplan" data-action="setPlaybookCategoryCleanupScope" data-arg="gameplan"> Game Plan</label>
            <label><input type="radio" name="catCleanupScope" value="all" data-action="setPlaybookCategoryCleanupScope" data-arg="all"> All plays</label>
          </div>
        </div>

        <!-- Row 2: Search + Show mode -->
        <div class="cat-cleanup-row2">
          <div class="cat-cleanup-search-wrap">
            <span class="cat-cleanup-search-icon" aria-hidden="true">🔎</span>
            <input id="catCleanupSearch" type="search" placeholder="Search play, formation, type, personnel, base play, tag, oneWord…" autocomplete="off" spellcheck="false" />
            <button class="cat-cleanup-search-clear" type="button" data-action="clearPlaybookCategoryCleanupSearch" aria-label="Clear search" title="Clear (Esc)">×</button>
          </div>
          <div class="cat-cleanup-show" role="group" aria-label="Show">
            <button type="button" class="cat-cleanup-pill" data-mode="all" data-action="setPlaybookCategoryCleanupShowMode" data-arg="all">All</button>
            <button type="button" class="cat-cleanup-pill" data-mode="matching" data-action="setPlaybookCategoryCleanupShowMode" data-arg="matching">✅ Matching</button>
            <button type="button" class="cat-cleanup-pill" data-mode="unmatched" data-action="setPlaybookCategoryCleanupShowMode" data-arg="unmatched">⚪ Unmatched</button>
          </div>
        </div>

        <!-- Row 3: Type chips -->
        <div id="catCleanupTypeChips" class="cat-cleanup-chips" role="group" aria-label="Filter by type"></div>

        <!-- Summary + bulk actions -->
        <div class="cat-cleanup-summary-row">
          <div id="catCleanupSummary"></div>
          <div class="cat-cleanup-bulk">
            <button class="btn btn-sm" type="button" data-action="catCleanupCheckAllVisible" title="Apply category metadata to every visible play">✓ Check all visible</button>
            <button class="btn btn-sm" type="button" data-action="catCleanupUncheckAllVisible" title="Remove category metadata from every visible play">✕ Uncheck all visible</button>
          </div>
        </div>

        <div id="catCleanupList" class="cat-cleanup-list"></div>
      </div>
      <div class="custom-modal-actions">
        <button class="btn btn-sm" data-action="closePlaybookCategoryCleanup">Done</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);

  // -------- Direct, scoped listeners (do not rely on document delegation
  // for inside-modal controls — this guarantees they fire). --------

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) { closePlaybookCategoryCleanup(); return; }

    const actEl = e.target.closest("[data-action]");
    if (!actEl || !overlay.contains(actEl)) return;
    const action = actEl.dataset.action;
    const arg = actEl.dataset.arg;

    switch (action) {
      case "closePlaybookCategoryCleanup":
        closePlaybookCategoryCleanup();
        return;
      case "setPlaybookCategoryCleanupScope":
        setPlaybookCategoryCleanupScope(arg);
        return;
      case "setPlaybookCategoryCleanupShowMode":
        setPlaybookCategoryCleanupShowMode(arg);
        return;
      case "setPlaybookCategoryCleanupTypeFilter":
        setPlaybookCategoryCleanupTypeFilter(arg || "");
        return;
      case "clearPlaybookCategoryCleanupSearch":
        clearPlaybookCategoryCleanupSearch();
        return;
      case "catCleanupCheckAllVisible":
        catCleanupCheckAllVisible();
        return;
      case "catCleanupUncheckAllVisible":
        catCleanupUncheckAllVisible();
        return;
    }
  });

  // Category select change
  const catSelect = overlay.querySelector("#catCleanupSelect");
  if (catSelect) {
    catSelect.addEventListener("change", () => {
      setPlaybookCategoryCleanupCategory(catSelect.value);
    });
  }

  // Scope radios change (radio click also fires change reliably)
  overlay.querySelectorAll("input[name=catCleanupScope]").forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) setPlaybookCategoryCleanupScope(r.value);
    });
    r.checked = (r.value === _catCleanupScope);
  });

  // Search input — direct input listener with debounced re-render
  const searchInput = overlay.querySelector("#catCleanupSearch");
  if (searchInput) {
    searchInput.value = _catCleanupSearch;
    searchInput.addEventListener("input", () => {
      _catCleanupSearch = searchInput.value || "";
      clearTimeout(_catCleanupSearchTimer);
      _catCleanupSearchTimer = setTimeout(() => {
        _renderCatCleanupList();
      }, 80);
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (searchInput.value) {
          e.preventDefault();
          e.stopPropagation();
          clearPlaybookCategoryCleanupSearch();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        const firstCb = document.querySelector("#catCleanupList .cat-cleanup-check");
        if (firstCb) {
          firstCb.checked = !firstCb.checked;
          _onCatCleanupToggle(firstCb);
        }
      }
    });
  }

  // Modal-level keyboard: Esc closes when search is empty; Cmd/Ctrl+F focuses search
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const inSearch = e.target && e.target.id === "catCleanupSearch" && e.target.value;
      if (!inSearch) { e.preventDefault(); closePlaybookCategoryCleanup(); }
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      searchInput?.focus();
      searchInput?.select();
    }
  });

  _renderCatCleanupTypeChips();
  _renderCatCleanupShowMode();
  _renderCatCleanupSelect();
  _renderCatCleanupList();
  // Auto-focus search for instant typing
  setTimeout(() => searchInput?.focus(), 50);
}

function closePlaybookCategoryCleanup() {
  const overlay = document.getElementById("playbookCatCleanupOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 180);
}

function setPlaybookCategoryCleanupCategory(catId) {
  _catCleanupCategoryId = catId;
  _renderCatCleanupList();
}

function setPlaybookCategoryCleanupScope(scope) {
  if (scope !== "all" && scope !== "filtered" && scope !== "gameplan") return;
  if (scope === "filtered") {
    const hasFilter = Array.isArray(filteredPlays) && filteredPlays.length > 0;
    if (!hasFilter) {
      showToast("No filtered plays — switching to All plays", { duration: 1800, type: "info" });
      scope = "all";
    }
  } else if (scope === "gameplan") {
    const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
    if (!gw || !gw.opponentName) {
      showToast("No active opponent — pick one on the dashboard first", { duration: 2200, type: "warning" });
      const overlay = document.getElementById("playbookCatCleanupOverlay");
      const prev = overlay?.querySelector(`input[name=catCleanupScope][value="${_catCleanupScope}"]`);
      if (prev) prev.checked = true;
      return;
    }
  }
  _catCleanupScope = scope;
  const overlay = document.getElementById("playbookCatCleanupOverlay");
  if (overlay) {
    const radio = overlay.querySelector(`input[name=catCleanupScope][value="${scope}"]`);
    if (radio) radio.checked = true;
  }
  _renderCatCleanupTypeChips();
  _renderCatCleanupSelect();
  _renderCatCleanupList();
}

// (legacy "Hide already matching" replaced by show-mode pills — kept as a no-op shim
//  in case any old data-onchange="setPlaybookCategoryCleanupHide" references survive in cache.)
function setPlaybookCategoryCleanupHide() { /* deprecated */ }

function _renderCatCleanupSelect() {
  const sel = document.getElementById("catCleanupSelect");
  if (!sel) return;
  const entries = _catCleanupScopeEntries();
  // Only show categories that the cleanup tool can actually populate via
  // metadata. Manual categories (must-haves, custom buckets without
  // criteria, etc.) have no auto-populate fields, so they would always
  // show "manual-only" and confuse the user — hide them here.
  const usableCats = CALLSHEET_CATEGORIES.filter((c) => !c.manual);
  // Group: criteria-based first, then player-specific
  const criteriaCats = usableCats.filter((c) => !c.playerSpecific);
  const playerCats = usableCats.filter((c) => c.playerSpecific);

  const optHtml = (cat) => {
    const matching = entries.filter((e) => _catPlayMatches(e.play, cat)).length;
    const dn = _catCategoryDisplayName(cat);
    const sl = cat.id === _catCleanupCategoryId ? "selected" : "";
    return `<option value="${escapeHtml(cat.id)}" ${sl}>${escapeHtml(dn)} — ${matching}/${entries.length} matching</option>`;
  };

  let html = "";
  if (criteriaCats.length) {
    html += `<optgroup label="Situational / Down / Type">${criteriaCats.map(optHtml).join("")}</optgroup>`;
  }
  if (playerCats.length) {
    html += `<optgroup label="Player Buckets">${playerCats.map(optHtml).join("")}</optgroup>`;
  }
  if (!html) {
    html = `<option value="">(No populatable categories — add criteria to a Call Sheet category first)</option>`;
  }
  sel.innerHTML = html;
  // Make sure the select reflects the current id even if the option order changed
  if (_catCleanupCategoryId) sel.value = _catCleanupCategoryId;
}

/* ----- Search / chip / show-mode helpers ----- */

function setPlaybookCategoryCleanupSearch(value) {
  // Debounce list re-render so typing stays buttery — but update the
  // backing variable immediately so other re-renders see the latest text.
  _catCleanupSearch = value || "";
  clearTimeout(_catCleanupSearchTimer);
  _catCleanupSearchTimer = setTimeout(() => {
    _renderCatCleanupList();
  }, 90);
}

function clearPlaybookCategoryCleanupSearch() {
  _catCleanupSearch = "";
  const input = document.getElementById("catCleanupSearch");
  if (input) { input.value = ""; input.focus(); }
  _renderCatCleanupList();
}

function setPlaybookCategoryCleanupShowMode(mode) {
  if (mode !== "all" && mode !== "matching" && mode !== "unmatched") return;
  _catCleanupShowMode = mode;
  _renderCatCleanupShowMode();
  _renderCatCleanupList();
}

function setPlaybookCategoryCleanupTypeFilter(type) {
  // Toggle off if clicking the same chip
  if (_catCleanupTypeFilter === type) _catCleanupTypeFilter = "";
  else _catCleanupTypeFilter = type || "";
  _renderCatCleanupTypeChips();
  _renderCatCleanupList();
}

function _renderCatCleanupShowMode() {
  const wrap = document.querySelector("#playbookCatCleanupOverlay .cat-cleanup-show");
  if (!wrap) return;
  wrap.querySelectorAll(".cat-cleanup-pill").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === _catCleanupShowMode);
  });
}

function _renderCatCleanupTypeChips() {
  const wrap = document.getElementById("catCleanupTypeChips");
  if (!wrap) return;
  // Build counts from current scope
  const entries = _catCleanupScopeEntries();
  const counts = new Map();
  entries.forEach((e) => {
    const t = (e.play.type || "").trim();
    if (!t) return;
    counts.set(t, (counts.get(t) || 0) + 1);
  });
  // Order: canonical types first, then any extras alphabetically
  const canonical = ["Run", "Pass", "RPO", "Screen", "Quick", "Play Action", "Run Option", "Movement"];
  const seen = new Set();
  const order = [];
  canonical.forEach((t) => { if (counts.has(t)) { order.push(t); seen.add(t); } });
  Array.from(counts.keys()).filter((t) => !seen.has(t)).sort().forEach((t) => order.push(t));

  if (order.length === 0) { wrap.innerHTML = ""; return; }

  const allActive = !_catCleanupTypeFilter ? "active" : "";
  const chips = [
    `<button type="button" class="cat-cleanup-chip ${allActive}" data-action="setPlaybookCategoryCleanupTypeFilter" data-arg="">All types <span class="cat-cleanup-chip-count">${entries.length}</span></button>`,
  ].concat(order.map((t) => {
    const active = _catCleanupTypeFilter === t ? "active" : "";
    return `<button type="button" class="cat-cleanup-chip ${active}" data-action="setPlaybookCategoryCleanupTypeFilter" data-arg="${escapeHtml(t)}">${escapeHtml(t)} <span class="cat-cleanup-chip-count">${counts.get(t)}</span></button>`;
  }));
  wrap.innerHTML = chips.join("");
}

function _catCleanupSearchMatch(play, q) {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  if (!needle) return true;
  const tokens = needle.split(/\s+/).filter(Boolean);
  const hay = [
    play.play, play.formation, play.type, play.personnel, play.basePlay, play.oneWord,
    play.formTag1, play.formTag2, play.playTag1, play.playTag2,
    play.protection, play.lineCall, play.motion, play.shift, play.back,
    play.keyPlayerName1, play.keyPlayerName2, play.keyPlayerName3,
    play.notes,
  ].filter(Boolean).join(" ").toLowerCase();
  return tokens.every((tok) => hay.includes(tok));
}

function catCleanupCheckAllVisible() {
  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === _catCleanupCategoryId);
  if (!cat || cat.manual) return;
  const checks = document.querySelectorAll("#catCleanupList .cat-cleanup-check:not(:checked)");
  if (checks.length === 0) { showToast("Nothing to add", { duration: 1500, type: "info" }); return; }
  let mutated = 0;
  checks.forEach((cb) => {
    const idx = parseInt(cb.dataset.masterIdx, 10);
    if (!isNaN(idx) && plays[idx] && _catApplyMetadata(plays[idx], cat)) mutated++;
  });
  if (mutated) {
    storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof filterPlays === "function") filterPlays();
    if (typeof renderPlaybook === "function") renderPlaybook();
  }
  showToast(`Added ${mutated} play${mutated === 1 ? "" : "s"} to ${_catCategoryDisplayName(cat)}`, { duration: 2000, type: "success" });
  _renderCatCleanupSelect();
  _renderCatCleanupList();
}

function catCleanupUncheckAllVisible() {
  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === _catCleanupCategoryId);
  if (!cat || cat.manual) return;
  const checks = document.querySelectorAll("#catCleanupList .cat-cleanup-check:checked");
  if (checks.length === 0) { showToast("Nothing to remove", { duration: 1500, type: "info" }); return; }
  let mutated = 0;
  checks.forEach((cb) => {
    const idx = parseInt(cb.dataset.masterIdx, 10);
    if (!isNaN(idx) && plays[idx] && _catRemoveMetadata(plays[idx], cat)) mutated++;
  });
  if (mutated) {
    storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof filterPlays === "function") filterPlays();
    if (typeof renderPlaybook === "function") renderPlaybook();
  }
  showToast(`Removed ${mutated} play${mutated === 1 ? "" : "s"} from ${_catCategoryDisplayName(cat)}`, { duration: 2000, type: "success" });
  _renderCatCleanupSelect();
  _renderCatCleanupList();
}

/** Tiny mark-style highlighter for search hits (operates on rendered text only — safe). */
function _catCleanupHighlight(html, q) {
  if (!q) return html;
  const tokens = q.toLowerCase().trim().split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return html;
  // We don't want to break inside HTML tags, so split on tag boundaries.
  return html.replace(/>([^<]+)</g, (_, txt) => {
    let out = txt;
    tokens.forEach((tok) => {
      try {
        const re = new RegExp(`(${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
        out = out.replace(re, '<mark class="cat-cleanup-mark">$1</mark>');
      } catch (_) { /* ignore */ }
    });
    return ">" + out + "<";
  });
}

function _renderCatCleanupList() {
  const listEl = document.getElementById("catCleanupList");
  const sumEl = document.getElementById("catCleanupSummary");
  if (!listEl) return;

  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === _catCleanupCategoryId);
  if (!cat) {
    listEl.innerHTML = `<div class="cat-cleanup-empty">Pick a category above.</div>`;
    if (sumEl) sumEl.textContent = "";
    return;
  }

  const entries = _catCleanupScopeEntries();
  const matchingCount = entries.filter((e) => _catPlayMatches(e.play, cat)).length;
  const scopeLbl =
    _catCleanupScope === "filtered" ? "Filtered"
      : _catCleanupScope === "gameplan" ? "Game Plan"
        : "All plays";

  // Apply: type chip, show-mode, search (in that order)
  let visible = entries;
  if (_catCleanupTypeFilter) {
    const t = _catCleanupTypeFilter.toLowerCase();
    visible = visible.filter((e) => (e.play.type || "").toLowerCase() === t);
  }
  if (_catCleanupShowMode === "matching") {
    visible = visible.filter((e) => _catPlayMatches(e.play, cat));
  } else if (_catCleanupShowMode === "unmatched") {
    visible = visible.filter((e) => !_catPlayMatches(e.play, cat));
  }
  if (_catCleanupSearch) {
    visible = visible.filter((e) => _catCleanupSearchMatch(e.play, _catCleanupSearch));
  }

  if (sumEl) {
    const filterBits = [];
    if (_catCleanupTypeFilter) filterBits.push(`type=${_catCleanupTypeFilter}`);
    if (_catCleanupShowMode !== "all") filterBits.push(_catCleanupShowMode);
    if (_catCleanupSearch) filterBits.push(`"${_catCleanupSearch}"`);
    const filtersTxt = filterBits.length ? ` · ${escapeHtml(filterBits.join(" · "))}` : "";
    sumEl.innerHTML =
      `<strong>${escapeHtml(_catCategoryDisplayName(cat))}</strong> — ${_catCriteriaSummary(cat)} ` +
      `<span class="cat-cleanup-summary-meta">[${escapeHtml(scopeLbl)}: ${matchingCount}/${entries.length} match · showing ${visible.length}${filtersTxt}]</span>`;
  }

  if (cat.manual) {
    listEl.innerHTML = `<div class="cat-cleanup-empty">This is a manual-only category. Add plays directly from the Call Sheet tab.</div>`;
    return;
  }

  if (entries.length === 0) {
    const hint =
      _catCleanupScope === "filtered" ? "No plays match the playbook's current filter."
        : _catCleanupScope === "gameplan" ? "No plays are tagged for the active opponent yet."
          : "No plays in the playbook.";
    listEl.innerHTML = `<div class="cat-cleanup-empty">${escapeHtml(hint)}</div>`;
    return;
  }
  if (visible.length === 0) {
    const reason = _catCleanupSearch || _catCleanupTypeFilter || _catCleanupShowMode !== "all"
      ? "No plays match the current search/filters."
      : "✅ Every play in scope already matches this category.";
    listEl.innerHTML = `<div class="cat-cleanup-empty">${escapeHtml(reason)}</div>`;
    return;
  }

  // Sort: matching first (when showing All), then by type/formation/play
  visible.sort((a, b) => {
    const am = _catPlayMatches(a.play, cat) ? 0 : 1;
    const bm = _catPlayMatches(b.play, cat) ? 0 : 1;
    if (am !== bm) return am - bm;
    const at = `${a.play.type || ""}|${a.play.formation || ""}|${a.play.play || ""}`;
    const bt = `${b.play.type || ""}|${b.play.formation || ""}|${b.play.play || ""}`;
    return at.localeCompare(bt);
  });

  const q = _catCleanupSearch;
  const rows = visible.map((e) => {
    const matches = _catPlayMatches(e.play, cat);
    let callHtml = typeof getFullCall === "function"
      ? getFullCall(e.play, { showLineCall: true })
      : escapeHtml(e.play.play || "(unnamed)");
    let ctx = [e.play.type, e.play.personnel, e.play.formation].filter(Boolean).join(" • ");
    let ctxHtml = escapeHtml(ctx);
    if (q) {
      callHtml = _catCleanupHighlight(callHtml, q);
      ctxHtml = _catCleanupHighlight(`>${ctxHtml}<`, q).slice(1, -1);
    }
    return `<label class="cat-cleanup-row ${matches ? "is-matching" : ""}" data-master-idx="${e.masterIdx}">
      <input type="checkbox" class="cat-cleanup-check" ${matches ? "checked" : ""} data-master-idx="${e.masterIdx}" />
      <div class="cat-cleanup-row-body">
        <div class="cat-cleanup-row-call">${callHtml}</div>
        <div class="cat-cleanup-row-ctx">${ctxHtml}</div>
      </div>
      ${matches ? '<span class="cat-cleanup-row-tick" aria-hidden="true">✓</span>' : ''}
    </label>`;
  }).join("");

  listEl.innerHTML = rows;

  listEl.querySelectorAll(".cat-cleanup-check").forEach((cb) => {
    cb.addEventListener("change", () => _onCatCleanupToggle(cb));
  });
}

function _onCatCleanupToggle(cb) {
  const masterIdx = parseInt(cb.dataset.masterIdx, 10);
  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === _catCleanupCategoryId);
  if (!cat || isNaN(masterIdx) || !plays[masterIdx]) return;
  const play = plays[masterIdx];
  const wantMatch = cb.checked;
  let mutated = false;
  if (wantMatch) {
    mutated = _catApplyMetadata(play, cat);
    // Verify via findMatchingCategories — if still not matching, revert + warn
    if (!_catPlayMatches(play, cat)) {
      // Some categories (e.g. Goal Line) require BOTH position+situation; apply once shouldn't fail
      // but if it does, leave the writes (they're additive) and notify softly.
      showToast("Wrote metadata, but this category needs more (e.g. both position + situation). Edit play directly to finish.", { duration: 3500, type: "warning" });
    }
  } else {
    mutated = _catRemoveMetadata(play, cat);
  }
  if (mutated) {
    storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
    if (typeof invalidateFilterCache === "function") invalidateFilterCache();
    if (typeof filterPlays === "function") filterPlays();
    if (typeof renderPlaybook === "function") renderPlaybook();
  }
  // Refresh row state inline
  const row = cb.closest(".cat-cleanup-row");
  const stillMatches = _catPlayMatches(play, cat);
  if (row) row.classList.toggle("is-matching", stillMatches);
  cb.checked = stillMatches;
  // Toggle the row's tick badge
  if (row) {
    const tick = row.querySelector(".cat-cleanup-row-tick");
    if (stillMatches && !tick) {
      const span = document.createElement("span");
      span.className = "cat-cleanup-row-tick";
      span.setAttribute("aria-hidden", "true");
      span.textContent = "✓";
      row.appendChild(span);
    } else if (!stillMatches && tick) {
      tick.remove();
    }
  }
  // Refresh select counts and summary (other categories may have shifted)
  _renderCatCleanupSelect();
  // Update summary without rebuilding the list
  const sumEl = document.getElementById("catCleanupSummary");
  if (sumEl) {
    const entries = _catCleanupScopeEntries();
    const matchingCount = entries.filter((e) => _catPlayMatches(e.play, cat)).length;
    const scopeLbl =
      _catCleanupScope === "filtered" ? "Filtered"
        : _catCleanupScope === "gameplan" ? "Game Plan"
          : "All plays";
    const visCount = document.querySelectorAll("#catCleanupList .cat-cleanup-row").length;
    sumEl.innerHTML =
      `<strong>${escapeHtml(_catCategoryDisplayName(cat))}</strong> — ${_catCriteriaSummary(cat)} ` +
      `<span class="cat-cleanup-summary-meta">[${escapeHtml(scopeLbl)}: ${matchingCount}/${entries.length} match · showing ${visCount}]</span>`;
  }
  // If show-mode would now exclude this row, fade it out
  const exclude =
    (_catCleanupShowMode === "matching" && !stillMatches) ||
    (_catCleanupShowMode === "unmatched" && stillMatches);
  if (exclude && row) {
    row.style.transition = "opacity 0.18s";
    row.style.opacity = "0";
    setTimeout(() => row.remove(), 180);
  }
}

