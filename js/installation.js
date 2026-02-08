// ============ Installation Tracker ============
// Tracks which offensive components have been installed (taught/repped)
// and provides a readiness rating for each play

const INSTALL_STORAGE_KEY = "installationData";

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
 * @returns {{ installed: Object<string, string[]>, order: Object<string, string[]> }}
 */
function getInstallationData() {
  return storageManager.get(INSTALL_STORAGE_KEY, {
    installed: {},  // { categoryId: ["value1", "value2", ...] }
    order: {},      // { categoryId: ["value1", "value2", ...] } (ordered list)
  });
}

/**
 * Save installation data to localStorage
 */
function saveInstallationData(data) {
  storageManager.set(INSTALL_STORAGE_KEY, data);
}

/**
 * Extract unique values for each component category from the playbook
 * @returns {Object<string, string[]>} - Map of categoryId to sorted unique values
 */
function extractComponentsFromPlaybook() {
  const components = {};

  INSTALL_CATEGORIES.forEach(cat => {
    const values = new Set();

    plays.forEach(p => {
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
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  });

  return components;
}

/**
 * Check if a specific component value is installed
 */
function isComponentInstalled(categoryId, value) {
  const data = getInstallationData();
  const installed = data.installed[categoryId] || [];
  return installed.includes(value);
}

/**
 * Toggle a component's installation status
 */
function toggleComponentInstalled(categoryId, value) {
  const data = getInstallationData();
  if (!data.installed[categoryId]) data.installed[categoryId] = [];

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

  INSTALL_CATEGORIES.forEach(cat => {
    let value = null;

    if (cat.id === "formTag") {
      // Check both formTag1 and formTag2
      const tags = [play.formTag1, play.formTag2].filter(Boolean);
      if (tags.length > 0) {
        const installed = data.installed[cat.id] || [];
        tags.forEach(tag => {
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

/**
 * Initialize the installation page
 */
function initInstallation() {
  renderInstallation();
}

/**
 * Render the full installation page
 */
function renderInstallation() {
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
  const categorySummaries = INSTALL_CATEGORIES.map(cat => {
    const items = components[cat.id] || [];
    const installed = (data.installed[cat.id] || []).filter(v => items.includes(v));
    totalComponents += items.length;
    totalInstalled += installed.length;
    return {
      ...cat,
      total: items.length,
      installed: installed.length,
      pct: items.length > 0 ? Math.round((installed.length / items.length) * 100) : 0,
    };
  }).filter(s => s.total > 0); // Only show categories with items

  const overallPct = totalComponents > 0 ? Math.round((totalInstalled / totalComponents) * 100) : 0;

  // If no active category, default to first
  if (!installActiveCategory && categorySummaries.length > 0) {
    installActiveCategory = categorySummaries[0].id;
  }

  // Calculate playbook readiness
  let fullyInstalled = 0;
  let partiallyInstalled = 0;
  let notInstalled = 0;
  plays.forEach(p => {
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
        <div class="install-readiness-item install-readiness-max">
          <div class="install-readiness-val">${fullyInstalled}</div>
          <div class="install-readiness-label">★ Game Ready</div>
        </div>
        <div class="install-readiness-item install-readiness-partial">
          <div class="install-readiness-val">${partiallyInstalled}</div>
          <div class="install-readiness-label">◐ Partial</div>
        </div>
        <div class="install-readiness-item install-readiness-none">
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
        ${categorySummaries.map(cat => `
          <button class="install-cat-card ${installActiveCategory === cat.id ? 'install-cat-active' : ''}"
                  onclick="installActiveCategory='${cat.id}'; installSearchTerm=''; renderInstallation();">
            <div class="install-cat-icon">${cat.icon}</div>
            <div class="install-cat-info">
              <div class="install-cat-name">${cat.label}</div>
              <div class="install-cat-progress-bar">
                <div class="install-cat-progress-fill" style="width:${cat.pct}%"></div>
              </div>
              <div class="install-cat-counts">${cat.installed}/${cat.total}</div>
            </div>
          </button>
        `).join("")}
      </div>

      <!-- Active Category Detail -->
      ${renderInstallCategoryDetail(components, data)}
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Render the detail panel for the active category
 */
function renderInstallCategoryDetail(components, data) {
  const cat = INSTALL_CATEGORIES.find(c => c.id === installActiveCategory);
  if (!cat) return "";

  const allItems = components[cat.id] || [];
  const installed = data.installed[cat.id] || [];
  const installedCount = installed.filter(v => allItems.includes(v)).length;

  // Filter by search
  const filtered = installSearchTerm
    ? allItems.filter(v => v.toLowerCase().includes(installSearchTerm.toLowerCase()))
    : allItems;

  // Sort: installed first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    const aInstalled = installed.includes(a) ? 0 : 1;
    const bInstalled = installed.includes(b) ? 0 : 1;
    if (aInstalled !== bInstalled) return aInstalled - bInstalled;
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });

  // Count plays per component value
  const playCounts = {};
  plays.forEach(p => {
    if (cat.id === "formTag") {
      [p.formTag1, p.formTag2].filter(Boolean).forEach(t => {
        const key = t.trim();
        playCounts[key] = (playCounts[key] || 0) + 1;
      });
    } else {
      const val = p[cat.field];
      if (val && val.trim()) {
        playCounts[val.trim()] = (playCounts[val.trim()] || 0) + 1;
      }
    }
  });

  return `
    <div class="install-detail">
      <div class="install-detail-header">
        <h3>${cat.icon} ${cat.label} <span class="install-detail-count">${installedCount}/${allItems.length}</span></h3>
        <div class="install-detail-actions">
          <input type="text" class="install-search" placeholder="Search ${cat.label.toLowerCase()}..."
                 value="${installSearchTerm}" oninput="installSearchTerm=this.value; renderInstallation();">
          <button class="btn btn-sm btn-success" onclick="installAll('${cat.id}')" title="Mark all as installed">✅ All</button>
          <button class="btn btn-sm btn-danger" onclick="uninstallAll('${cat.id}')" title="Clear all">✕ Clear</button>
        </div>
      </div>
      <div class="install-checklist">
        ${sorted.map((value, idx) => {
          const isInstalled = installed.includes(value);
          const count = playCounts[value] || 0;
          return `
            <label class="install-item ${isInstalled ? 'install-item-done' : ''}"
                   draggable="true"
                   ondragstart="installDragStart(event, '${cat.id}', '${escapeAttr(value)}')"
                   ondragover="event.preventDefault()"
                   ondrop="installDragDrop(event, '${cat.id}', '${escapeAttr(value)}')">
              <input type="checkbox" ${isInstalled ? "checked" : ""}
                     onchange="toggleComponentInstalled('${cat.id}', '${escapeAttr(value)}'); renderInstallation();">
              <span class="install-item-check">${isInstalled ? "✅" : "⬜"}</span>
              <span class="install-item-name">${value}</span>
              <span class="install-item-count" title="${count} play${count !== 1 ? 's' : ''} use this">${count} play${count !== 1 ? 's' : ''}</span>
              <span class="install-item-drag" title="Drag to reorder">⠿</span>
            </label>`;
        }).join("")}
        ${sorted.length === 0 ? `<div class="install-empty-cat">No ${cat.label.toLowerCase()} found${installSearchTerm ? " matching search" : ""}</div>` : ""}
      </div>
    </div>
  `;
}

/**
 * Escape a value for use in HTML attributes (onclick etc)
 */
function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// ============ Bulk Actions ============

function installAll(categoryId) {
  const components = extractComponentsFromPlaybook();
  const allValues = components[categoryId] || [];
  setAllCategoryInstalled(categoryId, true, allValues);
  renderInstallation();
  showToast(`✅ All ${INSTALL_CATEGORIES.find(c => c.id === categoryId)?.label || ""} marked as installed`);
}

function uninstallAll(categoryId) {
  setAllCategoryInstalled(categoryId, false, []);
  renderInstallation();
  showToast(`Cleared all ${INSTALL_CATEGORIES.find(c => c.id === categoryId)?.label || ""}`);
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
  document.querySelectorAll(".install-dragging").forEach(el => el.classList.remove("install-dragging"));
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

  rating.details.forEach(d => {
    html += `<div class="install-tooltip-row ${d.installed ? 'install-tooltip-done' : 'install-tooltip-missing'}">
      <span>${d.installed ? "✅" : "❌"}</span>
      <span class="install-tooltip-cat">${d.icon} ${d.category}:</span>
      <span class="install-tooltip-val">${d.value}</span>
    </div>`;
  });

  html += `</div></div>`;
  return html;
}
