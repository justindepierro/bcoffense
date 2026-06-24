// ============ Installation Tracker ============
// Tracks which offensive components have been installed (taught/repped)
// and provides a readiness rating for each play

/**
 * Component categories that map to play object fields
 * Each play is rated on up to 10 of these components
 */
const INSTALL_CATEGORIES = [
  { id: "personnel", label: "Personnel", icon: "👥", field: "personnel" },
  { id: "formation", label: "Formations", icon: "📐", field: "formation" },
  { id: "motion", label: "Motions", icon: "➡️", field: "motion" },
  { id: "shift", label: "Shifts", icon: "↔️", field: "shift" },
  { id: "protection", label: "Protections", icon: "🛡️", field: "protection" },
  { id: "basePlay", label: "Concepts", icon: "🧠", field: "basePlay" },
  { id: "tempo", label: "Tempos", icon: "⏱️", field: "tempo" },
  { id: "back", label: "Backfield", icon: "🏃", field: "back" },
  { id: "play", label: "Plays", icon: "🏈", field: "play" },
  { id: "formTag", label: "Form Tags", icon: "🏷️", field: "formTag" },
];

// ============ Data Management ============

/**
 * Load installation data from localStorage
 * Caches the result to avoid re-parsing on every per-play call.
 * @returns {{ installed: Object<string, string[]>, order: Object<string, string[]> }}
 */
let _installDataCache = null;
function getInstallationData() {
  try {
    if (_installDataCache) return _installDataCache;
    _installDataCache = storageManager.get(STORAGE_KEYS.INSTALLATION, {
      installed: {},
      order: {},
    });
    return _installDataCache;
  } catch (err) {
    console.error("getInstallationData error:", err);
    return { installed: {}, order: {} };
  }
}

/**
 * Save installation data to localStorage
 */
function saveInstallationData(data) {
  _installDataCache = null; // invalidate cache
  storageManager.set(STORAGE_KEYS.INSTALLATION, data);
}

const INSTALLATION_TEMPLATES_KEY = STORAGE_KEYS.INSTALLATION_TEMPLATES;

function _normalizeInstallValueList(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function normalizeInstallationDataRecord(data) {
  const source = data && typeof data === "object" ? data : {};
  const installed = {};
  const order = {};

  INSTALL_CATEGORIES.forEach((cat) => {
    installed[cat.id] = _normalizeInstallValueList(
      source.installed?.[cat.id],
    );
    const orderedValues = _normalizeInstallValueList(source.order?.[cat.id]);
    if (orderedValues.length > 0) {
      order[cat.id] = orderedValues;
    }
  });

  return { installed, order };
}

function _countInstalledComponents(installed) {
  return Object.values(installed || {}).reduce(
    (sum, values) => sum + (Array.isArray(values) ? values.length : 0),
    0,
  );
}

function _countInstalledCategories(installed) {
  return Object.values(installed || {}).filter(
    (values) => Array.isArray(values) && values.length > 0,
  ).length;
}

function normalizeInstallationTemplateRecord(record, index = 0) {
  const source = record && typeof record === "object" ? record : {};
  const data = normalizeInstallationDataRecord(source);
  const componentCount = _countInstalledComponents(data.installed);
  const categoryCount = _countInstalledCategories(data.installed);

  return {
    id: source.id ?? `install-template-${Date.now()}-${index}`,
    name: String(source.name || `Installation Template ${index + 1}`),
    savedAt: source.savedAt || "",
    templateKind: "installation",
    componentCount: Number(source.componentCount || componentCount) || componentCount,
    categoryCount: Number(source.categoryCount || categoryCount) || categoryCount,
    installed: data.installed,
    order: data.order,
    smartBasePlays: Boolean(source.smartBasePlays),
  };
}

function getInstallationTemplates() {
  const stored = storageManager.get(INSTALLATION_TEMPLATES_KEY, []);
  const rawTemplates = Array.isArray(stored)
    ? stored
    : stored && typeof stored === "object"
      ? Object.values(stored)
      : [];
  const templates = rawTemplates.map((record, index) =>
    normalizeInstallationTemplateRecord(record, index),
  );
  const needsRepair =
    !Array.isArray(stored) ||
    rawTemplates.some(
      (record) =>
        !record ||
        typeof record !== "object" ||
        !record.id ||
        !record.name ||
        !record.installed,
    );

  if (needsRepair) {
    storageManager.set(INSTALLATION_TEMPLATES_KEY, templates);
  }

  return templates;
}

function _saveInstallationTemplates(templates) {
  storageManager.set(
    INSTALLATION_TEMPLATES_KEY,
    Array.isArray(templates) ? templates : [],
  );
}

function _buildInstallationTemplate(name) {
  const data = normalizeInstallationDataRecord(getInstallationData());
  return {
    id: `install-template-${Date.now()}`,
    name: name.trim(),
    savedAt: new Date().toISOString(),
    templateKind: "installation",
    componentCount: _countInstalledComponents(data.installed),
    categoryCount: _countInstalledCategories(data.installed),
    installed: safeDeepClone(data.installed),
    order: safeDeepClone(data.order),
    smartBasePlays: Boolean(installSmartBasePlays),
  };
}

function _installationTemplateMeta(template) {
  const savedTime = template.savedAt
    ? new Date(template.savedAt).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    : "Unknown date";

  return {
    savedTime,
    componentText: `${template.componentCount || 0} installed component${(template.componentCount || 0) === 1 ? "" : "s"}`,
    categoryText: `${template.categoryCount || 0} categor${(template.categoryCount || 0) === 1 ? "y" : "ies"}`,
  };
}

async function saveInstallationTemplate() {
  try {
    const current = normalizeInstallationDataRecord(getInstallationData());
    const componentCount = _countInstalledComponents(current.installed);
    if (componentCount === 0) {
      const ok = await showConfirm(
        "No components are currently marked installed. Save an empty installation template?",
        {
          title: "Empty Installation Template",
          icon: "📦",
          confirmText: "Save Empty",
        },
      );
      if (!ok) return;
    }

    const name = await showPrompt(
      "Name this installation template:",
      `Installation Template ${new Date().toLocaleDateString()}`,
      {
        title: "Save Installation Template",
        icon: "📦",
        placeholder: "e.g. Week 1 base install, Spring install",
      },
    );
    if (!name || !name.trim()) return;

    const templates = getInstallationTemplates();
    const nextTemplate = _buildInstallationTemplate(name);
    const existingIdx = templates.findIndex(
      (template) =>
        String(template.name || "").toLowerCase() ===
        nextTemplate.name.toLowerCase(),
    );

    if (existingIdx >= 0) {
      const ok = await showConfirm(
        `Replace existing template <strong>${escapeHtml(templates[existingIdx].name)}</strong>?`,
        {
          title: "Replace Template",
          icon: "📦",
          confirmText: "Replace",
          danger: true,
        },
      );
      if (!ok) return;
      nextTemplate.id = templates[existingIdx].id || nextTemplate.id;
      templates.splice(existingIdx, 1, nextTemplate);
    } else {
      templates.unshift(nextTemplate);
    }

    _saveInstallationTemplates(templates);
    showToast(`Saved installation template "${nextTemplate.name}"`, {
      type: "success",
    });
  } catch (err) {
    console.error("saveInstallationTemplate error:", err);
    showToast("❌ Error saving installation template.", {
      duration: 4000,
      type: "error",
    });
  }
}

async function openInstallationTemplatesMenu() {
  const templates = getInstallationTemplates();
  if (templates.length === 0) {
    showToast("No installation templates yet. Use Template to save one.", {
      type: "info",
      duration: 3500,
    });
    return;
  }

  const choice = await showListPicker(
    "Pick a reusable installation template:",
    templates.map((template) => {
      const meta = _installationTemplateMeta(template);
      return {
        value: String(template.id),
        label: template.name || "Untitled Template",
        sublabel: `${meta.componentText} • ${meta.categoryText}`,
        meta: meta.savedTime,
        badge: "Install",
      };
    }),
    { title: "📦 Installation Templates", icon: "📦" },
  );
  if (!choice) return;

  const action = await showListPicker(
    "Choose what to do with this template:",
    [
      {
        value: "merge",
        label: "Apply to current tracker",
        sublabel: "Adds installed components and keeps current progress",
        badge: "Merge",
      },
      {
        value: "replace",
        label: "Replace current tracker",
        sublabel: "Uses the template as the full installation state",
        badge: "Replace",
      },
      {
        value: "delete",
        label: "Delete template",
        sublabel: "Removes this saved installation template",
        badge: "Delete",
      },
    ],
    { title: "Installation Template", icon: "📦" },
  );
  if (!action) return;

  if (action === "delete") await _deleteInstallationTemplate(choice);
  else await _loadInstallationTemplate(choice, action);
}

function _mergeInstallationTemplateData(template) {
  const current = normalizeInstallationDataRecord(getInstallationData());
  const incoming = normalizeInstallationDataRecord(template);
  const next = normalizeInstallationDataRecord(current);

  INSTALL_CATEGORIES.forEach((cat) => {
    next.installed[cat.id] = Array.from(
      new Set([
        ...(next.installed[cat.id] || []),
        ...(incoming.installed[cat.id] || []),
      ]),
    );
    const mergedOrder = Array.from(
      new Set([
        ...(incoming.order[cat.id] || []),
        ...(next.order[cat.id] || []),
      ]),
    );
    if (mergedOrder.length > 0) next.order[cat.id] = mergedOrder;
  });

  return next;
}

function _refreshInstallationTemplateViews() {
  renderInstallation();
  if (typeof renderPlaybook === "function") {
    renderPlaybook();
  }
}

async function _loadInstallationTemplate(templateId, mode = "merge") {
  const templates = getInstallationTemplates();
  const template = templates.find(
    (item) => String(item.id) === String(templateId),
  );
  if (!template) return;

  const isReplace = mode === "replace";
  const actionText = isReplace ? "replace the current tracker" : "apply to the current tracker";
  const ok = await showConfirm(
    `Load <strong>${escapeHtml(template.name)}</strong> and ${actionText}?`,
    {
      title: "Load Installation Template",
      icon: "📦",
      confirmText: isReplace ? "Replace" : "Apply",
      danger: isReplace,
    },
  );
  if (!ok) return;

  const nextData = isReplace
    ? normalizeInstallationDataRecord(template)
    : _mergeInstallationTemplateData(template);
  saveInstallationData(nextData);
  if (isReplace) {
    installSmartBasePlays = Boolean(template.smartBasePlays);
  }
  _refreshInstallationTemplateViews();
  showToast(
    `${isReplace ? "Loaded" : "Applied"} installation template "${template.name}"`,
    { type: "success" },
  );
}

async function _deleteInstallationTemplate(templateId) {
  const templates = getInstallationTemplates();
  const template = templates.find(
    (item) => String(item.id) === String(templateId),
  );
  if (!template) return;
  const ok = await showConfirm(
    `Delete template <strong>${escapeHtml(template.name)}</strong>?`,
    {
      title: "Delete Template",
      icon: "🗑️",
      confirmText: "Delete",
      danger: true,
    },
  );
  if (!ok) return;

  _saveInstallationTemplates(
    templates.filter((item) => String(item.id) !== String(templateId)),
  );
  showToast("Template deleted", { type: "success" });
}

/**
 * Extract unique values for each component category from the playbook
 * @returns {Object<string, string[]>} - Map of categoryId to sorted unique values
 */

/**
 * Derive a "base" play name for grouping variations.
 *
 * Uses BOTH BasePlay and Play, and aggressively strips things that
 * "look like" tags:
 *  - Position letters (X/Z/Y/F/H/RB/TB/TE/WR/SL) at the front
 *  - Trailing short all‑caps tokens (LT/RT/QK/etc.)
 *  - Parenthetical / bracketed notes anywhere: (RPO), [SHOT], etc.
 *  - Very short all‑caps words that commonly behave like tags.
 */

/**
 * For a given smart base play name, return all underlying raw Play values
 * that map to it (unique, trimmed strings).
 */

/**
 * Toggle a component's installation status
 */
function toggleComponentInstalled(categoryId, value) {
  const data = getInstallationData();
  if (!data.installed[categoryId]) data.installed[categoryId] = [];

  // In smart base plays mode, toggling a "play" value represents a base
  // concept and should fan out to all underlying raw Play strings.
  if (categoryId === "play" && installSmartBasePlays) {
    const rawPlays = getRawPlayNamesForBase(value);
    if (rawPlays.length === 0) return;

    const installed = data.installed[categoryId];
    const installedSet = new Set(
      installed.map((v) => v.trim()).filter(Boolean),
    );
    const allInstalled = rawPlays.every((name) => installedSet.has(name));

    if (allInstalled) {
      // Uninstall all plays in this base group
      const toRemove = new Set(rawPlays);
      data.installed[categoryId] = installed.filter(
        (v) => !toRemove.has(v.trim()),
      );
    } else {
      // Install any missing plays in this base group
      rawPlays.forEach((name) => {
        if (!installedSet.has(name)) installed.push(name);
      });
      data.installed[categoryId] = installed;
    }

    saveInstallationData(data);
    return;
  }

  const idx = data.installed[categoryId].indexOf(value);
  if (idx >= 0) {
    data.installed[categoryId].splice(idx, 1);
  } else {
    data.installed[categoryId].push(value);
  }

  saveInstallationData(data);
}

/**
 * Set all items in a category as installed or uninstalled
 */
function setAllCategoryInstalled(categoryId, installed, allValues) {
  const data = getInstallationData();
  data.installed[categoryId] = installed ? [...allValues] : [];
  saveInstallationData(data);
}

// ============ Star Rating System ============

/**
 * Calculate the installation star rating for a play (0-10)
 * Each component of the play that is installed earns 1 star
 * Components that don't apply (empty) are not counted against the play
 *
 * @param {Object} play - The play object
 * @returns {{ stars: number, maxStars: number, details: Array<{category: string, value: string, installed: boolean}> }}
 */

/**
 * Render star rating HTML (video game style)
 * @param {number} stars - Number of filled stars
 * @param {number} maxStars - Total possible stars
 * @param {string} [size='sm'] - Size: 'sm', 'md', 'lg'
 * @returns {string} HTML string
 */

/**
 * Get CSS class for star rating level
 */

// ============ Installation Page Rendering ============

let installActiveCategory = null;
let installSearchTerm = "";
// When true and the active category is "play", the Plays list groups
// variations by their base concept (using the BasePlay column when
// available and a heuristic fallback on the Play column).
let installSmartBasePlays = false;

/**
 * Initialize the installation page
 */
function initInstallation() {
  renderInstallation();
}

/**
 * Debounced render for search input — avoids full re-render on every keystroke
 */
const debouncedRenderInstallation = debounce(renderInstallation, 150);

/**
 * Render the full installation page
 */

/**
 * Render the detail panel for the active category
 */

// ============ Bulk Actions ============

function installAll(categoryId) {
  const components = extractComponentsFromPlaybook();
  const allValues = components[categoryId] || [];
  setAllCategoryInstalled(categoryId, true, allValues);
  renderInstallation();
  showToast(
    `✅ All ${INSTALL_CATEGORIES.find((c) => c.id === categoryId)?.label || ""} marked as installed`,
  );
}

function uninstallAll(categoryId) {
  setAllCategoryInstalled(categoryId, false, []);
  renderInstallation();
  showToast(
    `Cleared all ${INSTALL_CATEGORIES.find((c) => c.id === categoryId)?.label || ""}`,
  );
}

// ============ Drag to Reorder ============

let installDragItem = null;

function installDragStart(event, categoryId, value) {
  installDragItem = { categoryId, value };
  event.dataTransfer.effectAllowed = "move";
  event.target.closest(".install-item")?.classList.add("install-dragging");
}

function installDragDrop(event, categoryId, targetValue) {
  event.preventDefault();
  if (!installDragItem || installDragItem.categoryId !== categoryId) return;

  const data = getInstallationData();
  if (!data.order[categoryId]) {
    // Initialize order from current components
    const components = extractComponentsFromPlaybook();
    data.order[categoryId] = [...(components[categoryId] || [])];
  }

  const order = data.order[categoryId];
  const fromIdx = order.indexOf(installDragItem.value);
  const toIdx = order.indexOf(targetValue);

  if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, installDragItem.value);
    saveInstallationData(data);
    renderInstallation();
  }

  installDragItem = null;
  document
    .querySelectorAll(".install-dragging")
    .forEach((el) => el.classList.remove("install-dragging"));
}

// ============ Readiness Modal ============

/**
 * Show a modal listing plays for a given readiness level
 * @param {'ready'|'partial'|'none'} type
 */

// ============ Playbook Integration ============

/**
 * Get the star badge HTML for a play (used in playbook table rows)
 */

/**
 * Get detailed install tooltip HTML for a play (used in playbook hover preview)
 */
// ============ Smart Installation Report ============

/**
 * Generate a comprehensive smart installation report
 * Analyzes the entire playbook to produce prioritized install recommendations
 *
 * The algorithm scores every uninstalled component across several dimensions:
 *   1. GAME-READY UNLOCK — how many plays would become fully installed
 *   2. NEAR-READY LIFT   — how many "almost there" plays get closer
 *   3. BREADTH IMPACT    — total # of plays that use this component
 *   4. VARIETY BONUS      — does it unlock new formations/personnel combos?
 *   5. CLUSTER SYNERGY    — installing this + one more finishes a group of plays
 *
 * Returns structured data consumed by the rendering function.
 */


/**
 * Render and show the Smart Installation Report modal
 */


/**
 * Print a professional version of the Smart Installation Report
 */


// ============ Delegation Helper Functions ============

/** Select a category and reset search */
function selectInstallCategory(catId) {
  installActiveCategory = catId;
  installSearchTerm = "";
  renderInstallation();
}

/** Handle search input */
function installSearch(val) {
  installSearchTerm = val;
  debouncedRenderInstallation();
}

/** Toggle smart base plays checkbox */
function toggleSmartBasePlays() {
  installSmartBasePlays = !installSmartBasePlays;
  renderInstallation();
}

/** Toggle a component's installed state and re-render */
function installToggleItem(event) {
  const target = event?.target?.closest("[data-onchange='installToggleItem']");
  const cat = target?.dataset ? target.dataset.cat : null;
  const val = target?.dataset ? target.dataset.val : null;
  if (cat && val) {
    toggleComponentInstalled(cat, val);
    renderInstallation();
  }
}

/** Toggle sir section collapsed state */
function toggleSirCollapse(el) {
  const section = el ? el.closest(".sir-section") || el.parentElement : null;
  if (section) section.classList.toggle("sir-section-collapsed");
}

// ============ Container-Scoped Delegation ============

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("installation");
  if (!container) return;

  // ── Drag delegation for install items ──
  container.addEventListener("dragstart", (e) => {
    const el = e.target.closest("[data-drag='installItem']");
    if (el) installDragStart(e, el.dataset.cat, el.dataset.val);
  });
  container.addEventListener("dragover", (e) => {
    const el = e.target.closest("[data-drag='installItem']");
    if (el) e.preventDefault();
  });
  container.addEventListener("drop", (e) => {
    const el = e.target.closest("[data-drag='installItem']");
    if (el) installDragDrop(e, el.dataset.cat, el.dataset.val);
  });
});
