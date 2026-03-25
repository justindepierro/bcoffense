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

/**
 * Extract unique values for each component category from the playbook
 * @returns {Object<string, string[]>} - Map of categoryId to sorted unique values
 */
function extractComponentsFromPlaybook() {
  try {
    const components = {};
    if (!plays || plays.length === 0) return components;

    INSTALL_CATEGORIES.forEach((cat) => {
      const values = new Set();

      plays.forEach((p) => {
        if (cat.id === "formTag") {
          // Combine formTag1 and formTag2
          if (p.formTag1) values.add(p.formTag1.trim());
          if (p.formTag2) values.add(p.formTag2.trim());
        } else {
          const val = p[cat.field];
          if (val && val.trim()) values.add(val.trim());
        }
      });

      components[cat.id] = [...values].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      );
    });

    return components;
  } catch (err) {
    console.error("extractComponentsFromPlaybook error:", err);
    return {};
  }
}

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
function getSmartBasePlayName(play) {
  const rawBase = (play.basePlay || "").trim();
  const rawName = (play.play || "").trim();
  if (!rawBase && !rawName) return "";

  function normalizeCandidate(str) {
    if (!str) return "";

    // Remove any (...) or [...] segments
    let s = str.replace(/\([^)]*\)/g, " ").replace(/\[[^]]*\]/g, " ");

    // Normalize separators like '/' and '-' into spaces
    s = s.replace(/[\/|-]/g, " ");

    let parts = s.split(/\s+/).filter(Boolean);

    if (parts.length === 0) return "";

    // Strip common leading position tags (single/backfield letters, etc.)
    const leadTagRe = /^(X|Z|Y|F|H|R|L|Q|RB|TB|TE|WR|SL)$/i;
    while (parts.length > 1 && leadTagRe.test(parts[0])) {
      parts.shift();
    }

    // Known taggy words we almost never want as the base concept
    const knownTagWords = new Set([
      "RPO",
      "NAKED",
      "BOOT",
      "KEEP",
      "SHOT",
      "CHECK",
      "ALERT",
      "READ",
      "QK",
      "LT",
      "RT",
      "L",
      "R",
    ]);

    // Strip trailing tag‑like tokens: short all‑caps, digits, or known words
    const tailTagRe = /^[A-Z]{1,3}\d?$/;
    while (parts.length > 1) {
      const last = parts[parts.length - 1];
      if (tailTagRe.test(last) || knownTagWords.has(last.toUpperCase())) {
        parts.pop();
      } else {
        break;
      }
    }

    const cleaned = parts.join(" ").trim();
    return cleaned;
  }

  const baseCandidate = normalizeCandidate(rawBase);
  const nameCandidate = normalizeCandidate(rawName);

  // If we have both, pick the one that best represents the shared core.
  if (baseCandidate && nameCandidate) {
    const b = baseCandidate.toLowerCase();
    const n = nameCandidate.toLowerCase();
    if (n.includes(b)) return baseCandidate; // play name contains base
    if (b.includes(n)) return nameCandidate; // base contains play text
    // Otherwise, prefer the shorter string as the more generic concept
    return baseCandidate.length <= nameCandidate.length
      ? baseCandidate
      : nameCandidate;
  }

  if (baseCandidate) return baseCandidate;
  if (nameCandidate) return nameCandidate;
  return "";
}

/**
 * For a given smart base play name, return all underlying raw Play values
 * that map to it (unique, trimmed strings).
 */
function getRawPlayNamesForBase(baseName) {
  if (!baseName) return [];
  const rawSet = new Set();

  (plays || []).forEach((p) => {
    const raw = (p.play || "").trim();
    if (!raw) return;
    const base = getSmartBasePlayName(p);
    if (base === baseName) rawSet.add(raw);
  });

  return Array.from(rawSet);
}

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
function getPlayInstallRating(play) {
  const data = getInstallationData();
  const details = [];
  let stars = 0;
  let maxStars = 0;

  INSTALL_CATEGORIES.forEach((cat) => {
    let value = null;

    if (cat.id === "formTag") {
      // Check both formTag1 and formTag2
      const tags = [play.formTag1, play.formTag2].filter(Boolean);
      if (tags.length > 0) {
        const installed = data.installed[cat.id] || [];
        tags.forEach((tag) => {
          maxStars++;
          const isInstalled = installed.includes(tag.trim());
          if (isInstalled) stars++;
          details.push({
            category: cat.label,
            icon: cat.icon,
            value: tag.trim(),
            installed: isInstalled,
          });
        });
      }
      return; // Skip the normal check
    }

    value = play[cat.field];
    if (!value || !value.trim()) return; // Skip empty components

    maxStars++;
    const installed = data.installed[cat.id] || [];
    const isInstalled = installed.includes(value.trim());
    if (isInstalled) stars++;

    details.push({
      category: cat.label,
      icon: cat.icon,
      value: value.trim(),
      installed: isInstalled,
    });
  });

  return { stars, maxStars, details };
}

/**
 * Render star rating HTML (video game style)
 * @param {number} stars - Number of filled stars
 * @param {number} maxStars - Total possible stars
 * @param {string} [size='sm'] - Size: 'sm', 'md', 'lg'
 * @returns {string} HTML string
 */
function renderStarRating(stars, maxStars, size = "sm") {
  if (maxStars === 0) return '<span class="install-na">N/A</span>';

  let html = `<span class="install-stars install-stars-${size}" title="${stars}/${maxStars} components installed">`;
  for (let i = 0; i < maxStars; i++) {
    if (i < stars) {
      html += '<span class="install-star filled">★</span>';
    } else {
      html += '<span class="install-star empty">★</span>';
    }
  }
  html += "</span>";
  return html;
}

/**
 * Get CSS class for star rating level
 */
function getInstallRatingClass(stars, maxStars) {
  if (maxStars === 0) return "install-level-na";
  const pct = (stars / maxStars) * 100;
  if (pct === 100) return "install-level-max";
  if (pct >= 80) return "install-level-high";
  if (pct >= 50) return "install-level-mid";
  if (pct >= 20) return "install-level-low";
  return "install-level-none";
}

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
function renderInstallation() {
  try {
    _installDataCache = null; // refresh from storage on each render
    const container = document.getElementById("installationContent");
    if (!container) return;

    const components = extractComponentsFromPlaybook();
    const data = getInstallationData();

    // If no playbook loaded
    if (!plays || plays.length === 0) {
      container.innerHTML = `
      <div class="install-empty">
        <h3>📦 No playbook loaded</h3>
        <p>Upload a playbook CSV first — the Installation page will automatically extract all your components.</p>
      </div>`;
      return;
    }

    // Calculate overall progress
    let totalComponents = 0;
    let totalInstalled = 0;
    const categorySummaries = INSTALL_CATEGORIES.map((cat) => {
      const items = components[cat.id] || [];
      const installed = (data.installed[cat.id] || []).filter((v) =>
        items.includes(v),
      );
      totalComponents += items.length;
      totalInstalled += installed.length;
      return {
        ...cat,
        total: items.length,
        installed: installed.length,
        pct:
          items.length > 0
            ? Math.round((installed.length / items.length) * 100)
            : 0,
      };
    }).filter((s) => s.total > 0); // Only show categories with items

    const overallPct =
      totalComponents > 0
        ? Math.round((totalInstalled / totalComponents) * 100)
        : 0;

    // If no active category, default to first
    if (!installActiveCategory && categorySummaries.length > 0) {
      installActiveCategory = categorySummaries[0].id;
    }

    // Calculate playbook readiness
    let fullyInstalled = 0;
    let partiallyInstalled = 0;
    let notInstalled = 0;
    plays.forEach((p) => {
      const rating = getPlayInstallRating(p);
      if (rating.maxStars === 0) return;
      if (rating.stars === rating.maxStars) fullyInstalled++;
      else if (rating.stars > 0) partiallyInstalled++;
      else notInstalled++;
    });

    // Build HTML
    let html = `
    <div class="install-container">
      <!-- Overall Progress Header -->
      <div class="install-header">
        <div class="install-header-left">
          <h2 class="install-title">📦 Offensive Installation</h2>
          <p class="install-subtitle">Track what you've taught — see what's game-ready</p>
        </div>
        <div class="install-header-right">
          <button class="btn btn-primary sir-btn" data-action="showSmartInstallReport" title="Smart Installation Report">🧠 Smart Report</button>
          <div class="install-overall-progress">
            <div class="install-overall-ring" style="--pct:${overallPct}">
              <span class="install-overall-pct">${overallPct}%</span>
            </div>
            <div class="install-overall-label">Overall Installed</div>
          </div>
        </div>
      </div>

      <!-- Playbook Readiness Summary -->
      <div class="install-readiness">
        <div class="install-readiness-item install-readiness-max install-readiness-clickable" data-action="showReadinessModal" data-arg="ready">
          <div class="install-readiness-val">${fullyInstalled}</div>
          <div class="install-readiness-label">★ Game Ready</div>
        </div>
        <div class="install-readiness-item install-readiness-partial install-readiness-clickable" data-action="showReadinessModal" data-arg="partial">
          <div class="install-readiness-val">${partiallyInstalled}</div>
          <div class="install-readiness-label">◐ Partial</div>
        </div>
        <div class="install-readiness-item install-readiness-none install-readiness-clickable" data-action="showReadinessModal" data-arg="none">
          <div class="install-readiness-val">${notInstalled}</div>
          <div class="install-readiness-label">○ Not Ready</div>
        </div>
        <div class="install-readiness-item">
          <div class="install-readiness-val">${plays.length}</div>
          <div class="install-readiness-label">Total Plays</div>
        </div>
      </div>

      <!-- Category Navigation Cards -->
      <div class="install-category-grid">
        ${categorySummaries
          .map(
            (cat) => `
          <button class="install-cat-card ${installActiveCategory === cat.id ? "install-cat-active" : ""}"
                  data-action="selectInstallCategory" data-arg="${cat.id}">
            <div class="install-cat-icon">${cat.icon}</div>
            <div class="install-cat-info">
              <div class="install-cat-name">${cat.label}</div>
              <div class="install-cat-progress-bar">
                <div class="install-cat-progress-fill" style="width:${cat.pct}%"></div>
              </div>
              <div class="install-cat-counts">${cat.installed}/${cat.total}</div>
            </div>
          </button>
        `,
          )
          .join("")}
      </div>

      <!-- Active Category Detail -->
      ${renderInstallCategoryDetail(components, data)}
    </div>
  `;

    container.innerHTML = html;
  } catch (err) {
    console.error("renderInstallation error:", err);
    showToast("❌ Error rendering installation.", 3000);
  }
}

/**
 * Render the detail panel for the active category
 */
function renderInstallCategoryDetail(components, data) {
  const cat = INSTALL_CATEGORIES.find((c) => c.id === installActiveCategory);
  if (!cat) return "";
  const isSmartPlayMode = cat.id === "play" && installSmartBasePlays;

  let allItems;
  let installed;
  let installedCount;
  let playCounts = {};
  let groupInstalledMap = {};

  if (isSmartPlayMode) {
    // Build base-concept groups from the plays array
    const baseInfo = new Map(); // baseName -> { count, rawSet }
    (plays || []).forEach((p) => {
      const raw = (p.play || "").trim();
      if (!raw) return;
      const base = getSmartBasePlayName(p);
      if (!base) return;
      let info = baseInfo.get(base);
      if (!info) {
        info = { count: 0, rawSet: new Set() };
        baseInfo.set(base, info);
      }
      info.count += 1;
      info.rawSet.add(raw);
    });

    const installedRaw = (data.installed[cat.id] || []).map((v) => v.trim());
    const installedSet = new Set(installedRaw.filter(Boolean));

    playCounts = {};
    groupInstalledMap = {};
    baseInfo.forEach((info, base) => {
      playCounts[base] = info.count;
      const allInstalled = Array.from(info.rawSet).every((raw) =>
        installedSet.has(raw),
      );
      groupInstalledMap[base] = allInstalled;
    });

    allItems = Array.from(baseInfo.keys()).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
    installed = allItems.filter((name) => groupInstalledMap[name]);
    installedCount = installed.length;
  } else {
    allItems = components[cat.id] || [];
    installed = data.installed[cat.id] || [];
    installedCount = installed.filter((v) => allItems.includes(v)).length;

    // Count plays per component value
    plays.forEach((p) => {
      if (cat.id === "formTag") {
        [p.formTag1, p.formTag2].filter(Boolean).forEach((t) => {
          const key = t.trim();
          playCounts[key] = (playCounts[key] || 0) + 1;
        });
      } else {
        const val = p[cat.field];
        if (val && val.trim()) {
          const key = val.trim();
          playCounts[key] = (playCounts[key] || 0) + 1;
        }
      }
    });
  }

  // Filter by search
  const filtered = installSearchTerm
    ? allItems.filter((v) =>
        v.toLowerCase().includes(installSearchTerm.toLowerCase()),
      )
    : allItems;

  // Sort: installed first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    if (isSmartPlayMode) {
      const aInstalled = groupInstalledMap[a] ? 0 : 1;
      const bInstalled = groupInstalledMap[b] ? 0 : 1;
      if (aInstalled !== bInstalled) return aInstalled - bInstalled;
      return a.toLowerCase().localeCompare(b.toLowerCase());
    }
    const aInstalled = installed.includes(a) ? 0 : 1;
    const bInstalled = installed.includes(b) ? 0 : 1;
    if (aInstalled !== bInstalled) return aInstalled - bInstalled;
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });

  return `
    <div class="install-detail">
      <div class="install-detail-header">
        <h3>${cat.icon} ${cat.label} <span class="install-detail-count">${installedCount}/${allItems.length}</span></h3>
        <div class="install-detail-actions">
          <input type="text" class="install-search" placeholder="Search ${cat.label.toLowerCase()}..."
                 value="${installSearchTerm}" data-oninput="installSearch" data-pass="value">
          ${
            cat.id === "play"
              ? `<label class="install-smart-toggle" title="Group play variations by base concept">
                  <input type="checkbox" ${installSmartBasePlays ? "checked" : ""}
                         data-onchange="toggleSmartBasePlays">
                  <span>Smart base plays</span>
                 </label>`
              : ""
          }
          <button class="btn btn-sm btn-success" data-action="installAll" data-arg="${cat.id}" title="Mark all as installed">✅ All</button>
          <button class="btn btn-sm btn-danger" data-action="uninstallAll" data-arg="${cat.id}" title="Clear all">✕ Clear</button>
        </div>
      </div>
      <div class="install-checklist">
        ${sorted
          .map((value, idx) => {
            const isInstalled = isSmartPlayMode
              ? !!groupInstalledMap[value]
              : installed.includes(value);
            const count = playCounts[value] || 0;
            return `
            <label class="install-item ${isInstalled ? "install-item-done" : ""}"
                   draggable="true"
                   data-drag="installItem" data-cat="${cat.id}" data-val="${escapeAttr(value)}">
              <input type="checkbox" ${isInstalled ? "checked" : ""}
                     data-onchange="installToggleItem" data-cat="${cat.id}" data-val="${escapeAttr(value)}">
              <span class="install-item-check">${isInstalled ? "✅" : "⬜"}</span>
              <span class="install-item-name">${value}</span>
              <span class="install-item-count" title="${count} play${count !== 1 ? "s" : ""} use this">${count} play${count !== 1 ? "s" : ""}</span>
              <span class="install-item-drag" title="Drag to reorder">⠿</span>
            </label>`;
          })
          .join("")}
        ${sorted.length === 0 ? `<div class="install-empty-cat">No ${cat.label.toLowerCase()} found${installSearchTerm ? " matching search" : ""}</div>` : ""}
      </div>
    </div>
  `;
}

/**
 * Escape a value for use in HTML attributes (onclick etc)
 */
function escapeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;")
    .replace(/`/g, "&#96;");
}

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
function showReadinessModal(type) {
  try {
    if (!plays || plays.length === 0) return;

    const titles = {
      ready: { title: "★ Game Ready Plays", icon: "★" },
      partial: { title: "◐ Partially Installed", icon: "◐" },
      none: { title: "○ Not Ready", icon: "○" },
    };

    // Collect plays matching this readiness level
    const matched = [];
    plays.forEach((p) => {
      const rating = getPlayInstallRating(p);
      if (rating.maxStars === 0) return;
      const isReady = rating.stars === rating.maxStars;
      const isPartial = rating.stars > 0 && rating.stars < rating.maxStars;
      const isNone = rating.stars === 0;

      if (type === "ready" && isReady) matched.push({ play: p, rating });
      if (type === "partial" && isPartial) matched.push({ play: p, rating });
      if (type === "none" && isNone) matched.push({ play: p, rating });
    });

    if (matched.length === 0) {
      showModal("No plays in this category.", titles[type]);
      return;
    }

    // Sort: by stars desc, then play name
    matched.sort((a, b) => {
      const diff = b.rating.stars - a.rating.stars;
      if (diff !== 0) return diff;
      const nameA = (a.play.play || a.play.basePlay || "").toLowerCase();
      const nameB = (b.play.play || b.play.basePlay || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

    let html = `<div class="readiness-modal-list">`;

    matched.forEach(({ play, rating }) => {
      const playName = play.play || play.basePlay || "Unnamed";
      const formation = play.formation || "";
      const personnel = play.personnel || "";
      const subtitle = [personnel, formation].filter(Boolean).join(" · ");
      const level = getInstallRatingClass(rating.stars, rating.maxStars);

      html += `<div class="readiness-modal-play ${level}">`;
      html += `  <div class="readiness-modal-play-header">`;
      html += `    <div class="readiness-modal-play-name">${playName}</div>`;
      html += `    <div class="readiness-modal-play-stars">${renderStarRating(rating.stars, rating.maxStars, "sm")}</div>`;
      html += `  </div>`;
      if (subtitle) {
        html += `<div class="readiness-modal-play-sub">${subtitle}</div>`;
      }

      // For partial and not-ready, show missing components
      if (type !== "ready") {
        const missing = rating.details.filter((d) => !d.installed);
        if (missing.length > 0) {
          html += `<div class="readiness-modal-missing">`;
          missing.forEach((d) => {
            html += `<div class="readiness-modal-missing-row">❌ <span class="readiness-modal-cat">${d.icon} ${d.category}:</span> <span class="readiness-modal-val">${d.value}</span></div>`;
          });
          html += `</div>`;
        }
      }

      html += `</div>`;
    });

    html += `</div>`;

    showModal(html, { ...titles[type] });
  } catch (err) {
    console.error("showReadinessModal error:", err);
    showToast("❌ Error showing readiness report.", 3000);
  }
}

// ============ Playbook Integration ============

/**
 * Get the star badge HTML for a play (used in playbook table rows)
 */
function getPlayStarBadge(play) {
  const rating = getPlayInstallRating(play);
  if (rating.maxStars === 0) return "";

  const level = getInstallRatingClass(rating.stars, rating.maxStars);
  return `<span class="install-badge ${level}" title="${rating.stars}/${rating.maxStars} installed">${renderStarRating(rating.stars, rating.maxStars, "sm")}</span>`;
}

/**
 * Get detailed install tooltip HTML for a play (used in playbook hover preview)
 */
function getPlayInstallTooltip(play) {
  const rating = getPlayInstallRating(play);
  if (rating.maxStars === 0) return "";

  let html = `<div class="install-tooltip-section">
    <div class="install-tooltip-title">📦 Installation ${renderStarRating(rating.stars, rating.maxStars, "md")}</div>
    <div class="install-tooltip-details">`;

  rating.details.forEach((d) => {
    html += `<div class="install-tooltip-row ${d.installed ? "install-tooltip-done" : "install-tooltip-missing"}">
      <span>${d.installed ? "✅" : "❌"}</span>
      <span class="install-tooltip-cat">${d.icon} ${d.category}:</span>
      <span class="install-tooltip-val">${d.value}</span>
    </div>`;
  });

  html += `</div></div>`;
  return html;
}
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
            <div class="sir-bar-fill sir-bar-run" style="width:${runReadyPct}%"></div>
          </div>
          <div class="sir-balance-nums">${balance.readyRuns}/${balance.totalRuns} (${runReadyPct}%)</div>
        </div>
        <div class="sir-balance-bar">
          <div class="sir-balance-label">Pass Ready</div>
          <div class="sir-bar-track">
            <div class="sir-bar-fill sir-bar-pass" style="width:${passReadyPct}%"></div>
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
          ${
            gameReadyAnalysis &&
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
                <div class="sir-bar-fill sir-bar-gap" style="width:${g.pct}%"></div>
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
          <span class="sirp-balance-bar-wrap"><span class="sirp-balance-fill sirp-fill-run" style="width:${runReadyPct}%"></span></span>
          <span class="sirp-balance-val">${balance.readyRuns}/${balance.totalRuns} (${runReadyPct}%)</span>
        </div>
        <div class="sirp-balance-item">
          <span class="sirp-balance-label">Pass Ready:</span>
          <span class="sirp-balance-bar-wrap"><span class="sirp-balance-fill sirp-fill-pass" style="width:${passReadyPct}%"></span></span>
          <span class="sirp-balance-val">${balance.readyPasses}/${balance.totalPasses} (${passReadyPct}%)</span>
        </div>
      </div>`;

  // ── Touch Distribution (Print) ──
  if (typeof computeTouchAnalysis === "function" && plays && plays.length > 0) {
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
            <div class="sirp-section-subtitle" style="margin-top:8px;font-weight:600;font-size:0.82rem;">Game Ready Only</div>
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
    const runs = report.gameReadySummary.plays.filter((p) => p.type === "Run");
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

  setTimeout(() => {
    const restoreTitle = setPrintTitle("Install-Report");
    window.print();
    restoreTitle();
    container.classList.add("hidden");
    delete document.body.dataset.printMode;
  }, 150);
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
function installToggleItem() {
  const cat = this.dataset ? this.dataset.cat : null;
  const val = this.dataset ? this.dataset.val : null;
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
  const container = document.getElementById("installationContainer");
  if (!container) return;

  // ── Change delegation for install checkboxes ──
  container.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-onchange='installToggleItem']");
    if (cb) {
      toggleComponentInstalled(cb.dataset.cat, cb.dataset.val);
      renderInstallation();
      return;
    }
  });

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
