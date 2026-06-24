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
function generateSmartInstallReport() {
  try {
    if (!plays || plays.length === 0) return null;

    const data = getInstallationData();
    const components = extractComponentsFromPlaybook();

    // ── Step 1: Rate every play ──────────────────────────────────
    const playRatings = plays.map((p) => {
      const rating = getPlayInstallRating(p);
      return { play: p, ...rating };
    });

    // ── Step 2: Classify plays by readiness ──────────────────────
    const gameReady = playRatings.filter(
      (r) => r.maxStars > 0 && r.stars === r.maxStars,
    );
    const nearReady = playRatings.filter(
      (r) =>
        r.maxStars > 0 &&
        r.stars > 0 &&
        r.maxStars - r.stars <= 2 &&
        r.stars < r.maxStars,
    );
    const inProgress = playRatings.filter(
      (r) => r.maxStars > 0 && r.stars > 0 && r.maxStars - r.stars > 2,
    );
    const notStarted = playRatings.filter(
      (r) => r.maxStars > 0 && r.stars === 0,
    );

    // ── Step 3: Score every UNINSTALLED component ────────────────
    const componentScores = [];

    INSTALL_CATEGORIES.forEach((cat) => {
      const allItems = components[cat.id] || [];
      const installed = data.installed[cat.id] || [];

      allItems.forEach((value) => {
        if (installed.includes(value)) return; // skip already installed

        // Find all plays that use this component
        const affectedPlays = playRatings.filter((r) => {
          if (cat.id === "formTag") {
            const tags = [r.play.formTag1, r.play.formTag2]
              .filter(Boolean)
              .map((t) => t.trim());
            return tags.includes(value);
          }
          const v = r.play[cat.field];
          return v && v.trim() === value;
        });

        if (affectedPlays.length === 0) return;

        // ── Dimension 1: Game-ready unlocks ──
        // How many plays would become fully installed if we install this?
        const wouldUnlock = affectedPlays.filter(
          (r) => r.maxStars - r.stars === 1,
        ).length;

        // ── Dimension 2: Near-ready lift ──
        // How many plays are within 2 of done and this helps?
        const wouldLift = affectedPlays.filter(
          (r) => r.maxStars - r.stars === 2,
        ).length;

        // ── Dimension 3: Breadth impact ──
        const breadth = affectedPlays.length;

        // ── Dimension 4: Variety — unique formation+personnel combos unlocked ──
        const combos = new Set();
        affectedPlays.forEach((r) => {
          const combo = `${r.play.formation || "?"}|${r.play.personnel || "?"}`;
          combos.add(combo);
        });
        const variety = combos.size;

        // ── Dimension 5: Run/Pass balance contribution ──
        const runCount = affectedPlays.filter(
          (r) => r.play.type === "Run",
        ).length;
        const passCount = affectedPlays.filter(
          (r) => r.play.type === "Pass",
        ).length;

        // ── Dimension 6: Cluster synergy ──
        // How many plays needing 1-2 more components does this help?
        const clusterPlays = affectedPlays.filter(
          (r) =>
            r.maxStars > 0 && r.maxStars - r.stars <= 2 && r.stars < r.maxStars,
        ).length;

        // ── Composite score (weighted) ──
        const score =
          wouldUnlock * 50 + // Highest priority: finishes plays
          clusterPlays * 20 + // High priority: near-completion synergy
          wouldLift * 15 + // Good: gets plays closer
          breadth * 5 + // Moderate: breadth of impact
          variety * 3; // Modest: variety bonus

        componentScores.push({
          categoryId: cat.id,
          categoryLabel: cat.label,
          icon: cat.icon,
          value,
          score,
          wouldUnlock,
          wouldLift,
          clusterPlays,
          breadth,
          variety,
          runCount,
          passCount,
          affectedPlayNames: affectedPlays
            .slice(0, 8)
            .map((r) => r.play.play || r.play.basePlay || "Unnamed"),
          totalAffected: affectedPlays.length,
        });
      });
    });

    // Sort by composite score desc
    componentScores.sort((a, b) => b.score - a.score);

    // ── Step 4: Build structured sections ────────────────────────

    // Section A: "Game Ready" plays summary
    const gameReadySummary = {
      count: gameReady.length,
      plays: gameReady.map((r) => ({
        name: r.play.play || r.play.basePlay || "Unnamed",
        formation: r.play.formation || "",
        personnel: r.play.personnel || "",
        type: r.play.type || "",
        stars: r.stars,
        maxStars: r.maxStars,
        _play: r.play,
      })),
    };

    // Section B: "One Install Away" — plays needing exactly 1 more component
    const oneAway = playRatings
      .filter((r) => r.maxStars > 0 && r.maxStars - r.stars === 1)
      .map((r) => {
        const missing = r.details.filter((d) => !d.installed);
        return {
          name: r.play.play || r.play.basePlay || "Unnamed",
          formation: r.play.formation || "",
          personnel: r.play.personnel || "",
          type: r.play.type || "",
          stars: r.stars,
          maxStars: r.maxStars,
          missing: missing[0] || null,
        };
      })
      .sort((a, b) => b.maxStars - a.maxStars); // sort by complexity (more stars = more complex play)

    // Section C: "Two Away" — plays needing exactly 2 more
    const twoAway = playRatings
      .filter((r) => r.maxStars > 0 && r.maxStars - r.stars === 2)
      .map((r) => {
        const missing = r.details.filter((d) => !d.installed);
        return {
          name: r.play.play || r.play.basePlay || "Unnamed",
          formation: r.play.formation || "",
          personnel: r.play.personnel || "",
          type: r.play.type || "",
          stars: r.stars,
          maxStars: r.maxStars,
          missing,
        };
      })
      .sort((a, b) => b.maxStars - a.maxStars);

    // Section D: Top priority installs (top 15)
    const topInstalls = componentScores.slice(0, 15);

    // Section E: "Quick wins" — components that unlock the most plays with 1 install
    const quickWins = componentScores
      .filter((c) => c.wouldUnlock >= 1)
      .sort((a, b) => b.wouldUnlock - a.wouldUnlock)
      .slice(0, 10);

    // Section F: "Variety boosters" — components that unlock the most unique combos
    const varietyBoosters = componentScores
      .filter((c) => c.variety >= 2)
      .sort((a, b) => b.variety - a.variety || b.breadth - a.breadth)
      .slice(0, 10);

    // Section G: "Coverage gaps" — categories with lowest install %
    const categoryGaps = INSTALL_CATEGORIES.map((cat) => {
      const allItems = components[cat.id] || [];
      const installed = (data.installed[cat.id] || []).filter((v) =>
        allItems.includes(v),
      );
      return {
        ...cat,
        total: allItems.length,
        installed: installed.length,
        remaining: allItems.length - installed.length,
        pct:
          allItems.length > 0
            ? Math.round((installed.length / allItems.length) * 100)
            : 100,
      };
    })
      .filter((c) => c.total > 0 && c.remaining > 0)
      .sort((a, b) => a.pct - b.pct);

    // Section H: Run/Pass readiness balance
    const readyRuns = gameReady.filter((r) => r.play.type === "Run").length;
    const readyPasses = gameReady.filter((r) => r.play.type === "Pass").length;
    const totalRuns = playRatings.filter((r) => r.play.type === "Run").length;
    const totalPasses = playRatings.filter(
      (r) => r.play.type === "Pass",
    ).length;

    return {
      gameReadySummary,
      oneAway,
      twoAway,
      topInstalls,
      quickWins,
      varietyBoosters,
      categoryGaps,
      balance: { readyRuns, readyPasses, totalRuns, totalPasses },
      totalPlays: plays.length,
      totalGameReady: gameReady.length,
      totalNearReady: nearReady.length,
      totalInProgress: inProgress.length,
      totalNotStarted: notStarted.length,
    };
  } catch (err) {
    console.error("generateSmartInstallReport error:", err);
    return null;
  }
}

/**
 * Render and show the Smart Installation Report modal
 */
function showSmartInstallReport() {
  const report = generateSmartInstallReport();
  if (!report) {
    showModal("No playbook loaded.", { title: "🧠 Smart Install Report" });
    return;
  }

  const { balance } = report;
  const runReadyPct =
    balance.totalRuns > 0
      ? Math.round((balance.readyRuns / balance.totalRuns) * 100)
      : 0;
  const passReadyPct =
    balance.totalPasses > 0
      ? Math.round((balance.readyPasses / balance.totalPasses) * 100)
      : 0;

  let html = `<div class="sir-container">`;

  // ── Print Button ────────────────────────────────────────────
  html += `
    <div class="sir-print-bar">
      <button class="btn btn-sm sir-print-btn" data-action="printSmartInstallReport" title="Print a professional copy of this report">🖨️ Print Report</button>
    </div>`;

  // ── Overview Banner ──────────────────────────────────────────
  html += `
    <div class="sir-overview">
      <div class="sir-ov-stat sir-ov-ready">
        <div class="sir-ov-num">${report.totalGameReady}</div>
        <div class="sir-ov-label">Game Ready</div>
      </div>
      <div class="sir-ov-stat sir-ov-near">
        <div class="sir-ov-num">${report.totalNearReady}</div>
        <div class="sir-ov-label">Near Ready</div>
      </div>
      <div class="sir-ov-stat sir-ov-progress">
        <div class="sir-ov-num">${report.totalInProgress}</div>
        <div class="sir-ov-label">In Progress</div>
      </div>
      <div class="sir-ov-stat sir-ov-none">
        <div class="sir-ov-num">${report.totalNotStarted}</div>
        <div class="sir-ov-label">Not Started</div>
      </div>
    </div>`;

  // ── Run/Pass Balance ─────────────────────────────────────────
  html += `
    <div class="sir-section">
      <div class="sir-section-title">⚖️ Run/Pass Readiness Balance</div>
      <div class="sir-balance">
        <div class="sir-balance-bar">
          <div class="sir-balance-label">Run Ready</div>
          <div class="sir-bar-track">
            <div class="sir-bar-fill sir-bar-run" style="--bar-width:${runReadyPct}%"></div>
          </div>
          <div class="sir-balance-nums">${balance.readyRuns}/${balance.totalRuns} (${runReadyPct}%)</div>
        </div>
        <div class="sir-balance-bar">
          <div class="sir-balance-label">Pass Ready</div>
          <div class="sir-bar-track">
            <div class="sir-bar-fill sir-bar-pass" style="--bar-width:${passReadyPct}%"></div>
          </div>
          <div class="sir-balance-nums">${balance.readyPasses}/${balance.totalPasses} (${passReadyPct}%)</div>
        </div>
      </div>
    </div>`;

  // ── Touch Distribution ───────────────────────────────────────
  if (
    typeof computeTouchAnalysis === "function" &&
    typeof renderTouchAnalysis === "function" &&
    plays &&
    plays.length > 0
  ) {
    const allTouchAnalysis = computeTouchAnalysis(plays);
    // Also compute for game-ready plays only
    const gameReadyPlays =
      report.gameReadySummary && report.gameReadySummary.plays
        ? report.gameReadySummary.plays
          .map((p) => p._play || p)
          .filter((p) => p && p.play)
        : [];
    const gameReadyAnalysis =
      gameReadyPlays.length > 0 ? computeTouchAnalysis(gameReadyPlays) : null;

    if (allTouchAnalysis && Object.keys(allTouchAnalysis.players).length > 0) {
      html += `
        <div class="sir-section">
          <div class="sir-section-title">🏈 Touch Distribution <span class="sir-section-hint">Weighted player usage across your playbook</span></div>
          ${renderTouchAnalysis(allTouchAnalysis, { title: "All Plays", idPrefix: "sir-ta-all" })}
          ${gameReadyAnalysis &&
          Object.keys(gameReadyAnalysis.players).length > 0
          ? renderTouchAnalysis(gameReadyAnalysis, {
            title: "Game Ready Only",
            compact: true,
            idPrefix: "sir-ta-gr",
          })
          : ""
        }
        </div>`;
    }
  }

  // ── Quick Wins ───────────────────────────────────────────────
  if (report.quickWins.length > 0) {
    html += `
      <div class="sir-section">
        <div class="sir-section-title">⚡ Quick Wins <span class="sir-section-hint">Install one thing, unlock game-ready plays</span></div>
        <div class="sir-cards">`;

    report.quickWins.forEach((c) => {
      html += `
          <div class="sir-card sir-card-quickwin">
            <div class="sir-card-head">
              <span class="sir-card-icon">${c.icon}</span>
              <span class="sir-card-value">${escapeHtml(c.value)}</span>
              <span class="sir-card-cat">${c.categoryLabel}</span>
            </div>
            <div class="sir-card-impact">
              <span class="sir-badge sir-badge-unlock">🔓 Unlocks ${c.wouldUnlock} play${c.wouldUnlock !== 1 ? "s" : ""}</span>
              ${c.breadth > c.wouldUnlock ? `<span class="sir-badge sir-badge-breadth">📊 Helps ${c.breadth} total</span>` : ""}
            </div>
            <div class="sir-card-plays">${c.affectedPlayNames.map((n) => escapeHtml(n)).join(", ")}${c.totalAffected > 8 ? ` +${c.totalAffected - 8} more` : ""}</div>
          </div>`;
    });

    html += `</div></div>`;
  }

  // ── One Install Away ─────────────────────────────────────────
  if (report.oneAway.length > 0) {
    html += `
      <div class="sir-section">
        <div class="sir-section-title">🎯 One Install Away <span class="sir-section-hint">${report.oneAway.length} play${report.oneAway.length !== 1 ? "s" : ""} need just 1 more component</span></div>
        <div class="sir-list">`;

    report.oneAway.forEach((p) => {
      const subtitle = [p.personnel, p.formation].filter(Boolean).join(" · ");
      html += `
          <div class="sir-list-row sir-list-oneaway">
            <div class="sir-list-info">
              <div class="sir-list-name">${escapeHtml(p.name)}</div>
              ${subtitle ? `<div class="sir-list-sub">${escapeHtml(subtitle)}</div>` : ""}
            </div>
            <div class="sir-list-stars">${renderStarRating(p.stars, p.maxStars, "sm")}</div>
            ${p.missing ? `<div class="sir-list-missing"><span class="sir-missing-badge">${p.missing.icon} ${escapeHtml(p.missing.value)}</span></div>` : ""}
          </div>`;
    });

    html += `</div></div>`;
  }

  // ── Top Priority Installs ────────────────────────────────────
  if (report.topInstalls.length > 0) {
    html += `
      <div class="sir-section">
        <div class="sir-section-title">📋 Recommended Install Order <span class="sir-section-hint">Prioritized by impact across your playbook</span></div>
        <div class="sir-priority-list">`;

    report.topInstalls.forEach((c, idx) => {
      const tags = [];
      if (c.wouldUnlock > 0) tags.push(`🔓 ${c.wouldUnlock} game-ready`);
      if (c.clusterPlays > 0) tags.push(`🎯 ${c.clusterPlays} near-ready`);
      if (c.variety >= 3) tags.push(`🌐 ${c.variety} combos`);
      if (c.runCount > 0 && c.passCount > 0) tags.push("⚖️ Run+Pass");
      else if (c.runCount > 0) tags.push("🏃 Run");
      else if (c.passCount > 0) tags.push("🎯 Pass");

      html += `
          <div class="sir-priority-row">
            <div class="sir-priority-rank">${idx + 1}</div>
            <div class="sir-priority-info">
              <div class="sir-priority-head">
                <span class="sir-priority-icon">${c.icon}</span>
                <span class="sir-priority-value">${escapeHtml(c.value)}</span>
                <span class="sir-priority-cat">${c.categoryLabel}</span>
              </div>
              <div class="sir-priority-tags">${tags.map((t) => `<span class="sir-tag">${t}</span>`).join("")}</div>
            </div>
            <div class="sir-priority-stat">
              <div class="sir-priority-breadth">${c.breadth} play${c.breadth !== 1 ? "s" : ""}</div>
            </div>
          </div>`;
    });

    html += `</div></div>`;
  }

  // ── Two Away ─────────────────────────────────────────────────
  if (report.twoAway.length > 0) {
    html += `
      <div class="sir-section">
        <div class="sir-section-title">🔜 Two Installs Away <span class="sir-section-hint">${report.twoAway.length} play${report.twoAway.length !== 1 ? "s" : ""} need 2 more</span></div>
        <div class="sir-list">`;

    report.twoAway.slice(0, 20).forEach((p) => {
      const subtitle = [p.personnel, p.formation].filter(Boolean).join(" · ");
      html += `
          <div class="sir-list-row sir-list-twoaway">
            <div class="sir-list-info">
              <div class="sir-list-name">${escapeHtml(p.name)}</div>
              ${subtitle ? `<div class="sir-list-sub">${escapeHtml(subtitle)}</div>` : ""}
            </div>
            <div class="sir-list-stars">${renderStarRating(p.stars, p.maxStars, "sm")}</div>
            <div class="sir-list-missing">${p.missing.map((m) => `<span class="sir-missing-badge">${m.icon} ${escapeHtml(m.value)}</span>`).join("")}</div>
          </div>`;
    });

    if (report.twoAway.length > 20) {
      html += `<div class="sir-list-more">+${report.twoAway.length - 20} more plays</div>`;
    }

    html += `</div></div>`;
  }

  // ── Variety Boosters ─────────────────────────────────────────
  if (report.varietyBoosters.length > 0) {
    html += `
      <div class="sir-section">
        <div class="sir-section-title">🌐 Variety Boosters <span class="sir-section-hint">Add diversity to your game plan</span></div>
        <div class="sir-cards">`;

    report.varietyBoosters.forEach((c) => {
      html += `
          <div class="sir-card sir-card-variety">
            <div class="sir-card-head">
              <span class="sir-card-icon">${c.icon}</span>
              <span class="sir-card-value">${escapeHtml(c.value)}</span>
              <span class="sir-card-cat">${c.categoryLabel}</span>
            </div>
            <div class="sir-card-impact">
              <span class="sir-badge sir-badge-variety">🌐 ${c.variety} unique combos</span>
              <span class="sir-badge sir-badge-breadth">📊 ${c.breadth} plays</span>
            </div>
          </div>`;
    });

    html += `</div></div>`;
  }

  // ── Coverage Gaps ────────────────────────────────────────────
  if (report.categoryGaps.length > 0) {
    html += `
      <div class="sir-section">
        <div class="sir-section-title">📉 Coverage Gaps <span class="sir-section-hint">Categories with the most room to grow</span></div>
        <div class="sir-gaps">`;

    report.categoryGaps.forEach((g) => {
      html += `
          <div class="sir-gap-row">
            <div class="sir-gap-label">${g.icon} ${g.label}</div>
            <div class="sir-gap-bar-wrap">
              <div class="sir-bar-track">
                <div class="sir-bar-fill sir-bar-gap" style="--bar-width:${g.pct}%"></div>
              </div>
            </div>
            <div class="sir-gap-nums">${g.installed}/${g.total} (${g.remaining} left)</div>
          </div>`;
    });

    html += `</div></div>`;
  }

  // ── Game Ready Roster ────────────────────────────────────────
  if (report.gameReadySummary.plays.length > 0) {
    html += `
      <div class="sir-section sir-section-collapsed" id="sirGameReadySection">
        <div class="sir-section-title sir-section-toggle" data-action="toggleSirCollapse">
          ✅ Game Ready Roster <span class="sir-section-hint">${report.gameReadySummary.count} play${report.gameReadySummary.count !== 1 ? "s" : ""} fully installed</span>
          <span class="sir-collapse-icon">▶</span>
        </div>
        <div class="sir-collapsible">
          <div class="sir-list">`;

    report.gameReadySummary.plays.forEach((p) => {
      const subtitle = [p.personnel, p.formation].filter(Boolean).join(" · ");
      const typeClass =
        p.type === "Run"
          ? "sir-type-run"
          : p.type === "Pass"
            ? "sir-type-pass"
            : "";
      html += `
            <div class="sir-list-row sir-list-ready">
              <div class="sir-list-info">
                <div class="sir-list-name">${escapeHtml(p.name)}</div>
                ${subtitle ? `<div class="sir-list-sub">${escapeHtml(subtitle)}</div>` : ""}
              </div>
              <div class="sir-list-stars">${renderStarRating(p.stars, p.maxStars, "sm")}</div>
              ${p.type ? `<span class="sir-type-badge ${typeClass}">${escapeHtml(p.type)}</span>` : ""}
            </div>`;
    });

    html += `</div></div></div>`;
  }

  html += `</div>`; // close .sir-container

  showModal(html, {
    title: "🧠 Smart Installation Report",
    confirmText: "Close",
  });
}

/**
 * Print a professional version of the Smart Installation Report
 */
function printSmartInstallReport() {
  const report = generateSmartInstallReport();
  if (!report) return;

  const container = document.getElementById("installReportPrint");
  const content = document.getElementById("installReportPrintContent");
  if (!container || !content) return;

  try {
    showToast("🖨️ Preparing install report…", 2500);

    const { balance } = report;
    const runReadyPct =
      balance.totalRuns > 0
        ? Math.round((balance.readyRuns / balance.totalRuns) * 100)
        : 0;
    const passReadyPct =
      balance.totalPasses > 0
        ? Math.round((balance.readyPasses / balance.totalPasses) * 100)
        : 0;
    const overallReady =
      report.totalPlays > 0
        ? Math.round((report.totalGameReady / report.totalPlays) * 100)
        : 0;
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let html = `
    <div class="sirp">
      <div class="sirp-header">
        <div class="sirp-header-left">
          <div class="sirp-title">Smart Installation Report</div>
          <div class="sirp-date">${dateStr}</div>
        </div>
        <div class="sirp-header-right">
          <div class="sirp-overall">
            <div class="sirp-overall-pct">${overallReady}%</div>
            <div class="sirp-overall-label">Game Ready</div>
          </div>
        </div>
      </div>

      <div class="sirp-stats-row">
        <div class="sirp-stat sirp-stat-ready"><span class="sirp-stat-num">${report.totalGameReady}</span><span class="sirp-stat-label">Game Ready</span></div>
        <div class="sirp-stat sirp-stat-near"><span class="sirp-stat-num">${report.totalNearReady}</span><span class="sirp-stat-label">Near Ready</span></div>
        <div class="sirp-stat sirp-stat-prog"><span class="sirp-stat-num">${report.totalInProgress}</span><span class="sirp-stat-label">In Progress</span></div>
        <div class="sirp-stat sirp-stat-none"><span class="sirp-stat-num">${report.totalNotStarted}</span><span class="sirp-stat-label">Not Started</span></div>
        <div class="sirp-stat"><span class="sirp-stat-num">${report.totalPlays}</span><span class="sirp-stat-label">Total Plays</span></div>
      </div>

      <div class="sirp-balance-row">
        <div class="sirp-balance-item">
          <span class="sirp-balance-label">Run Ready:</span>
          <span class="sirp-balance-bar-wrap"><span class="sirp-balance-fill sirp-fill-run" style="--bar-width:${runReadyPct}%"></span></span>
          <span class="sirp-balance-val">${balance.readyRuns}/${balance.totalRuns} (${runReadyPct}%)</span>
        </div>
        <div class="sirp-balance-item">
          <span class="sirp-balance-label">Pass Ready:</span>
          <span class="sirp-balance-bar-wrap"><span class="sirp-balance-fill sirp-fill-pass" style="--bar-width:${passReadyPct}%"></span></span>
          <span class="sirp-balance-val">${balance.readyPasses}/${balance.totalPasses} (${passReadyPct}%)</span>
        </div>
      </div>`;

    // ── Touch Distribution (Print) ──
    if (
      typeof computeTouchAnalysis === "function" &&
      plays &&
      plays.length > 0
    ) {
      const allTouch = computeTouchAnalysis(plays);
      if (allTouch && Object.keys(allTouch.players).length > 0) {
        const playerRows = Object.values(allTouch.players);
        html += `
        <div class="sirp-section">
          <div class="sirp-section-title">🏈 Touch Distribution — Weighted Player Usage</div>
          <table class="sirp-table">
            <thead><tr><th>Player</th><th>Weighted %</th><th>Points</th><th>Plays</th><th>KP1</th><th>KP2</th><th>KP3</th><th>Primary Rate</th></tr></thead>
            <tbody>`;
        playerRows.forEach((p) => {
          html += `<tr><td><strong>${escapeHtml(p.name)}</strong></td><td class="sirp-center">${p.pct.toFixed(1)}%</td><td class="sirp-center">${Number.isInteger(p.weightedPts) ? p.weightedPts : p.weightedPts.toFixed(1)}</td><td class="sirp-center">${p.flatCount}</td><td class="sirp-center">${p.slots.kp1}</td><td class="sirp-center">${p.slots.kp2}</td><td class="sirp-center">${p.slots.kp3}</td><td class="sirp-center">${p.primaryRate.toFixed(0)}%</td></tr>`;
        });
        html += `</tbody></table>`;

        // Game-ready touch comparison
        const grPlays =
          report.gameReadySummary && report.gameReadySummary.plays
            ? report.gameReadySummary.plays.map((p) => p._play).filter(Boolean)
            : [];
        if (grPlays.length > 0) {
          const grTouch = computeTouchAnalysis(grPlays);
          if (grTouch && Object.keys(grTouch.players).length > 0) {
            html += `
            <div class="sirp-section-subtitle">Game Ready Only</div>
            <table class="sirp-table">
              <thead><tr><th>Player</th><th>Weighted %</th><th>Points</th><th>Plays</th></tr></thead>
              <tbody>`;
            Object.values(grTouch.players).forEach((p) => {
              html += `<tr><td><strong>${escapeHtml(p.name)}</strong></td><td class="sirp-center">${p.pct.toFixed(1)}%</td><td class="sirp-center">${Number.isInteger(p.weightedPts) ? p.weightedPts : p.weightedPts.toFixed(1)}</td><td class="sirp-center">${p.flatCount}</td></tr>`;
            });
            html += `</tbody></table>`;
          }
        }
        html += `</div>`;
      }
    }

    // ── Quick Wins ──
    if (report.quickWins.length > 0) {
      html += `
      <div class="sirp-section">
        <div class="sirp-section-title">⚡ Quick Wins — Install One, Unlock Game-Ready Plays</div>
        <table class="sirp-table">
          <thead><tr><th>Component</th><th>Category</th><th>Unlocks</th><th>Total Impact</th></tr></thead>
          <tbody>`;
      report.quickWins.forEach((c) => {
        html += `<tr><td><strong>${escapeHtml(c.value)}</strong></td><td>${c.icon} ${c.categoryLabel}</td><td class="sirp-center">${c.wouldUnlock}</td><td class="sirp-center">${c.breadth} plays</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ── Recommended Install Order ──
    if (report.topInstalls.length > 0) {
      html += `
      <div class="sirp-section">
        <div class="sirp-section-title">📋 Recommended Install Order — Prioritized by Impact</div>
        <table class="sirp-table">
          <thead><tr><th class="sirp-rank-col">#</th><th>Component</th><th>Category</th><th>Unlocks</th><th>Near-Ready</th><th>Total</th><th>Details</th></tr></thead>
          <tbody>`;
      report.topInstalls.forEach((c, idx) => {
        const tags = [];
        if (c.variety >= 3) tags.push(`${c.variety} combos`);
        if (c.runCount > 0 && c.passCount > 0) tags.push("Run+Pass");
        else if (c.runCount > 0) tags.push("Run");
        else if (c.passCount > 0) tags.push("Pass");
        html += `<tr><td class="sirp-center"><strong>${idx + 1}</strong></td><td><strong>${escapeHtml(c.value)}</strong></td><td>${c.icon} ${c.categoryLabel}</td><td class="sirp-center">${c.wouldUnlock || "-"}</td><td class="sirp-center">${c.clusterPlays || "-"}</td><td class="sirp-center">${c.breadth}</td><td class="sirp-tags-cell">${tags.join(", ") || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ── One Install Away ──
    if (report.oneAway.length > 0) {
      html += `
      <div class="sirp-section">
        <div class="sirp-section-title">🎯 One Install Away — ${report.oneAway.length} Play${report.oneAway.length !== 1 ? "s" : ""}</div>
        <table class="sirp-table">
          <thead><tr><th>Play</th><th>Personnel</th><th>Formation</th><th>Missing Component</th></tr></thead>
          <tbody>`;
      report.oneAway.forEach((p) => {
        html += `<tr><td><strong>${escapeHtml(p.name)}</strong></td><td>${escapeHtml(p.personnel)}</td><td>${escapeHtml(p.formation)}</td><td>${p.missing ? p.missing.icon + " " + escapeHtml(p.missing.value) : "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ── Two Away ──
    if (report.twoAway.length > 0) {
      html += `
      <div class="sirp-section">
        <div class="sirp-section-title">🔜 Two Installs Away — ${report.twoAway.length} Play${report.twoAway.length !== 1 ? "s" : ""}</div>
        <table class="sirp-table">
          <thead><tr><th>Play</th><th>Personnel</th><th>Formation</th><th>Missing Components</th></tr></thead>
          <tbody>`;
      report.twoAway.forEach((p) => {
        const missingStr = p.missing
          .map((m) => m.icon + " " + escapeHtml(m.value))
          .join(", ");
        html += `<tr><td><strong>${escapeHtml(p.name)}</strong></td><td>${escapeHtml(p.personnel)}</td><td>${escapeHtml(p.formation)}</td><td>${missingStr}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ── Variety Boosters ──
    if (report.varietyBoosters.length > 0) {
      html += `
      <div class="sirp-section">
        <div class="sirp-section-title">🌐 Variety Boosters — Add Diversity to Your Game Plan</div>
        <table class="sirp-table">
          <thead><tr><th>Component</th><th>Category</th><th>Unique Combos</th><th>Total Plays</th></tr></thead>
          <tbody>`;
      report.varietyBoosters.forEach((c) => {
        html += `<tr><td><strong>${escapeHtml(c.value)}</strong></td><td>${c.icon} ${c.categoryLabel}</td><td class="sirp-center">${c.variety}</td><td class="sirp-center">${c.breadth}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ── Coverage Gaps ──
    if (report.categoryGaps.length > 0) {
      html += `
      <div class="sirp-section">
        <div class="sirp-section-title">📉 Coverage Gaps</div>
        <table class="sirp-table">
          <thead><tr><th>Category</th><th>Installed</th><th>Remaining</th><th>Progress</th></tr></thead>
          <tbody>`;
      report.categoryGaps.forEach((g) => {
        html += `<tr><td>${g.icon} <strong>${g.label}</strong></td><td class="sirp-center">${g.installed}/${g.total}</td><td class="sirp-center">${g.remaining}</td><td class="sirp-center">${g.pct}%</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ── Game Ready Roster ──
    if (report.gameReadySummary.plays.length > 0) {
      html += `
      <div class="sirp-section">
        <div class="sirp-section-title">✅ Game Ready Roster — ${report.gameReadySummary.count} Play${report.gameReadySummary.count !== 1 ? "s" : ""} Fully Installed</div>
        <div class="sirp-roster">`;
      const runs = report.gameReadySummary.plays.filter(
        (p) => p.type === "Run",
      );
      const passes = report.gameReadySummary.plays.filter(
        (p) => p.type === "Pass",
      );
      const other = report.gameReadySummary.plays.filter(
        (p) => p.type !== "Run" && p.type !== "Pass",
      );
      if (runs.length > 0) {
        html += `<div class="sirp-roster-group"><div class="sirp-roster-heading">🏃 Run (${runs.length})</div><div class="sirp-roster-items">${runs.map((p) => `<span class="sirp-roster-item">${escapeHtml(p.name)} <span class="sirp-roster-sub">${escapeHtml(p.formation)}</span></span>`).join("")}</div></div>`;
      }
      if (passes.length > 0) {
        html += `<div class="sirp-roster-group"><div class="sirp-roster-heading">🎯 Pass (${passes.length})</div><div class="sirp-roster-items">${passes.map((p) => `<span class="sirp-roster-item">${escapeHtml(p.name)} <span class="sirp-roster-sub">${escapeHtml(p.formation)}</span></span>`).join("")}</div></div>`;
      }
      if (other.length > 0) {
        html += `<div class="sirp-roster-group"><div class="sirp-roster-heading">Other (${other.length})</div><div class="sirp-roster-items">${other.map((p) => `<span class="sirp-roster-item">${escapeHtml(p.name)} <span class="sirp-roster-sub">${escapeHtml(p.formation)}</span></span>`).join("")}</div></div>`;
      }
      html += `</div></div>`;
    }

    html += `
      <div class="sirp-footer">Generated by BC Offense · ${dateStr}</div>
    </div>`;

    content.innerHTML = html;
    container.classList.remove("hidden");
    document.body.dataset.printMode = "install";

    setupPrintPageStyle(
      "@media print { @page { size: letter portrait; margin: 0.3in; } }",
    );

    setTimeout(() => {
      try {
        const restoreTitle = setPrintTitle("Install-Report");
        window.print();
        restoreTitle();
      } finally {
        container.classList.add("hidden");
        delete document.body.dataset.printMode;
      }
    }, 150);
  } catch (err) {
    console.error("printSmartInstallReport error:", err);
    document.getElementById("installReportPrint")?.classList?.add("hidden");
    delete document.body.dataset.printMode;
    showToast("❌ Error printing install report.", {
      duration: 4000,
      type: "error",
    });
  }
}

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
