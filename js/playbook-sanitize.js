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
  { key: "formTag1", label: "Form Tag 1" },
  { key: "formTag2", label: "Form Tag 2" },
  { key: "playTag1", label: "Play Tag 1" },
  { key: "playTag2", label: "Play Tag 2" },
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
  { key: "keyPlayer1", label: "Key Player 1 Position" },
  { key: "keyPlayerName1", label: "Key Player 1 Name" },
  { key: "keyPlayer2", label: "Key Player 2 Position" },
  { key: "keyPlayerName2", label: "Key Player 2 Name" },
  { key: "keyPlayer3", label: "Key Player 3 Position" },
  { key: "keyPlayerName3", label: "Key Player 3 Name" },
  { key: "constraint1", label: "Constraint 1" },
  { key: "constraint2", label: "Constraint 2" },
  { key: "constraint3", label: "Constraint 3" },
  { key: "hitChart1", label: "Hit Chart 1", type: "select", canAddNew: true, optionsFn: () => _editorOptions("hitChart1", _HIT_CHART_DEFAULTS, ["hitChart1", "hitChart2", "hitChart3"]) },
  { key: "hitChart2", label: "Hit Chart 2", type: "select", canAddNew: true, optionsFn: () => _editorOptions("hitChart2", _HIT_CHART_DEFAULTS, ["hitChart1", "hitChart2", "hitChart3"]) },
  { key: "hitChart3", label: "Hit Chart 3", type: "select", canAddNew: true, optionsFn: () => _editorOptions("hitChart3", _HIT_CHART_DEFAULTS, ["hitChart1", "hitChart2", "hitChart3"]) },
  { key: "deadVs", label: "Dead Vs" },
  { key: "opponent", label: "Opponent" },
  { key: "notes", label: "Notes" },
];

let _sanitizeFieldKey = "preferredHash";
let _sanitizeHideCompleted = true;
let _sanitizeAutosaveTimer = null;

function _sanitizeFieldDef(key) {
  return SANITIZE_FIELDS.find((f) => f.key === key) || SANITIZE_FIELDS[0];
}

function _sanitizeIsEmpty(play, key) {
  const value = (play && play[key] != null ? String(play[key]) : "").trim();
  return value === "";
}

function _sanitizePlaySummary(play) {
  const bits = [
    play.type,
    play.personnel,
    play.formation,
    play.play,
  ].filter(Boolean);
  return bits.join(" • ") || "(unnamed play)";
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

  const inputHtmlFor = (play, masterIdx) => {
    const value = String(play[def.key] || "");
    const inputId = `pbSanitizeInput-${masterIdx}`;
    if (def.type === "select") {
      const optList = def.options || (def.optionsFn ? def.optionsFn() : [""]);
      const options = optList.map((o) => {
        const sel = o === value ? "selected" : "";
        const label = o === "" ? "—" : o;
        return `<option value="${escapeHtml(o)}" ${sel}>${escapeHtml(label)}</option>`;
      }).join("");
      const datalistOpts = def.canAddNew && def.optionsFn
        ? def.optionsFn().filter(Boolean).map((o) => `<option value="${escapeHtml(o)}"></option>`).join("")
        : "";
      // For select with canAddNew, render an input + datalist instead so the
      // user can also type a brand-new value.
      if (def.canAddNew) {
        return `
          <input id="${inputId}" type="text" list="${inputId}-list" class="pb-sanitize-input"
            data-master-idx="${masterIdx}" value="${escapeHtml(value)}"
            placeholder="Type or pick a value" />
          <datalist id="${inputId}-list">${datalistOpts}</datalist>`;
      }
      return `
        <select id="${inputId}" class="pb-sanitize-input pb-sanitize-select"
          data-master-idx="${masterIdx}">
          ${options}
        </select>`;
    }
    return `
      <input id="${inputId}" type="text" class="pb-sanitize-input"
        data-master-idx="${masterIdx}" value="${escapeHtml(value)}"
        placeholder="Type a value" />`;
  };

  const rowsHtml = missingPlays.map(({ play, idx }) => {
    const summary = _sanitizePlaySummary(play);
    const filled = !_sanitizeIsEmpty(play, def.key);
    return `
      <div class="pb-sanitize-row ${filled ? "is-filled" : ""}" data-master-idx="${idx}">
        <div class="pb-sanitize-row-info">
          <div class="pb-sanitize-row-name">${escapeHtml(play.play || "(no name)")}</div>
          <div class="pb-sanitize-row-summary">${escapeHtml(summary)}</div>
        </div>
        <div class="pb-sanitize-row-input">
          ${inputHtmlFor(play, idx)}
          <button class="btn btn-sm btn-secondary pb-sanitize-edit-btn" type="button"
            data-action="openPlayEditorFromSanitize" data-arg="${idx}"
            title="Open full play editor">✏️</button>
        </div>
      </div>`;
  }).join("");

  body.innerHTML = rowsHtml;
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
  if (value === previous) return;
  play[def.key] = value;

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

  // If hide-completed is on, fade + remove the row after a brief delay so the
  // user gets visual confirmation but doesn't lose focus context.
  if (_sanitizeHideCompleted && value && row) {
    setTimeout(() => {
      if (row.parentNode) {
        const status = document.getElementById("playbookSanitizeStatus");
        const def = _sanitizeFieldDef(_sanitizeFieldKey);
        const missingCount = plays.filter((p) => _sanitizeIsEmpty(p, def.key)).length;
        if (status) status.textContent = `${missingCount} of ${plays.length} plays missing ${def.label}`;
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
