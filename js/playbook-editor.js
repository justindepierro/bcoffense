/** Index into master `plays` array of the play being edited, or -1 for new */
let _editingMasterIdx = -1;
let _pendingPlayEditorImage = null;
let _pendingPlayEditorClips = [];

/** Responsibility position columns for player wristband printing. */
const RESP_POSITIONS = [
  { key: "respQ", label: "Q" },
  { key: "respT", label: "T" },
  { key: "respH", label: "H" },
  { key: "respZ", label: "Z" },
  { key: "respX", label: "X" },
  { key: "respY", label: "Y" },
  { key: "respLT", label: "LT" },
  { key: "respLG", label: "LG" },
  { key: "respC", label: "C" },
  { key: "respRG", label: "RG" },
  { key: "respRT", label: "RT" },
];
/** Index into `filteredPlays` of the play being edited, for prev/next nav */
let _editingFilteredIdx = -1;

// When the editor opens from a practice script, left/right follows the script
// order instead of the entire filtered playbook. Store script indexes (rather
// than copied play objects) so a save can refresh the script row in place.
let _editingScriptNavIndexes = [];
let _editingScriptNavPosition = -1;

function _resetPlayEditorNavigation() {
  _editingScriptNavIndexes = [];
  _editingScriptNavPosition = -1;
}

function _hasScriptEditorNavigation() {
  return _editingScriptNavPosition >= 0 &&
    _editingScriptNavIndexes.length > 0 &&
    _editingScriptNavPosition < _editingScriptNavIndexes.length;
}

function _getScriptEditorNavigationIndexes() {
  if (!Array.isArray(script)) return [];
  return script.reduce((indexes, item, index) => {
    if (item && !item.isSeparator) indexes.push(index);
    return indexes;
  }, []);
}

function _resetPendingPlayEditorMedia() {
  if (_pendingPlayEditorImage?.url) {
    try { URL.revokeObjectURL(_pendingPlayEditorImage.url); } catch (_err) { /* ignore */ }
  }
  _pendingPlayEditorImage = null;
  _pendingPlayEditorClips = [];
}

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
        options: ["", "1", "2", "3", "4", "1,2", "2,3", "3,4", "1,2,3", "2,3,4"],
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

function _buildPlayEditorResponsibilitiesSection(play) {
  const hasAnyResp = RESP_POSITIONS.some((pos) => play?.[pos.key]);
  const startOpen = hasAnyResp;

  const posHtml = RESP_POSITIONS.map((pos) => `
    <div class="pb-resp-cell">
      <label for="pe-${pos.key}">${escapeHtml(pos.label)}</label>
      <textarea id="pe-${pos.key}" data-field="${pos.key}" rows="2">${escapeHtml(play?.[pos.key] || "")}</textarea>
    </div>`).join("");

  return `
    <div class="pb-editor-section">
      <div class="pb-editor-section-title pb-resp-toggle"
           data-action="toggleCollapsiblePanel"
           aria-expanded="${startOpen ? "true" : "false"}"
           title="Click to expand/collapse">
        Player Responsibilities <span class="toggle-icon">${startOpen ? "▼" : "▶"}</span>
      </div>
      <div class="pb-resp-body${startOpen ? "" : " collapsed"}">
        <p class="pb-editor-lineup-hint">Fill in each player's assignment — used when printing Player Wristbands.</p>
        <div class="pb-resp-grid">${posHtml}</div>
        <div class="pb-editor-field pb-editor-field-wide pb-resp-notes">
          <label for="pe-respNotes">Resp. Notes</label>
          <textarea id="pe-respNotes" data-field="respNotes" rows="2">${escapeHtml(play?.respNotes || "")}</textarea>
        </div>
        <div class="pb-editor-field pb-editor-field-wide pb-resp-notes">
          <label for="pe-playerNotes">Player Notes</label>
          <textarea id="pe-playerNotes" data-field="playerNotes" rows="2"
            placeholder="Coach note players see in Swipe View">${escapeHtml(play?.playerNotes || "")}</textarea>
        </div>
      </div>
    </div>`;
}

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
  _resetPendingPlayEditorMedia();
  const play = filteredPlays[filteredIdx];
  if (!play) return;
  _resetPlayEditorNavigation();
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
  _resetPendingPlayEditorMedia();
  _editingMasterIdx = -1;
  _editingFilteredIdx = -1;
  _resetPlayEditorNavigation();
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
  const scriptNavigation = _hasScriptEditorNavigation();
  const navigationIndex = scriptNavigation ? _editingScriptNavPosition : _editingFilteredIdx;
  const navigationLength = scriptNavigation ? _editingScriptNavIndexes.length : filteredPlays.length;
  if (isNew || navigationIndex < 0) {
    if (posEl) posEl.textContent = "";
    if (prevBtn) prevBtn.style.display = "none";
    if (nextBtn) nextBtn.style.display = "none";
  } else {
    if (posEl) {
      posEl.textContent = scriptNavigation
        ? `Script ${navigationIndex + 1} / ${navigationLength}`
        : `${navigationIndex + 1} / ${navigationLength}`;
    }
    if (prevBtn) {
      prevBtn.style.display = "";
      prevBtn.disabled = navigationIndex <= 0;
      prevBtn.title = scriptNavigation ? "Previous practice-script play" : "Previous play";
      prevBtn.setAttribute("aria-label", prevBtn.title);
    }
    if (nextBtn) {
      nextBtn.style.display = "";
      nextBtn.disabled = navigationIndex >= navigationLength - 1;
      nextBtn.title = scriptNavigation ? "Next practice-script play" : "Next play";
      nextBtn.setAttribute("aria-label", nextBtn.title);
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

  const isPlayerHidden =
    typeof isPlayHiddenFromPlayers === "function"
      ? isPlayHiddenFromPlayers(play)
      : Boolean(play?.playerHidden);
  html += `<div class="pb-editor-section pb-editor-player-access">
    <div class="pb-editor-section-title">👁️ Player Access</div>
    <label class="pb-player-access-toggle" for="pe-playerHidden">
      <input type="checkbox" id="pe-playerHidden" data-bool-field="playerHidden" ${isPlayerHidden ? "checked" : ""} />
      <span>Hide this play from the player playbook</span>
    </label>
    <p class="pb-editor-hint">Use this for old installs or archived calls you still want coaches to keep in the master playbook.</p>
  </div>`;

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

  // Play image (IndexedDB-backed)
  const _peImgUrl = (!isNew && typeof getPlayImageUrl === "function")
    ? getPlayImageUrl(play) : null;
  html += `<div class="pb-editor-section pb-editor-image">
    <div class="pb-editor-section-title">🖼️ Play Image</div>
    <div class="pb-editor-image-row">
      <div class="pb-editor-image-preview" id="peImagePreview">
        ${_peImgUrl
      ? `<img src="${_peImgUrl}" alt="Play diagram preview" data-smart-diagram="true" />`
      : `<div class="pb-editor-image-placeholder">No image</div>`}
      </div>
      <div class="pb-editor-image-actions">
        <input type="file" id="peImageFile" accept="image/*" style="display:none" />
        <button type="button" class="btn btn-sm btn-secondary" data-action="triggerClick" data-target="peImageFile">${_peImgUrl ? "Replace" : "Add"} Image…</button>
        <button type="button" class="btn btn-sm btn-danger" id="peImageRemoveBtn" ${_peImgUrl ? "" : "style=\"display:none\""}>Remove</button>
        <p class="pb-editor-hint">Pick a PNG, JPG, or WebP. Optimized up to 2400px with a line-art-friendly format and stored offline.</p>
      </div>
    </div>
  </div>`;

  // Play video clips (Cloudflare R2-backed, player-accessible)
  if (typeof window.playClips !== "undefined") {
    const _peCanManageClips = window.playClips.canManage();
    html += `<div class="pb-editor-section pb-editor-clips">
    <div class="pb-editor-section-title">🎬 Video Clips <span class="pb-editor-clips-count" id="peClipsCount"></span></div>
    <div class="pb-editor-clips-list" id="peClipsList">
      <div class="pb-editor-clips-empty">Loading clips…</div>
    </div>
    <div class="pb-editor-clips-actions" id="peClipsActions"${_peCanManageClips ? "" : " style=\"display:none\""}>
      <input type="file" id="peClipFile" accept="video/*" style="display:none" />
      <button type="button" class="btn btn-sm btn-secondary" data-action="triggerClick" data-target="peClipFile">Add Clip…</button>
      <p class="pb-editor-hint">Up to 3 short clips (~15s, max 25 MB each). Stored in the cloud so players can watch them.</p>
    </div>
  </div>`;
  }

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
  html += _buildPlayEditorResponsibilitiesSection(play);

  setInnerHTML(body, html);
  overlay.removeAttribute("inert");
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("visible");

  // Wire up the play image controls
  _wirePlayEditorImage(play, isNew);
  _wirePlayEditorClips(play, isNew);

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
  let refreshedScriptRows = 0;
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
    if ("hiddenFromPlayers" in existing) delete existing.hiddenFromPlayers;
    existing.playerAssignments = data.playerAssignments;
    existing.updatedAt = Date.now();
    if (typeof getCurrentAuthUser === "function") {
      const u = getCurrentAuthUser();
      if (u && u.username) existing._lastEditedBy = u.username;
    }
    _syncGamePlanCheckbox(existing);
  } else {
    const newPlay = {};
    _EDITOR_SECTIONS.forEach((section) =>
      section.fields.forEach((field) => {
        newPlay[field.key] = data[field.key] || "";
      }),
    );
    // Copy responsibility fields
    RESP_POSITIONS.forEach((pos) => { newPlay[pos.key] = data[pos.key] || ""; });
    newPlay.respNotes = data.respNotes || "";
    newPlay.playerNotes = data.playerNotes || "";
    newPlay.playerHidden = !!data.playerHidden;
    if (typeof createPlayId === "function") newPlay.id = createPlayId();
    newPlay.createdAt = Date.now();
    if (typeof getCurrentAuthUser === "function") {
      const u = getCurrentAuthUser();
      if (u && u.username) {
        newPlay._createdBy = u.username;
        newPlay._lastEditedBy = u.username;
      }
    }
    if (data.playerAssignments) newPlay.playerAssignments = data.playerAssignments;
    plays.push(newPlay);
    _syncGamePlanCheckbox(newPlay);
    _editingMasterIdx = plays.length - 1;
    showToast("➕ Play added to playbook", { duration: 2000, type: "success" });
  }

  storageManager.setPlaybook(plays);
  const savedPlay = _editingMasterIdx >= 0 ? plays[_editingMasterIdx] : null;
  if (!wasNew && savedPlay && typeof refreshLinkedScriptPlaysFromPlaybook === "function") {
    refreshedScriptRows = refreshLinkedScriptPlaysFromPlaybook(savedPlay);
  }
  if (wasNew && savedPlay) {
    _flushPendingPlayEditorMedia(savedPlay);
  }
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
  if (!wasNew) {
    const scriptNote = refreshedScriptRows
      ? ` · refreshed in ${refreshedScriptRows} script ${refreshedScriptRows === 1 ? "row" : "rows"}`
      : "";
    showToast(`✏️ Play updated${scriptNote}`, { duration: 2200, type: "success" });
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
  storageManager.setPlaybook(plays);
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
  _resetPlayEditorNavigation();
  _resetPendingPlayEditorMedia();
}

// Open editor directly from a play object (e.g. from script row)
function openPlayEditorForPlay(play, options = {}) {
  if (!play) return;
  _resetPendingPlayEditorMedia();
  const scriptIndex = Number.parseInt(options.scriptIndex, 10);
  if (Number.isInteger(scriptIndex) && script?.[scriptIndex] && !script[scriptIndex].isSeparator) {
    _editingScriptNavIndexes = Array.isArray(options.scriptIndexes)
      ? options.scriptIndexes.filter((index) => Number.isInteger(index) && script[index] && !script[index].isSeparator)
      : _getScriptEditorNavigationIndexes();
    _editingScriptNavPosition = _editingScriptNavIndexes.indexOf(scriptIndex);
    if (_editingScriptNavPosition < 0) _resetPlayEditorNavigation();
  } else {
    _resetPlayEditorNavigation();
  }
  const filteredIdx = filteredPlays.findIndex((p) => p === play || playsMatch(p, play));
  _editingFilteredIdx = filteredIdx;
  _editingMasterIdx = filteredIdx >= 0
    ? plays.indexOf(filteredPlays[filteredIdx])
    : plays.findIndex((p) => p === play || playsMatch(p, play));
  _populateEditorForm(_editingMasterIdx >= 0 ? plays[_editingMasterIdx] : play, false);
}

// From inside the play editor — jump to script readiness panel for this play
function openReadinessFromPlayEditor() {
  const play = _editingMasterIdx >= 0 ? plays[_editingMasterIdx] : null;
  if (!play) return;
  const scriptIdx = Array.isArray(script)
    ? script.findIndex((sp) => !sp.isSeparator && playsMatch(sp, play))
    : -1;
  closePlayEditor();
  if (scriptIdx >= 0 && typeof toggleScriptReadinessPanel === "function") {
    if (currentActiveTab !== "script" && typeof showTab === "function") showTab("script");
    setTimeout(() => {
      toggleScriptReadinessPanel(scriptIdx);
      const _si = document.querySelector(`.script-item[data-idx="${scriptIdx}"]`);
      if (_si) scrollElementWithinPanel(_si, { block: "center", behavior: "smooth" });
    }, 150);
  } else if (typeof openPlayReadinessRepModalForPlay === "function") {
    openPlayReadinessRepModalForPlay(play, { source: "editor" });
  } else {
    showToast("This play isn\u2019t in the script yet", { duration: 2500 });
  }
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
  if (nowTagged) {
    // Drop the play straight into the Game Plan "Holding" bucket so it is ready
    // to sort on the Game Plan board — no separate "send to game plan" step.
    if (typeof _gpAddSigsToBox === "function" && typeof _gpPlaySignature === "function"
      && typeof GP_HOLDING_ID !== "undefined") {
      _gpAddSigsToBox([_gpPlaySignature(play)], GP_HOLDING_ID);
    } else {
      showToast(`🎯 Added to game plan vs ${gw.opponentName}`, {
        duration: 1500,
        type: "success",
      });
    }
  } else {
    // Untag → pull the play out of every box on the active board.
    if (typeof _gpUpdateBoard === "function" && typeof _gpPlaySignature === "function") {
      const sig = _gpPlaySignature(play);
      _gpUpdateBoard((board) => {
        Object.keys(board.assignments || {}).forEach((boxId) => {
          board.assignments[boxId] = (board.assignments[boxId] || []).filter(
            (p) => _gpPlaySignature(p) !== sig,
          );
        });
      });
      if (typeof requestRenderGamePlan === "function") requestRenderGamePlan();
    }
    showToast(`Removed from game plan`, { duration: 1500 });
  }
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

function _renderPlayEditorImagePreview(previewEl, url, alt = "Play diagram preview") {
  if (!previewEl || !url) return;
  previewEl.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" data-smart-diagram="true" />`;
  if (window.playImages && typeof window.playImages.hydrateSmartDiagramImages === "function") {
    requestAnimationFrame(() => window.playImages.hydrateSmartDiagramImages(previewEl));
  }
}

function _wirePlayEditorImage(play, isNew) {
  if (typeof window.playImages === "undefined") return;
  const fileInput = document.getElementById("peImageFile");
  const removeBtn = document.getElementById("peImageRemoveBtn");
  const previewEl = document.getElementById("peImagePreview");
  if (!fileInput || !previewEl) return;

  const trigger = previewEl.parentElement.querySelector('button[data-target="peImageFile"]');
  if (isNew) {
    const renderPending = () => {
      if (_pendingPlayEditorImage?.url) {
        _renderPlayEditorImagePreview(previewEl, _pendingPlayEditorImage.url, "Pending play diagram preview");
        if (removeBtn) removeBtn.style.display = "";
        if (trigger) {
          trigger.textContent = "Replace Image…";
          trigger.title = "Image will attach when you save this play.";
        }
      } else {
        previewEl.innerHTML = `<div class="pb-editor-image-placeholder">No image</div>`;
        if (removeBtn) removeBtn.style.display = "none";
        if (trigger) {
          trigger.textContent = "Add Image…";
          trigger.title = "Image will attach when you save this play.";
        }
      }
    };
    renderPending();
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      try {
        previewEl.classList.add("is-loading");
        previewEl.setAttribute("aria-busy", "true");
        previewEl.innerHTML = `<div class="pb-editor-image-placeholder"><strong>Optimizing ${Math.round((file.size || 0) / 1024)} KB image...</strong></div>`;
        if (trigger) trigger.disabled = true;
        const blob = await window.playImages.compress(file, {
          maxDim: 2400,
          quality: 0.92,
        });
        if (_pendingPlayEditorImage?.url) {
          try { URL.revokeObjectURL(_pendingPlayEditorImage.url); } catch (_err) { /* ignore */ }
        }
        _pendingPlayEditorImage = {
          blob,
          sourceFile: file,
          url: URL.createObjectURL(blob),
        };
        previewEl.classList.remove("is-loading");
        previewEl.removeAttribute("aria-busy");
        if (trigger) trigger.disabled = false;
        renderPending();
        showToast("Image ready. Save the play to attach it.", { duration: 2200, type: "success" });
      } catch (err) {
        previewEl.classList.remove("is-loading");
        previewEl.removeAttribute("aria-busy");
        if (trigger) trigger.disabled = false;
        renderPending();
        showToast(err && err.message ? err.message : "Could not prepare that image.", {
          type: "error",
          duration: 4000,
        });
      }
    });
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        if (_pendingPlayEditorImage?.url) {
          try { URL.revokeObjectURL(_pendingPlayEditorImage.url); } catch (_err) { /* ignore */ }
        }
        _pendingPlayEditorImage = null;
        renderPending();
      });
    }
    return;
  }

  const sig = (typeof playSignature === "function") ? playSignature(play) : "";
  if (!sig) return;
  const setImageBusy = (message) => {
    previewEl.classList.add("is-loading");
    previewEl.setAttribute("aria-busy", "true");
    previewEl.innerHTML = `<div class="pb-editor-image-placeholder"><strong>${escapeHtml(message)}</strong></div>`;
    if (trigger) trigger.disabled = true;
    if (removeBtn) removeBtn.disabled = true;
  };
  const clearImageBusy = () => {
    previewEl.classList.remove("is-loading");
    previewEl.removeAttribute("aria-busy");
    if (trigger) trigger.disabled = false;
    if (removeBtn) removeBtn.disabled = false;
  };
  const requestPlaybookRefresh = () => {
    if (typeof requestRenderPlaybook === "function") {
      requestRenderPlaybook();
    } else if (typeof renderPlaybook === "function") {
      renderPlaybook();
    }
  };
  const _refreshPreview = async () => {
    const url = (typeof ensurePlayImageUrl === "function")
      ? await ensurePlayImageUrl(play)
      : ((typeof getPlayImageUrl === "function") ? getPlayImageUrl(play) : null);
    if (url) {
      _renderPlayEditorImagePreview(previewEl, url, "Play diagram preview");
      if (removeBtn) removeBtn.style.display = "";
      if (trigger) trigger.textContent = "Replace Image…";
    } else {
      previewEl.innerHTML = `<div class="pb-editor-image-placeholder">No image</div>`;
      if (removeBtn) removeBtn.style.display = "none";
      if (trigger) trigger.textContent = "Add Image…";
    }
  };
  _refreshPreview();

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    try {
      setImageBusy(`Optimizing ${Math.round((file.size || 0) / 1024)} KB image...`);
      const blob = await window.playImages.compress(file, {
        maxDim: 2400,
        quality: 0.92,
      });
      await window.playImages.set(sig, blob);
      let cloudResult = null;
      if (window.playImages.pushRemote) {
        cloudResult = await window.playImages.pushRemote(play, blob);
      }
      await _refreshPreview();
      clearImageBusy();
      const summary =
        typeof window.playImages.describeCompression === "function"
          ? window.playImages.describeCompression(file, blob)
          : null;
      const suffix = summary
        ? `${summary.dimensions ? `${summary.dimensions} • ` : ""}${summary.outputFormatted}${summary.savedPct ? `, ${summary.savedPct}% smaller` : ""}`
        : `${Math.round(blob.size / 1024)} KB`;
      if (cloudResult && cloudResult.queued) {
        showToast(`Image saved locally and will reach players when this device is online (${suffix})`, {
          duration: 4600, type: "warning",
        });
      } else if (cloudResult && cloudResult.ok === false && !cloudResult.skipped) {
        showToast(
          `Image saved locally, but cloud upload failed: ${cloudResult.error || "Unknown error"}`,
          { duration: 7000, type: "warning" },
        );
      } else if (cloudResult && cloudResult.ok) {
        showToast(`Image saved for players (${suffix})`, {
          duration: 2600, type: "success",
        });
      } else {
        showToast(`Image added (${suffix})`, {
          duration: 2200, type: "success",
        });
      }
      requestPlaybookRefresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Image attach failed:", err);
      clearImageBusy();
      await _refreshPreview();
      showToast(err && err.message ? err.message : "Could not attach that image.", {
        type: "error",
        duration: 4000,
      });
    }
  });

  if (removeBtn) {
    removeBtn.addEventListener("click", async () => {
      const ok = await showConfirm("Remove the image attached to this play?", {
        title: "Remove Image", icon: "🗑️", confirmText: "Remove", danger: true,
      });
      if (!ok) return;
      if (typeof window.deletePlayImage === "function") {
        await window.deletePlayImage(play);
      } else {
        await window.playImages.delete(sig);
      }
      await _refreshPreview();
      showToast("Image removed", { duration: 2000 });
      requestPlaybookRefresh();
    });
  }
}

function _wirePlayEditorClips(play, isNew) {
  if (typeof window.playClips === "undefined") return;
  const listEl = document.getElementById("peClipsList");
  if (!listEl) return;
  const actionsEl = document.getElementById("peClipsActions");
  const countEl = document.getElementById("peClipsCount");
  const fileInput = document.getElementById("peClipFile");
  const canManage = window.playClips.canManage();

  const trigger = actionsEl
    ? actionsEl.querySelector('button[data-target="peClipFile"]')
    : null;

  if (isNew) {
    if (!canManage) {
      listEl.innerHTML = `<div class="pb-editor-clips-empty">Only coaches can add clips.</div>`;
      if (actionsEl) actionsEl.style.display = "none";
      return;
    }
    const renderPendingClips = () => {
      if (countEl) {
        countEl.textContent = _pendingPlayEditorClips.length
          ? `(${_pendingPlayEditorClips.length}/${window.playClips.MAX_CLIPS})`
          : "";
      }
      if (!_pendingPlayEditorClips.length) {
        listEl.innerHTML = `<div class="pb-editor-clips-empty">No clips selected yet.</div>`;
      } else {
        listEl.innerHTML = _pendingPlayEditorClips.map((clip, idx) => `
          <div class="pb-editor-clip" data-pending-clip-idx="${idx}">
            <div class="pb-editor-clip-meta">
              <span class="pb-editor-clip-label">${escapeHtml(clip.label || clip.file.name || "Clip")}</span>
              <span class="pb-editor-clip-sub">${(clip.file.size / (1024 * 1024)).toFixed(1)} MB • uploads when saved</span>
            </div>
            <button type="button" class="btn btn-sm btn-danger pb-editor-clip-remove" data-pending-clip-remove="${idx}">Remove</button>
          </div>
        `).join("");
      }
      if (trigger) {
        const atMax = _pendingPlayEditorClips.length >= window.playClips.MAX_CLIPS;
        trigger.disabled = atMax;
        trigger.textContent = atMax ? "Max 3 clips" : "Add Clip…";
        trigger.title = "Clips will upload when you save this play.";
      }
      listEl.querySelectorAll("[data-pending-clip-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.getAttribute("data-pending-clip-remove"));
          if (Number.isInteger(idx)) _pendingPlayEditorClips.splice(idx, 1);
          renderPendingClips();
        });
      });
    };
    renderPendingClips();
    if (fileInput) {
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (!file) return;
        if (_pendingPlayEditorClips.length >= window.playClips.MAX_CLIPS) {
          showToast(`This play can have up to ${window.playClips.MAX_CLIPS} clips.`, {
            type: "error",
            duration: 3000,
          });
          return;
        }
        const label = await showPrompt("Label this clip (optional):", "", {
          title: "Add Clip",
          icon: "🎬",
          placeholder: "e.g. Form signal",
        });
        if (label === null) return;
        _pendingPlayEditorClips.push({ file, label: String(label || "").trim() });
        renderPendingClips();
        showToast("Clip ready. Save the play to upload it.", { duration: 2200, type: "success" });
      });
    }
    return;
  }

  const sig = window.playClips.sigForPlay(play);
  if (!sig) {
    listEl.innerHTML = `<div class="pb-editor-clips-empty">This play has no stable signature for clips.</div>`;
    if (actionsEl) actionsEl.style.display = "none";
    return;
  }

  const requestPlaybookRefresh = () => {
    if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
    else if (typeof renderPlaybook === "function") renderPlaybook();
  };

  const render = (clips) => {
    const safeClips = Array.isArray(clips) ? clips : [];
    if (countEl) {
      countEl.textContent = safeClips.length
        ? `(${safeClips.length}/${window.playClips.MAX_CLIPS})`
        : "";
    }
    if (!safeClips.length) {
      listEl.innerHTML = `<div class="pb-editor-clips-empty">No clips yet.</div>`;
    } else {
      listEl.innerHTML = safeClips
        .map((clip) => {
          const url = clip.url || window.playClips.fileUrl(play, clip.id);
          const meta = [];
          if (clip.duration) meta.push(`${clip.duration}s`);
          if (clip.size) meta.push(`${(clip.size / (1024 * 1024)).toFixed(1)} MB`);
          return `<div class="pb-editor-clip" data-clip-id="${escapeHtml(clip.id)}">
        <video class="pb-editor-clip-video" autoplay loop muted preload="auto" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback" src="${escapeHtml(url)}"></video>
        <div class="pb-editor-clip-meta">
          <span class="pb-editor-clip-label">${escapeHtml(clip.label || "Clip")}</span>
          <span class="pb-editor-clip-sub">${escapeHtml(meta.join(" • "))}</span>
        </div>
        ${canManage ? `<button type="button" class="btn btn-sm btn-danger pb-editor-clip-remove" data-clip-remove="${escapeHtml(clip.id)}">Remove</button>` : ""}
      </div>`;
        })
        .join("");
    }
    if (trigger) {
      const atMax = safeClips.length >= window.playClips.MAX_CLIPS;
      trigger.disabled = atMax;
      trigger.textContent = atMax ? "Max 3 clips" : "Add Clip…";
    }
    if (typeof window.playClips?.configureLoopPreviewVideo === "function") {
      listEl.querySelectorAll(".pb-editor-clip-video").forEach((video) => {
        window.playClips.configureLoopPreviewVideo(video);
      });
    }
    if (canManage) {
      listEl.querySelectorAll("[data-clip-remove]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-clip-remove");
          const ok = await showConfirm("Remove this clip for everyone?", {
            title: "Remove Clip",
            icon: "🗑️",
            confirmText: "Remove",
            danger: true,
          });
          if (!ok) return;
          try {
            btn.disabled = true;
            const res = await window.playClips.remove(play, id);
            render(res.clips || []);
            showToast("Clip removed", { duration: 1800 });
            requestPlaybookRefresh();
          } catch (err) {
            btn.disabled = false;
            showToast(err && err.message ? err.message : "Could not remove clip.", {
              type: "error",
              duration: 4000,
            });
          }
        });
      });
    }
  };

  (async () => {
    let clips = [];
    try {
      clips = await window.playClips.list(play);
    } catch (_err) {
      clips = [];
    }
    render(clips);
  })();

  if (canManage && fileInput) {
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      const label = await showPrompt("Label this clip (optional):", "", {
        title: "Add Clip",
        icon: "🎬",
        placeholder: "e.g. vs Cover 3",
      });
      if (label === null) return;
      try {
        if (trigger) {
          trigger.disabled = true;
          trigger.textContent = "Uploading…";
        }
        await window.playClips.upload(play, file, label);
        render(await window.playClips.list(play));
        showToast("Clip uploaded", { duration: 2000, type: "success" });
        requestPlaybookRefresh();
      } catch (err) {
        if (trigger) {
          trigger.disabled = false;
          trigger.textContent = "Add Clip…";
        }
        showToast(err && err.message ? err.message : "Upload failed.", {
          type: "error",
          duration: 4500,
        });
      }
    });
  }
}

function _flushPendingPlayEditorMedia(play) {
  const tasks = [];
  if (_pendingPlayEditorImage?.blob && typeof window.playImages !== "undefined") {
    const imageBlob = _pendingPlayEditorImage.blob;
    tasks.push((async () => {
      const sig = (typeof playSignature === "function") ? playSignature(play) : "";
      if (!sig) throw new Error("Image could not attach because this play has no stable signature.");
      await window.playImages.set(sig, imageBlob);
      if (window.playImages.pushRemote) {
        const cloudResult = await window.playImages.pushRemote(play, imageBlob);
        if (cloudResult && cloudResult.ok === false && !cloudResult.skipped) {
          throw new Error(`Image saved locally, but cloud upload failed: ${cloudResult.error || "Unknown error"}`);
        }
      }
    })());
  }
  if (_pendingPlayEditorClips.length && typeof window.playClips !== "undefined") {
    _pendingPlayEditorClips.forEach((clip) => {
      tasks.push(window.playClips.upload(play, clip.file, clip.label));
    });
  }
  if (!tasks.length) return;
  Promise.allSettled(tasks).then((results) => {
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length) {
      const first = failed[0].reason;
      showToast(first && first.message ? first.message : "Some media could not attach.", {
        type: "warning",
        duration: 7000,
      });
    } else {
      showToast("Media attached to new play", { type: "success", duration: 2400 });
    }
    if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
    else if (typeof renderPlaybook === "function") renderPlaybook();
  });
}

function playEditorPrev() {
  if (_hasScriptEditorNavigation()) {
    if (_editingScriptNavPosition <= 0) return;
    _autoSaveCurrentEditorFields();
    const nextPosition = _editingScriptNavPosition - 1;
    const scriptIndex = _editingScriptNavIndexes[nextPosition];
    const scriptPlay = script?.[scriptIndex];
    if (!scriptPlay || scriptPlay.isSeparator) return;
    openPlayEditorForPlay(scriptPlay, {
      scriptIndex,
      scriptIndexes: _editingScriptNavIndexes,
    });
    return;
  }
  if (_editingFilteredIdx <= 0) return;
  _autoSaveCurrentEditorFields();
  openPlayEditor(_editingFilteredIdx - 1);
}

function playEditorNext() {
  if (_hasScriptEditorNavigation()) {
    if (_editingScriptNavPosition >= _editingScriptNavIndexes.length - 1) return;
    _autoSaveCurrentEditorFields();
    const nextPosition = _editingScriptNavPosition + 1;
    const scriptIndex = _editingScriptNavIndexes[nextPosition];
    const scriptPlay = script?.[scriptIndex];
    if (!scriptPlay || scriptPlay.isSeparator) return;
    openPlayEditorForPlay(scriptPlay, {
      scriptIndex,
      scriptIndexes: _editingScriptNavIndexes,
    });
    return;
  }
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
    storageManager.setPlaybook(plays);
    if (typeof refreshLinkedScriptPlaysFromPlaybook === "function") {
      refreshLinkedScriptPlaysFromPlaybook(existing);
    }
    invalidateFilterCache();
  }
  _syncGamePlanCheckbox(existing);
}
