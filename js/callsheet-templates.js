// ============================================================
// callsheet-templates.js — call sheet template management
//
// Owns: `getBuiltInCallSheetTemplates`, `getCallSheetPlayCount`,
// `buildCallSheetPayload`, `buildCallSheetTemplate`, `saveCallSheetTemplate`,
// `openLoadCallSheetModal`, `openTemplatesModal`, `closeTemplateModal`,
// `loadTemplate`, `loadBuiltInCallSheetTemplate`, `applyCallSheetTemplate`,
// `deleteTemplate`.
//
// Loaded after callsheet.js.
// ============================================================

// ============ Call Sheet Templates ============

function getBuiltInCallSheetTemplates() {
  const categories = safeDeepClone(CS_SEVEN_ON_SEVEN_CATEGORIES);
  const categoryIds = categories.map((cat) => cat.id);
  const callSheetData = Object.fromEntries(
    categoryIds.map((id) => [id, { left: [], right: [] }]),
  );
  const standardCategoryIds = [
    ...BASE_CALLSHEET_FRONT.map((cat) => cat.id),
    ...BASE_CALLSHEET_BACK.map((cat) => cat.id),
  ];
  const standardCallSheetData = Object.fromEntries(
    standardCategoryIds.map((id) => [id, { left: [], right: [] }]),
  );

  return [
    {
      id: CS_SEVEN_ON_SEVEN_TEMPLATE_ID,
      name: "7-on-7 Passing Sheet",
      builtIn: true,
      description:
        "Tournament downs, player touches, coverage beaters, wristband passes, and conversion calls.",
      includePlays: false,
      templateKind: "structure",
      playCount: 0,
      categoryCount: categories.length,
      callSheet: callSheetData,
      settings: {
        ...getDefaultCallSheetSettings(),
        orientation: "landscape",
        currentPage: "front",
        customCategories: { front: categories, back: [] },
        hiddenCategoryIds: [
          ...BASE_CALLSHEET_FRONT.map((cat) => cat.id),
          ...BASE_CALLSHEET_BACK.map((cat) => cat.id),
        ],
        allowedPlayTypes: [...CS_PASSING_PLAY_TYPES],
        wristbandAutoCategoryId: "cs-7on7-wristband-passes",
      },
      notes: Object.fromEntries(
        categories.map((cat) => [cat.id, cat.note || ""]),
      ),
      targets: Object.fromEntries(
        categories.map((cat) => [cat.id, cat.target || 0]),
      ),
      categoryOrder: { front: categoryIds, back: [] },
      collapsed: [],
      printOptions: {
        paperSize: "letter",
        orientation: "landscape",
        pages: "front",
        columns: 4,
        margin: "tight",
      },
    },
    {
      id: "builtin-standard-callsheet",
      name: "Standard Call Sheet",
      builtIn: true,
      description:
        "Restore the normal front-and-back situational and play-type buckets.",
      includePlays: false,
      templateKind: "structure",
      playCount: 0,
      categoryCount: standardCategoryIds.length,
      callSheet: standardCallSheetData,
      settings: getDefaultCallSheetSettings(),
      notes: {},
      targets: {},
      categoryOrder: {
        front: BASE_CALLSHEET_FRONT.map((cat) => cat.id),
        back: BASE_CALLSHEET_BACK.map((cat) => cat.id),
      },
      collapsed: [],
      printOptions: {
        paperSize: "letter",
        orientation: "portrait",
        pages: "both",
        columns: 3,
        margin: "normal",
      },
    },
  ];
}

function getCallSheetPlayCount() {
  let playCount = 0;
  CALLSHEET_CATEGORIES.forEach((cat) => {
    const data = callSheet[cat.id];
    if (!data) return;
    playCount += (data.left || []).length + (data.right || []).length;
  });
  return playCount;
}

function buildCallSheetPayload(includePlays = true) {
  if (includePlays) return safeDeepClone(callSheet);
  const structure = {};
  CALLSHEET_CATEGORIES.forEach((cat) => {
    const current = callSheet[cat.id] || {};
    structure[cat.id] = {
      left: [],
      right: [],
      ...(current.customName ? { customName: current.customName } : {}),
    };
  });
  return structure;
}

function buildCallSheetTemplate(name, options = {}) {
  const includePlays = options.includePlays !== false;
  return {
    id: String(options.id || (typeof createPlayId === "function" ? createPlayId("callsheet") : `callsheet-${Date.now()}`)),
    name,
    includePlays,
    templateKind: includePlays ? "full" : "structure",
    savedAt: new Date().toISOString(),
    playCount: includePlays ? getCallSheetPlayCount() : 0,
    callSheet: buildCallSheetPayload(includePlays),
    settings: safeDeepClone(callSheetSettings),
    notes: safeDeepClone(csNotes),
    targets: safeDeepClone(csTargets),
    categoryOrder: safeDeepClone(csCategoryOrder),
    displayState: captureCallSheetDisplayState(),
    collapsed: [...csCollapsed],
    printOptions: getCallSheetPrintOptions(),
  };
}

function getCurrentCallSheetSaveTarget(templates) {
  const activeId = String(callSheetSettings?.activeSavedCallSheetId || "");
  const activeName = String(callSheetSettings?.activeSavedCallSheetName || "").trim();
  const byId = templates.find((template) => String(template?.id || "") === activeId);
  if (byId) return byId;
  const nameMatches = templates.filter((template) => activeName && String(template?.name || "").trim().toLowerCase() === activeName.toLowerCase());
  return nameMatches.length === 1 ? nameMatches[0] : null;
}

function hasAmbiguousCurrentCallSheetName(templates) {
  const activeId = String(callSheetSettings?.activeSavedCallSheetId || "");
  const activeName = String(callSheetSettings?.activeSavedCallSheetName || "").trim().toLowerCase();
  return !activeId && Boolean(activeName) && templates.filter((template) =>
    String(template?.name || "").trim().toLowerCase() === activeName,
  ).length > 1;
}

function setCurrentCallSheetSaveTarget(template) {
  callSheetSettings.activeSavedCallSheetId = String(template?.id || "");
  callSheetSettings.activeSavedCallSheetName = String(template?.name || "").trim();
  saveCallSheetSettings();
}

function clearCurrentCallSheetSaveTarget() {
  callSheetSettings.activeSavedCallSheetId = "";
  callSheetSettings.activeSavedCallSheetName = "";
  saveCallSheetSettings();
}

function saveCurrentCallSheet() {
  try {
    // Persist the working state first; the library snapshot is an additional
    // recovery point and should never gate a coach's ordinary Save action.
    saveCallSheet();
    const templates = storageManager.get(STORAGE_KEYS.CALLSHEET_TEMPLATES, []);
    if (hasAmbiguousCurrentCallSheetName(templates)) {
      showToast("⚠️ More than one saved call sheet has this name. Load the intended sheet before saving.", { type: "warning", duration: 5000 });
      return false;
    }
    const existing = getCurrentCallSheetSaveTarget(templates);
    const defaultName = `Call Sheet ${new Date().toLocaleDateString()}`;
    const name = String(existing?.name || callSheetSettings?.activeSavedCallSheetName || defaultName).trim() || defaultName;
    const id = String(existing?.id || callSheetSettings?.activeSavedCallSheetId || (typeof createPlayId === "function" ? createPlayId("callsheet") : `callsheet-${Date.now()}`));

    const replacement = buildCallSheetTemplate(name, { includePlays: true, id });
    if (existing) Object.assign(existing, replacement);
    else templates.unshift(replacement);
    storageManager.set(STORAGE_KEYS.CALLSHEET_TEMPLATES, templates);
    setCurrentCallSheetSaveTarget(replacement);
    showToast(`💾 Saved ${name}`);
    return true;
  } catch (err) {
    console.error("saveCurrentCallSheet error:", err);
    showToast("❌ Current call sheet could not be saved.", { duration: 4000, type: "error" });
    return false;
  }
}

async function saveCallSheetTemplate() {
  try {
    const totalPlays = getCallSheetPlayCount();
    let includePlays = true;
    if (totalPlays > 0) {
      const contentChoice = await showChoice(
        "Save the full call sheet with plays, or save only the reusable structure?",
        {
          title: "Template Contents",
          icon: "📁",
          option1: "Full sheet",
          option2: "Structure only",
        },
      );
      if (!contentChoice) return;
      includePlays = contentChoice === "option1";
    } else {
      const proceed = await showConfirm("The call sheet is empty. Save anyway?", {
        title: "Empty Call Sheet",
        icon: "⚠️",
        confirmText: "Save Structure",
      });
      if (!proceed) return;
      includePlays = false;
    }

    const nameInput = document.getElementById("csTemplateName");
    const defaultName = `Call Sheet ${new Date().toLocaleDateString()}`;
    let name = nameInput?.value.trim();

    if (!name) {
      name = await showPrompt("Name for this call sheet:", defaultName, {
        title: "Save Call Sheet",
        icon: "💾",
        placeholder: defaultName,
      });
      if (!name) return;
      name = name.trim();
    }

    if (!name) {
      showToast("⚠️ Enter a template name", { type: "warning" });
      return;
    }

    const templates = storageManager.get(STORAGE_KEYS.CALLSHEET_TEMPLATES, []);
    const existing = templates.find(
      (template) => template.name.toLowerCase() === name.toLowerCase(),
    );

    if (existing) {
      const choice = await showChoice(
        `A call sheet named "${existing.name}" already exists.`,
        {
          title: "Duplicate Name",
          icon: "⚠️",
          option1: "💾 Overwrite",
          option2: "➕ Save as Copy",
        },
      );

      if (choice === "option1") {
        const replacement = buildCallSheetTemplate(name, { includePlays, id: existing.id });
        Object.assign(existing, replacement);
        storageManager.set(STORAGE_KEYS.CALLSHEET_TEMPLATES, templates);
        if (includePlays) setCurrentCallSheetSaveTarget(existing);
        if (document.getElementById("csTemplateOverlay")) {
          closeTemplateModal();
          openTemplatesModal();
        }
        showToast(`✅ "${name}" updated!`);
        return;
      }

      if (choice !== "option2") {
        return;
      }
    }

    const created = buildCallSheetTemplate(name, { includePlays });
    templates.unshift(created);
    storageManager.set(STORAGE_KEYS.CALLSHEET_TEMPLATES, templates);
    if (includePlays) setCurrentCallSheetSaveTarget(created);

    if (document.getElementById("csTemplateOverlay")) {
      closeTemplateModal();
      openTemplatesModal(csTemplateModalMode);
    }

    showToast(`✅ "${name}" saved as ${includePlays ? "full sheet" : "structure"}!`);
  } catch (err) {
    console.error("saveCallSheetTemplate error:", err);
    showToast("❌ Error saving call sheet.", {
      duration: 4000,
      type: "error",
    });
  }
}

let csTemplateModalMode = "manage";

function openLoadCallSheetModal() {
  openTemplatesModal("load");
}

function openTemplatesModal(mode = "manage") {
  csTemplateModalMode =
    mode === "load" ? "load" : mode === "save" ? "save" : "manage";
  const builtIn = getBuiltInCallSheetTemplates();
  const saved = storageManager.get(STORAGE_KEYS.CALLSHEET_TEMPLATES, []);
  const isLoadMode = csTemplateModalMode === "load";
  const title = isLoadMode ? "📂 Load Call Sheet" : "📁 Saved Call Sheets";
  const modalCopy = isLoadMode
    ? "Choose a built-in or saved call sheet template to replace the current one."
    : "Start from a built-in template, or save the current call sheet as a reusable template.";

  const builtInHtml = builtIn
    .map(
      (template) => `<div class="cs-template-item">
        <div class="cs-template-info">
          <strong>${escapeHtml(template.name)}</strong>
          <span class="cs-template-date">Built-in · Structure only · ${template.categoryCount || 0} buckets</span>
          <span class="cs-template-copy">${escapeHtml(template.description || "")}</span>
        </div>
        <div class="cs-template-actions">
          <button class="btn btn-sm btn-primary" data-action="loadBuiltInCallSheetTemplate" data-arg="${escapeHtml(template.id)}">Load Template</button>
        </div>
      </div>`,
    )
    .join("");

  const listHtml =
    saved.length === 0
      ? `<div class="empty-state cs-template-empty">${isLoadMode ? "No saved call sheets yet. Save the current sheet first, then load it here later." : "No saved call sheets yet. Save the current sheet to build your library."}</div>`
      : saved
        .map((t, idx) => {
          const date = new Date(t.savedAt).toLocaleDateString();
          const isStructure = t.includePlays === false || t.templateKind === "structure";
          const kind = isStructure ? "Structure only" : "Full sheet";
          return `<div class="cs-template-item">
          <div class="cs-template-info">
            <strong>${escapeHtml(t.name)}</strong>
            <span class="cs-template-date">${date} · ${escapeHtml(kind)} · ${t.playCount || 0} plays</span>
          </div>
          <div class="cs-template-actions">
            <button class="btn btn-sm btn-primary" data-action="loadTemplate" data-idx="${idx}">${isLoadMode ? `Load ${isStructure ? "Structure" : "Call Sheet"}` : "Load"}</button>
            <button class="btn btn-sm btn-danger" data-action="deleteTemplate" data-idx="${idx}">Delete</button>
          </div>
        </div>`;
        })
        .join("");

  const modalHtml = `
    <div id="csTemplateOverlay" class="cs-sort-overlay">
      <div class="cs-sort-modal cs-sort-modal-lg cs-template-modal" role="dialog" aria-modal="true" aria-labelledby="csTemplateTitle">
        <div class="cs-sort-header">
          <div>
            <h3 id="csTemplateTitle">${title}</h3>
            <p class="cs-template-copy">${modalCopy}</p>
          </div>
          <button class="cs-sort-close" data-action="closeTemplateModal" aria-label="Close call sheet templates modal">&times;</button>
        </div>
        <div class="cs-sort-body">
          <div class="cs-template-section-head">
            <div>
              <h4>Built-In Templates</h4>
              <p>Ready-made structures with matching and print defaults.</p>
            </div>
          </div>
          <div class="cs-template-list">${builtInHtml}</div>
          <div class="cs-template-section-head">
            <div>
              <h4>Saved Call Sheets</h4>
              <p>${saved.length === 0 ? "No saved call sheets yet." : `${saved.length} saved call sheet${saved.length === 1 ? "" : "s"} available.`}</p>
            </div>
            ${saved.length > 0 && isLoadMode ? '<button class="btn btn-sm" data-action="openTemplatesModal" data-arg="manage">Manage Saves</button>' : ""}
          </div>
          <div class="cs-template-list">${listHtml}</div>
          <div class="cs-template-save-panel">
            <div class="cs-template-section-head">
              <div>
                <h4>Save Current Call Sheet</h4>
                <p>Create a full saved sheet or a structure-only template with layout, notes, targets, and display setup.</p>
              </div>
            </div>
            <div class="cs-template-save-row">
              <label class="sr-only" for="csTemplateName">Call sheet name</label>
              <input type="text" id="csTemplateName" name="callSheetName" class="cs-template-name-input" placeholder="Call sheet name (e.g. vs. 4-3 Team)">
              <button class="btn btn-sm btn-primary" data-action="saveCallSheetTemplate">💾 Save Current</button>
            </div>
          </div>
        </div>
        <div class="cs-sort-actions">
          <button class="btn btn-sm" data-action="closeTemplateModal">Close</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  const nameInput = document.getElementById("csTemplateName");
  if (nameInput && csTemplateModalMode === "save") {
    nameInput.focus();
    nameInput.select();
  }
  // backdrop close
  document
    .getElementById("csTemplateOverlay")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "csTemplateOverlay") closeTemplateModal();
    });
  const overlay = document.getElementById("csTemplateOverlay");
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "csTemplateOverlay",
      scrollElement: overlay.querySelector(".cs-sort-modal") || overlay,
      blocking: true,
      onEscape: () => closeTemplateModal(),
    });
  }
}

function closeTemplateModal(options = {}) {
  const overlay = document.getElementById("csTemplateOverlay");
  if (typeof closeLayer === "function") closeLayer("csTemplateOverlay", options);
  overlay?.remove();
}

async function loadTemplate(idx) {
  try {
    const templates = storageManager.get(STORAGE_KEYS.CALLSHEET_TEMPLATES, []);
    const template = templates[idx];
    if (!template) return;
    await applyCallSheetTemplate(template);
  } catch (err) {
    console.error("loadTemplate error:", err);
    showToast("❌ Error loading template.", { duration: 4000, type: "error" });
  }
}

async function loadBuiltInCallSheetTemplate(templateId) {
  try {
    const template = getBuiltInCallSheetTemplates().find(
      (item) => item.id === templateId,
    );
    if (!template) return;
    await applyCallSheetTemplate(template);
  } catch (err) {
    console.error("loadBuiltInCallSheetTemplate error:", err);
    showToast("❌ Error loading built-in template.", {
      duration: 4000,
      type: "error",
    });
  }
}

async function applyCallSheetTemplate(template) {
  const isStructure =
    template.includePlays === false || template.templateKind === "structure";
  const preservedWristband = template.builtIn
    ? {
      name: callSheetSettings.loadedWristbandName || "",
      plays: safeDeepClone(callSheetSettings.loadedWristbandPlays || []),
    }
    : null;

  try {
    const ok = await showConfirm(
      `Load "${template.name}"? This will replace your current call sheet${isStructure ? " with an empty structure template." : "."}`,
      { title: "Load Template", icon: "📁", confirmText: isStructure ? "Load Structure" : "Load" },
    );
    if (!ok) return;

    callSheet = safeDeepClone(template.callSheet || {});
    callSheetSettings = normalizeCallSheetSettings({
      ...getDefaultCallSheetSettings(),
      ...safeDeepClone(template.settings || {}),
    });
    callSheetSettings.activeSavedCallSheetId = template.builtIn ? "" : String(template.id || "");
    callSheetSettings.activeSavedCallSheetName = template.builtIn ? "" : String(template.name || "").trim();
    if (preservedWristband?.plays.length) {
      callSheetSettings.loadedWristbandName = preservedWristband.name;
      callSheetSettings.loadedWristbandPlays = preservedWristband.plays;
    }
    rebuildCallSheetCategoryRegistry();
    syncCallSheetCategoryData();
    csNotes =
      template.notes && typeof template.notes === "object"
        ? safeDeepClone(template.notes)
        : {};
    csTargets =
      template.targets && typeof template.targets === "object"
        ? safeDeepClone(template.targets)
        : {};
    csCategoryOrder = normalizeCallSheetCategoryOrder(template.categoryOrder);
    csCollapsed = new Set(Array.isArray(template.collapsed) ? template.collapsed : []);

    if (template.displayState) {
      applyCallSheetDisplayState(template.displayState);
      storageManager.set(
        STORAGE_KEYS.CALLSHEET_DISPLAY_OPTIONS,
        template.displayState,
      );
    } else {
      saveCallSheetDisplayOptions();
    }
    if (template.printOptions) {
      setCallSheetPrintOptions(template.printOptions);
    }

    const wristbandSynced =
      typeof syncLoadedWristbandToCallSheetCategory === "function"
        ? syncLoadedWristbandToCallSheetCategory()
        : 0;

    resetCallSheetHistoryBaseline();
    saveCallSheet();
    saveCallSheetSettings();
    storageManager.set(STORAGE_KEYS.CALLSHEET_NOTES, csNotes);
    storageManager.set(STORAGE_KEYS.CALLSHEET_TARGETS, csTargets);
    storageManager.set(STORAGE_KEYS.CALLSHEET_CATEGORY_ORDER, csCategoryOrder);
    storageManager.set(STORAGE_KEYS.CALLSHEET_COLLAPSED, [...csCollapsed]);

    renderCallSheet();
    closeTemplateModal();
    showToast(
      `📁 Loaded ${isStructure ? "structure" : "call sheet"} "${template.name}"` +
      (wristbandSynced > 0 ? ` · synced ${wristbandSynced} wristband passes` : ""),
    );
  } catch (err) {
    console.error("applyCallSheetTemplate error:", err);
    throw err;
  }
}

async function deleteTemplate(idx) {
  const templates = storageManager.get(STORAGE_KEYS.CALLSHEET_TEMPLATES, []);
  const template = templates[idx];
  const name = template?.name || "template";
  const ok = await showConfirm(`Delete "${name}"?`, {
    title: "Delete Template",
    icon: "🗑️",
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;

  templates.splice(idx, 1);
  storageManager.set(STORAGE_KEYS.CALLSHEET_TEMPLATES, templates);
  if (String(template?.id || "") === String(callSheetSettings.activeSavedCallSheetId || "")) {
    clearCurrentCallSheetSaveTarget();
  }
  closeTemplateModal();
  openTemplatesModal(csTemplateModalMode);
  showToast(`🗑️ Deleted "${name}"`);
}
