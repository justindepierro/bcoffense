// Installation Render Functions
// Owns: All UI rendering, helper calculations, and display logic

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
 *  - Trailing short all-caps tokens (LT/RT/QK/etc.)
 *  - Parenthetical / bracketed notes anywhere: (RPO), [SHOT], etc.
 *  - Very short all-caps words that commonly behave like tags.
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

    // Strip trailing tag-like tokens: short all-caps, digits, or known words
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
          <div class="install-header-actions">
            <button class="btn btn-sm" data-action="saveInstallationTemplate" title="Save current installation progress as a reusable template">💾 Template</button>
            <button class="btn btn-sm" data-action="openInstallationTemplatesMenu" title="Load or delete saved installation templates">📁 Templates</button>
            <button class="btn btn-primary sir-btn" data-action="showSmartInstallReport" title="Smart Installation Report">🧠 Smart Report</button>
          </div>
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
                <div class="install-cat-progress-fill" style="--bar-width:${cat.pct}%"></div>
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
    showToast("❌ Error rendering installation.", {
      duration: 3000,
      type: "error",
    });
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
                 value="${escapeHtml(installSearchTerm)}" data-oninput="installSearch" data-pass="value">
          ${cat.id === "play"
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
                   data-drag="installItem" data-cat="${cat.id}" data-val="${escapeHtml(value)}">
              <input type="checkbox" ${isInstalled ? "checked" : ""}
                data-onchange="installToggleItem" data-pass="event" data-cat="${cat.id}" data-val="${escapeHtml(value)}">
              <span class="install-item-check">${isInstalled ? "✅" : "⬜"}</span>
              <span class="install-item-name">${escapeHtml(value)}</span>
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
      html += `    <div class="readiness-modal-play-name">${escapeHtml(playName)}</div>`;
      html += `    <div class="readiness-modal-play-stars">${renderStarRating(rating.stars, rating.maxStars, "sm")}</div>`;
      html += `  </div>`;
      if (subtitle) {
        html += `<div class="readiness-modal-play-sub">${escapeHtml(subtitle)}</div>`;
      }

      // For partial and not-ready, show missing components
      if (type !== "ready") {
        const missing = rating.details.filter((d) => !d.installed);
        if (missing.length > 0) {
          html += `<div class="readiness-modal-missing">`;
          missing.forEach((d) => {
            html += `<div class="readiness-modal-missing-row">❌ <span class="readiness-modal-cat">${d.icon} ${d.category}:</span> <span class="readiness-modal-val">${escapeHtml(d.value)}</span></div>`;
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
    showToast("❌ Error showing readiness report.", {
      duration: 3000,
      type: "error",
    });
  }
}

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
      <span class="install-tooltip-val">${escapeHtml(d.value)}</span>
    </div>`;
  });

  html += `</div></div>`;
  return html;
}
