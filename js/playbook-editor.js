/** Index into master `plays` array of the play being edited, or -1 for new */
let _editingMasterIdx = -1;
/** Index into `filteredPlays` of the play being edited, for prev/next nav */
let _editingFilteredIdx = -1;

/**
 * Build a sorted, deduplicated option list from actual playbook values
 * for a given field key, seeded with defaults so the list is never empty.
 * Always includes "" (blank) as first option.
 */
function _editorOptions(key, defaults, extraKeys) {
  const set = new Set(defaults);
  if (typeof plays !== "undefined" && Array.isArray(plays)) {
    const keys = extraKeys || [key];
    plays.forEach((play) => {
      keys.forEach((fieldKey) => {
        const value = (play[fieldKey] || "").trim();
        if (value) set.add(value);
      });
    });
  }
  const sorted = [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  return ["", ...sorted];
}

const _TYPE_DEFAULTS = [
  "Run",
  "Pass",
  "RPO",
  "Screen",
  "Quick",
  "Play Action",
  "Play Pass",
  "Run Option",
  "Option",
  "Movement",
  "Drop",
  "Tricks",
];
const _SITUATION_DEFAULTS = [
  "Short Yardage",
  "2 Minute",
  "4 Minute",
  "Red Zone",
  "Silver",
  "Bad Weather",
];
const _FIELD_POS_DEFAULTS = [
  "Green",
  "Lo-RZ",
  "Hi-RZ",
  "Goal Line",
  "Backed Up",
  "Saigon",
  "Fringe",
  "Coming Out",
];
const _HIT_CHART_DEFAULTS = [
  "Left Deep",
  "Left Seam",
  "Left Medium",
  "Left Short",
  "Left Curl",
  "Left Hook",
  "Left Flat",
  "Middle Hole",
  "Middle Hook",
  "Deep Post",
  "Right Deep",
  "Right Seam",
  "Right Medium",
  "Right Short",
  "Right Curl",
  "Right Hook",
  "Right Flat",
  "Inside Run Left",
  "Inside Run Right",
  "Inside Tackle Left",
  "Inside Tackle Right",
  "Off Tackle Left",
  "Off Tackle Right",
];

const _EDITOR_SECTIONS = [
  {
    title: "Core",
    fields: [
      {
        key: "type",
        label: "Play Type",
        type: "select",
        optionsFn: () => _editorOptions("type", _TYPE_DEFAULTS),
      },
      { key: "personnel", label: "Personnel" },
      { key: "formation", label: "Formation" },
      { key: "play", label: "Play Name" },
      { key: "basePlay", label: "Base Play" },
      { key: "oneWord", label: "One Word" },
    ],
  },
  {
    title: "Tags",
    fields: [
      { key: "formTag1", label: "Form Tag 1" },
      { key: "formTag2", label: "Form Tag 2" },
      { key: "playTag1", label: "Play Tag 1" },
      { key: "playTag2", label: "Play Tag 2" },
    ],
  },
  {
    title: "Blocking & Motion",
    fields: [
      { key: "under", label: "Under" },
      { key: "back", label: "Back" },
      { key: "shift", label: "Shift" },
      { key: "motion", label: "Motion" },
      { key: "protection", label: "Protection" },
      { key: "lineCall", label: "Line Call" },
    ],
  },
  {
    title: "Preferences",
    fields: [
      {
        key: "preferredSituation",
        label: "Situation",
        type: "select",
        optionsFn: () =>
          _editorOptions("preferredSituation", _SITUATION_DEFAULTS),
      },
      {
        key: "preferredDown",
        label: "Down",
        type: "select",
        options: ["", "1", "2", "3", "4"],
      },
      {
        key: "preferredDistance",
        label: "Distance",
        type: "select",
        options: ["", "Short", "Medium", "Long"],
      },
      { key: "preferredHash", label: "Hash" },
      {
        key: "preferredFieldPosition",
        label: "Field Position",
        type: "select",
        optionsFn: () =>
          _editorOptions("preferredFieldPosition", _FIELD_POS_DEFAULTS),
      },
      { key: "tempo", label: "Tempo" },
    ],
  },
  {
    title: "Practice Look",
    fields: [
      { key: "practiceFront", label: "Front" },
      { key: "practiceDefense", label: "Defense" },
      { key: "practiceCoverage", label: "Coverage" },
      { key: "practiceBlitz", label: "Blitz" },
      { key: "practiceStunt", label: "Stunt" },
    ],
  },
  {
    title: "Key Players",
    fields: [
      { key: "keyPlayer1", label: "Player 1 Position" },
      { key: "keyPlayerName1", label: "Player 1 Name" },
      { key: "keyPlayer2", label: "Player 2 Position" },
      { key: "keyPlayerName2", label: "Player 2 Name" },
      { key: "keyPlayer3", label: "Player 3 Position" },
      { key: "keyPlayerName3", label: "Player 3 Name" },
    ],
  },
  {
    title: "Constraints & Hit Charts",
    fields: [
      { key: "constraint1", label: "Constraint 1" },
      { key: "constraint2", label: "Constraint 2" },
      { key: "constraint3", label: "Constraint 3" },
      {
        key: "hitChart1",
        label: "Hit Chart 1",
        type: "select",
        canAddNew: true,
        optionsFn: () =>
          _editorOptions("hitChart1", _HIT_CHART_DEFAULTS, [
            "hitChart1",
            "hitChart2",
            "hitChart3",
          ]),
      },
      {
        key: "hitChart2",
        label: "Hit Chart 2",
        type: "select",
        canAddNew: true,
        optionsFn: () =>
          _editorOptions("hitChart2", _HIT_CHART_DEFAULTS, [
            "hitChart1",
            "hitChart2",
            "hitChart3",
          ]),
      },
      {
        key: "hitChart3",
        label: "Hit Chart 3",
        type: "select",
        canAddNew: true,
        optionsFn: () =>
          _editorOptions("hitChart3", _HIT_CHART_DEFAULTS, [
            "hitChart1",
            "hitChart2",
            "hitChart3",
          ]),
      },
    ],
  },
  {
    title: "Other",
    fields: [
      { key: "deadVs", label: "Dead Vs" },
      { key: "opponent", label: "Opponent" },
      { key: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },
];

function _buildPlayEditorLineupSection(play) {
  const directAssignments = normalizePlayerAssignments(play?.playerAssignments);
  const rowOne = getTeamAssignmentSlots(play?.personnel).filter(
    (slot) => slot.row === 0,
  );
  const rowTwo = getTeamAssignmentSlots(play?.personnel).filter(
    (slot) => slot.row === 1,
  );
  const renderRow = (slots) => `
    <div class="team-package-grid ${slots.length === 5 ? "team-package-grid--five" : "team-package-grid--six"}">
      ${slots.map((slot) => `
        <label class="team-package-slot">
          <span class="team-package-slot-label">${slot.label}</span>
          <select data-player-slot="${slot.key}" aria-label="${escapeHtml(play?.play || "Play")} ${slot.label} template">
            ${buildTeamPlayerOptionMarkup(directAssignments[slot.key] || "")}
          </select>
        </label>
      `).join("")}
    </div>
  `;

  return `
    <div class="pb-editor-section">
      <div class="pb-editor-section-title">Lineup Template</div>
      <p class="pb-editor-lineup-hint">Blank slots inherit from the personnel package depth chart. Saved starters become this play’s master template.</p>
      ${renderRow(rowOne)}
      ${renderRow(rowTwo)}
    </div>
  `;
}

function openPlayEditor(filteredIdx) {
  const play = filteredPlays[filteredIdx];
  if (!play) return;
  _editingFilteredIdx = filteredIdx;
  _editingMasterIdx = plays.indexOf(play);
  if (_editingMasterIdx < 0) {
    _editingMasterIdx = plays.findIndex((candidate) => playsMatch(candidate, play));
  }
  _populateEditorForm(play, false);
}

function addNewPlay() {
  if (plays.length === 0) {
    showToast("Import a playbook CSV first", { duration: 3000, type: "error" });
    return;
  }
  _editingMasterIdx = -1;
  _editingFilteredIdx = -1;
  const blank = {};
  _EDITOR_SECTIONS.forEach((section) =>
    section.fields.forEach((field) => {
      blank[field.key] = "";
    }),
  );
  _populateEditorForm(blank, true);
}

function _populateEditorForm(play, isNew) {
  const overlay = document.getElementById("playEditorOverlay");
  const body = document.getElementById("playEditorBody");
  const title = document.getElementById("playEditorTitle");
  const icon = document.getElementById("playEditorIcon");
  const deleteBtn = document.getElementById("playEditorDeleteBtn");
  const saveAddAnotherBtn = document.getElementById("playEditorSaveAddAnotherBtn");

  title.textContent = isNew ? "New Play" : "Edit Play";
  icon.textContent = isNew ? "➕" : "✏️";
  deleteBtn.style.display = isNew ? "none" : "";
  if (saveAddAnotherBtn) saveAddAnotherBtn.style.display = isNew ? "" : "none";

  const preview = document.getElementById("playEditorPreview");
  if (preview) {
    if (isNew) {
      preview.innerHTML = "";
      preview.style.display = "none";
    } else {
      preview.innerHTML = getFullCall(play, { showLineCall: false });
      preview.style.display = "";
    }
  }

  const posEl = document.getElementById("playEditorPos");
  const prevBtn = document.getElementById("playEditorPrev");
  const nextBtn = document.getElementById("playEditorNext");
  if (isNew || _editingFilteredIdx < 0) {
    if (posEl) posEl.textContent = "";
    if (prevBtn) prevBtn.style.display = "none";
    if (nextBtn) nextBtn.style.display = "none";
  } else {
    if (posEl) {
      posEl.textContent = `${_editingFilteredIdx + 1} / ${filteredPlays.length}`;
    }
    if (prevBtn) {
      prevBtn.style.display = "";
      prevBtn.disabled = _editingFilteredIdx <= 0;
    }
    if (nextBtn) {
      nextBtn.style.display = "";
      nextBtn.disabled = _editingFilteredIdx >= filteredPlays.length - 1;
    }
  }

  let html = "";
  const gw = getGameWeek();
  if (!isNew && gw.opponentName) {
    const isTagged = isPlayTaggedForOpponent(play, gw.opponentName);
    html += `<div class="pb-editor-section pb-editor-gameplan">
      <div class="pb-editor-section-title">🎯 Game Plan — ${escapeHtml(gw.opponentName)}${gw.weekLabel ? " (" + escapeHtml(gw.weekLabel) + ")" : ""}</div>
      <label class="pb-gp-toggle" for="pe-gameplan">
        <input type="checkbox" id="pe-gameplan" ${isTagged ? "checked" : ""} />
        <span>Include in game plan for <strong>${escapeHtml(gw.opponentName)}</strong></span>
      </label>
    </div>`;
  }

  // Defensive match-up flags (good vs Man / Bear / Okie)
  html += `<div class="pb-editor-section pb-editor-matchups">
    <div class="pb-editor-section-title">🛡️ Defensive Match-ups</div>
    <div class="pb-editor-matchup-grid">
      <label class="pb-matchup-toggle" for="pe-goodVsMan">
        <input type="checkbox" id="pe-goodVsMan" data-bool-field="goodVsMan" ${play.goodVsMan ? "checked" : ""} />
        <span>✅ Good vs. <strong>Man</strong></span>
      </label>
      <label class="pb-matchup-toggle" for="pe-goodVsBear">
        <input type="checkbox" id="pe-goodVsBear" data-bool-field="goodVsBear" ${play.goodVsBear ? "checked" : ""} />
        <span>🐻 Good vs. <strong>Bear</strong></span>
      </label>
      <label class="pb-matchup-toggle" for="pe-goodVsOkie">
        <input type="checkbox" id="pe-goodVsOkie" data-bool-field="goodVsOkie" ${play.goodVsOkie ? "checked" : ""} />
        <span>🤠 Good vs. <strong>Okie</strong></span>
      </label>
    </div>
  </div>`;

  _EDITOR_SECTIONS.forEach((section) => {
    html += `<div class="pb-editor-section">`;
    html += `<div class="pb-editor-section-title">${section.title}</div>`;
    html += `<div class="pb-editor-grid">`;
    section.fields.forEach((field) => {
      const val = play[field.key] || "";
      const wideClass = field.wide ? " pb-editor-field-wide" : "";
      html += `<div class="pb-editor-field${wideClass}">`;
      html += `<label for="pe-${field.key}">${escapeHtml(field.label)}</label>`;

      if (field.type === "select") {
        const opts = field.optionsFn ? field.optionsFn() : field.options || [];
        const valInList = opts.some((option) => option === val);
        html += `<select id="pe-${field.key}" data-field="${field.key}"${field.canAddNew ? ' data-can-add-new="1"' : ""}>`;
        if (!valInList && val) {
          html += `<option value="${escapeHtml(val)}" selected>${escapeHtml(val)}</option>`;
        }
        opts.forEach((option) => {
          const sel = option === val ? " selected" : "";
          const display = option === "" ? "—" : option;
          html += `<option value="${escapeHtml(option)}"${sel}>${escapeHtml(display)}</option>`;
        });
        if (field.canAddNew) {
          html += `<option value="__add_new__">➕ Add New…</option>`;
        }
        html += `</select>`;
      } else if (field.type === "textarea") {
        html += `<textarea id="pe-${field.key}" data-field="${field.key}" rows="3">${escapeHtml(val)}</textarea>`;
      } else {
        html += `<input type="text" id="pe-${field.key}" data-field="${field.key}" value="${escapeHtml(val)}">`;
      }
      html += `</div>`;
    });
    html += `</div></div>`;
  });

  html += _buildPlayEditorLineupSection(play);

  body.innerHTML = html;
  overlay.removeAttribute("inert");
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("visible");

  body.querySelectorAll("select[data-can-add-new]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      if (sel.value !== "__add_new__") return;
      sel.value = "";
      const newVal = await showPrompt("Enter a new option:", "", {
        title: "Add New Option",
        icon: "➕",
        placeholder: "e.g. Right Seam",
      });
      if (newVal && newVal.trim()) {
        const trimmed = newVal.trim();
        const addOpt = sel.querySelector('option[value="__add_new__"]');
        const option = document.createElement("option");
        option.value = trimmed;
        option.textContent = trimmed;
        option.selected = true;
        sel.insertBefore(option, addOpt);
      }
    });
  });

  const first = body.querySelector("input, select, textarea");
  if (first) setTimeout(() => first.focus(), 100);
}

function savePlayEditor(opts = {}) {
  const keepOpen = opts && opts.keepOpen === true;
  const wasNew = _editingMasterIdx < 0;
  const body = document.getElementById("playEditorBody");
  const fields = body.querySelectorAll("[data-field]");
  const assignmentFields = body.querySelectorAll("[data-player-slot]");
  const data = {};
  fields.forEach((el) => {
    data[el.dataset.field] = (el.value || "").trim();
  });
  // Boolean checkbox fields (defensive match-ups)
  body.querySelectorAll("[data-bool-field]").forEach((el) => {
    data[el.dataset.boolField] = !!el.checked;
  });
  const playerAssignments = {};
  assignmentFields.forEach((el) => {
    const slotKey = el.dataset.playerSlot;
    const value = String(el.value || "").trim();
    if (slotKey && value) playerAssignments[slotKey] = value;
  });
  data.playerAssignments = Object.keys(playerAssignments).length
    ? playerAssignments
    : undefined;

  if (!data.play) {
    showToast("Play name is required", { duration: 3000, type: "error" });
    const playInput = document.getElementById("pe-play");
    if (playInput) playInput.focus();
    return;
  }

  if (_editingMasterIdx >= 0) {
    const existing = plays[_editingMasterIdx];
    if (!existing) {
      showToast("Play no longer exists", { type: "error" });
      closePlayEditor();
      return;
    }
    Object.keys(data).forEach((key) => {
      existing[key] = data[key];
    });
    existing.playerAssignments = data.playerAssignments;
    _syncGamePlanCheckbox(existing);
    showToast("✏️ Play updated", { duration: 2000, type: "success" });
  } else {
    const newPlay = {};
    _EDITOR_SECTIONS.forEach((section) =>
      section.fields.forEach((field) => {
        newPlay[field.key] = data[field.key] || "";
      }),
    );
    if (data.playerAssignments) newPlay.playerAssignments = data.playerAssignments;
    plays.push(newPlay);
    _syncGamePlanCheckbox(newPlay);
    showToast("➕ Play added to playbook", { duration: 2000, type: "success" });
  }

  storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
  invalidateFilterCache();
  filteredPlays = [...plays];
  filterPlays();
  if (keepOpen && wasNew) {
    // Reset the editor to a fresh blank new-play form, focus first field.
    addNewPlay();
    const firstInput = document.querySelector("#playEditorBody [data-field]");
    if (firstInput) {
      try { firstInput.focus(); } catch (_e) { /* ignore */ }
    }
    return;
  }
  closePlayEditor();
}

function savePlayEditorAndAddAnother() {
  savePlayEditor({ keepOpen: true });
}

async function deletePlayFromEditor() {
  if (_editingMasterIdx < 0) return;
  const play = plays[_editingMasterIdx];
  if (!play) { closePlayEditor(); return; }
  const ok = await showConfirm(
    `Delete <strong>${escapeHtml(play.play || "this play")}</strong> from the playbook?`,
    { title: "Delete Play", icon: "🗑️", confirmText: "Delete", danger: true },
  );
  if (!ok) return;

  plays.splice(_editingMasterIdx, 1);
  storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
  invalidateFilterCache();
  filteredPlays = [...plays];
  filterPlays();
  closePlayEditor();
  showToast("🗑️ Play deleted", { duration: 2000, type: "success" });
}

function closePlayEditor() {
  const overlay = document.getElementById("playEditorOverlay");
  if (overlay) {
    overlay.classList.remove("visible");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("inert", "");
  }
  _editingMasterIdx = -1;
  _editingFilteredIdx = -1;
}

function togglePlaybookGamePlan(filteredIdx) {
  const play = filteredPlays[filteredIdx];
  if (!play) return;
  const gw = getGameWeek();
  if (!gw.opponentName) {
    showToast("Select an opponent on the Dashboard first", {
      duration: 3000,
      type: "error",
    });
    return;
  }
  const nowTagged = togglePlayGamePlanTag(play, gw.opponentName);
  showToast(
    nowTagged
      ? `🎯 Added to game plan vs ${gw.opponentName}`
      : `Removed from game plan`,
    { duration: 1500, type: nowTagged ? "success" : undefined },
  );
  renderPlaybook();
}

function _syncGamePlanCheckbox(play) {
  const cb = document.getElementById("pe-gameplan");
  if (!cb) return;
  const gw = getGameWeek();
  if (!gw.opponentName) return;
  const isTagged = isPlayTaggedForOpponent(play, gw.opponentName);
  if (cb.checked !== isTagged) {
    togglePlayGamePlanTag(play, gw.opponentName);
  }
}

function playEditorPrev() {
  if (_editingFilteredIdx <= 0) return;
  _autoSaveCurrentEditorFields();
  openPlayEditor(_editingFilteredIdx - 1);
}

function playEditorNext() {
  if (_editingFilteredIdx >= filteredPlays.length - 1) return;
  _autoSaveCurrentEditorFields();
  openPlayEditor(_editingFilteredIdx + 1);
}

function _autoSaveCurrentEditorFields() {
  if (_editingMasterIdx < 0) return;
  const body = document.getElementById("playEditorBody");
  if (!body) return;
  const fields = body.querySelectorAll("[data-field]");
  const existing = plays[_editingMasterIdx];
  if (!existing) return;
  let changed = false;
  fields.forEach((el) => {
    const val = (el.value || "").trim();
    if (existing[el.dataset.field] !== val) {
      existing[el.dataset.field] = val;
      changed = true;
    }
  });
  // Also capture lineup template player slots so Prev/Next don't drop assignments
  const slotFields = body.querySelectorAll("[data-player-slot]");
  const playerAssignments = {};
  slotFields.forEach((el) => {
    const val = String(el.value || "").trim();
    if (val) playerAssignments[el.dataset.playerSlot] = val;
  });
  const newAssignments = Object.keys(playerAssignments).length
    ? playerAssignments
    : undefined;
  if (JSON.stringify(existing.playerAssignments) !== JSON.stringify(newAssignments)) {
    existing.playerAssignments = newAssignments;
    changed = true;
  }
  if (changed) {
    storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
    invalidateFilterCache();
  }
  _syncGamePlanCheckbox(existing);
}