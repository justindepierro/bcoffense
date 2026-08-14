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
// "Filtered" is a workset, not a live query. Recomputing it after each
// metadata write can make rows vanish, appear, or (when empty) fall back to
// the entire playbook. Capture the exact play objects when cleanup begins and
// refresh the underlying Playbook only after the coach closes the tool.
let _catCleanupFilteredSnapshot = null;
let _catCleanupHasPendingPlaybookRender = false;

function _captureCatCleanupFilteredSnapshot() {
  _catCleanupFilteredSnapshot = Array.isArray(filteredPlays)
    ? [...filteredPlays]
    : [];
}

function _persistCatCleanupChanges() {
  storageManager.setPlaybook(plays);
  if (typeof invalidateFilterCache === "function") invalidateFilterCache();
  _catCleanupHasPendingPlaybookRender = true;
}

function _catNormPV(v) {
  if (typeof splitPreferredValues === "function") return splitPreferredValues(v);
  if (!v) return [];
  return String(v).split(/[,|;\/]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
}

function _catCategoryDisplayName(cat) {
  if (typeof getCategoryDisplayName === "function") return getCategoryDisplayName(cat);
  return cat && cat.name ? cat.name : "";
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
    source = Array.isArray(_catCleanupFilteredSnapshot)
      ? _catCleanupFilteredSnapshot
      : [];
  } else if (_catCleanupScope === "gameplan") {
    const boardSigs = typeof getGamePlanBoardSignatures === "function"
      ? getGamePlanBoardSignatures()
      : new Set();
    if (boardSigs.size && typeof _gpPlaySignature === "function") {
      source = plays.filter((p) => boardSigs.has(_gpPlaySignature(p)));
    } else if (typeof getGamePlanTags === "function" && typeof playSignature === "function") {
      const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
      const key = gw?.opponentName || "__unassigned__";
      const tags = getGamePlanTags() || {};
      const sigs = new Set(tags[key] || []);
      source = plays.filter((p) => sigs.has(playSignature(p)));
    } else source = [];
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
  if (_catCleanupScope === "filtered") _captureCatCleanupFilteredSnapshot();
  _catCleanupHasPendingPlaybookRender = false;
  _pbDiscardReportOverlay("playbookCatCleanupOverlay", "playbook-category-cleanup");
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "playbookCatCleanupOverlay";
  overlay.innerHTML = `
    <div class="custom-modal pb-category-cleanup-modal" role="dialog" aria-modal="true" aria-labelledby="catCleanupTitle" style="max-width:960px;width:96vw;">
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
  const closeButton = overlay.querySelector(".modal-close");
  _pbOpenReportLayer(overlay, {
    layerId: "playbook-category-cleanup",
    scrollElement: overlay.querySelector(".cat-cleanup-body") || overlay,
    initialFocus: closeButton || overlay,
    onEscape: (event) => {
      // Category Cleanup has a deliberate two-step Escape behavior: when the
      // search field owns focus, Escape clears its query before the next
      // Escape dismisses the dialog. LayerManager owns capture-phase Escape,
      // so preserve that legacy interaction here rather than letting the
      // dialog close before the search input receives its old handler.
      const search = event?.target;
      if (search?.id === "catCleanupSearch" && search.value) {
        clearPlaybookCategoryCleanupSearch();
        return;
      }
      closePlaybookCategoryCleanup();
    },
  });

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
}

function closePlaybookCategoryCleanup(options = {}) {
  const overlay = document.getElementById("playbookCatCleanupOverlay");
  if (!overlay) return;
  _pbCloseReportLayer(overlay, "playbook-category-cleanup", options);
  if (_catCleanupHasPendingPlaybookRender) {
    _catCleanupHasPendingPlaybookRender = false;
    // One refresh on exit reflects all completed cleanup edits without
    // changing the set being reviewed while the modal is still open.
    if (typeof filterPlays === "function") filterPlays();
    if (typeof renderPlaybook === "function") renderPlaybook();
  }
}

function setPlaybookCategoryCleanupCategory(catId) {
  _catCleanupCategoryId = catId;
  _renderCatCleanupList();
}

function setPlaybookCategoryCleanupScope(scope) {
  if (scope !== "all" && scope !== "filtered" && scope !== "gameplan") return;
  if (scope === "filtered") {
    _captureCatCleanupFilteredSnapshot();
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
    _persistCatCleanupChanges();
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
    _persistCatCleanupChanges();
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
        : _catCleanupScope === "gameplan" ? "No plays are on the active Game Plan board yet."
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
    _persistCatCleanupChanges();
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
