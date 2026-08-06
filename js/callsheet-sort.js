// Call Sheet Sort Logic
// Owns: `CS_SORT_FIELDS`, `csSortCriteria`, `openCsSortModal`,
// `renderCsSortCriteria`, `addCsSortCriteria`, `removeCsSortCriteria`,
// `openCsCustomOrderModal`, `applyCsSort`, `sortPlaysByCriteria`.
// Depends on: callsheet.js globals (callSheet, callSheetSettings, CALLSHEET_CATEGORIES,
//             getCallSheetCategoriesForPage, getCategoryDisplayName, csCategoryOrder,
//             saveCallSheet, renderCallSheet)
//             utils.js (showToast, showReorderModal, trapFocus)

// ============ Sort fields and state ============

const CS_SORT_FIELDS = [
  { value: "personnel", label: "Personnel" },
  { value: "type", label: "Play Type" },
  { value: "tempo", label: "Tempo" },
  { value: "formation", label: "Formation" },
  { value: "basePlay", label: "Base Play" },
  { value: "play", label: "Play Name" },
  { value: "back", label: "Back" },
  { value: "protection", label: "Protection" },
];

let csSortCriteria = [{ field: "personnel", direction: "asc" }];
let csSortCustomOrders = {};
let csSortDraggedIdx = null;

/**
 * Get unique values for a sort field from the call sheet plays
 */
function getCsSortUniqueValues(field, categoryId) {
  const values = new Set();
  const categoriesToScan = categoryId ? [categoryId] : Object.keys(callSheet);

  categoriesToScan.forEach((catId) => {
    const data = callSheet[catId];
    if (!data) return;
    [...(data.left || []), ...(data.right || [])].forEach((play) => {
      if (play && play[field]) {
        values.add(String(play[field]).trim());
      }
    });
  });
  return Array.from(values).sort();
}

/**
 * Compare two values using custom order if available
 */
function csSortCompare(valA, valB, field, direction) {
  const customOrder = csSortCustomOrders[field];

  if (customOrder && customOrder.length > 0) {
    let idxA = customOrder.indexOf(valA);
    let idxB = customOrder.indexOf(valB);
    if (idxA === -1) idxA = customOrder.length + 1;
    if (idxB === -1) idxB = customOrder.length + 1;
    let cmp = idxA - idxB;
    if (direction === "desc") cmp = -cmp;
    return cmp;
  } else {
    const a = String(valA || "").toLowerCase();
    const b = String(valB || "").toLowerCase();
    let cmp = a.localeCompare(b, undefined, { numeric: true });
    if (direction === "desc") cmp = -cmp;
    return cmp;
  }
}

/**
 * Open the call sheet sort modal
 */
function openCsSortModal(categoryId) {
  closeCsSortModal({ returnFocus: false });
  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === categoryId);
  const displayName = cat ? getCategoryDisplayName(cat) : categoryId;

  // Reset criteria to default if empty
  if (csSortCriteria.length === 0) {
    csSortCriteria = [{ field: "personnel", direction: "asc" }];
  }

  const modalHtml = `
    <div id="csSortOverlay" class="cs-sort-overlay">
      <div class="cs-sort-modal" role="dialog" aria-modal="true" aria-labelledby="csSortTitle">
        <div class="cs-sort-header">
          <h3 id="csSortTitle">⇅ Sort Plays</h3>
          <button class="cs-sort-close" data-action="closeCsSortModal" aria-label="Close sort modal">&times;</button>
        </div>

        <div class="cs-sort-body">
          <p class="cs-sort-desc">Drag to reorder priority. Top criteria sorts first.</p>

          <div id="csSortCriteriaList" class="cs-sort-criteria-list"></div>

          <button class="btn btn-sm cs-sort-add-btn" data-action="addCsSortCriteria">
            + Add Sort Field
          </button>

          <div class="cs-sort-scope">
            <label class="cs-sort-scope-label"><strong>Apply to:</strong></label>
            <div class="cs-sort-scope-options">
              <label class="cs-sort-radio">
                <input type="radio" name="csSortScope" value="category" checked>
                This category only <span class="cs-sort-scope-name">(${displayName})</span>
              </label>
              <label class="cs-sort-radio">
                <input type="radio" name="csSortScope" value="page">
                All categories on current page
              </label>
              <label class="cs-sort-radio">
                <input type="radio" name="csSortScope" value="all">
                All categories (front + back)
              </label>
            </div>
          </div>

          <div class="cs-sort-hash-option">
            <label>
              <input type="checkbox" id="csSortIndependently" checked>
              Sort left &amp; right hashes independently
            </label>
            <p class="cs-sort-hash-hint">Uncheck to merge both hashes, sort together, then redistribute evenly.</p>
          </div>
        </div>

        <div class="cs-sort-actions">
          <button class="btn btn-primary btn-sm" data-action="applyCsSort" data-arg="${categoryId}">
            ✅ Apply Sort
          </button>
          <button class="btn btn-sm" data-action="closeCsSortModal">Cancel</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  const overlay = document.getElementById("csSortOverlay");
  // backdrop close
  overlay?.addEventListener("click", (e) => {
    if (e.target.id === "csSortOverlay") closeCsSortModal();
  });
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "csSortOverlay",
      scrollElement: overlay?.querySelector(".cs-sort-modal") || overlay,
      blocking: true,
      onEscape: () => closeCsSortModal(),
    });
  } else if (overlay && typeof trapFocus === "function") {
    trapFocus(overlay);
  }
  overlay?.querySelector(".cs-sort-close")?.focus();
  renderCsSortCriteria();
}

/**
 * Close the sort modal
 */
function closeCsSortModal(options = {}) {
  if (typeof closeLayer === "function") closeLayer("csSortOverlay", options);
  const overlay = document.getElementById("csSortOverlay");
  if (overlay) overlay.remove();
}

/**
 * Render sort criteria items in the modal
 */
function renderCsSortCriteria() {
  const container = document.getElementById("csSortCriteriaList");
  if (!container) return;

  container.innerHTML = csSortCriteria
    .map((criteria, idx) => {
      const fieldOptions = CS_SORT_FIELDS.map(
        (f) =>
          `<option value="${f.value}" ${criteria.field === f.value ? "selected" : ""}>${f.label}</option>`,
      ).join("");

      const dirIcon = criteria.direction === "asc" ? "↑" : "↓";
      const dirTitle =
        criteria.direction === "asc" ? "Ascending (A→Z)" : "Descending (Z→A)";

      const hasCustom =
        csSortCustomOrders[criteria.field] &&
        csSortCustomOrders[criteria.field].length > 0;
      const customIcon = hasCustom ? "🎨" : "⚙️";
      const customTitle = hasCustom
        ? "Custom order set — click to edit"
        : "Set custom value order";

      return `
        <div class="cs-sort-criteria-item" draggable="true" data-idx="${idx}"
             data-drag="csSortDrag">
          <span class="drag-handle">☰</span>
          <label class="sr-only" for="csSortField-${idx}">Sort field ${idx + 1}</label>
          <select id="csSortField-${idx}" name="sortField-${idx}" data-onchange="updateCsSortField" data-key="${idx}" data-pass="value">${fieldOptions}</select>
          <button class="sort-dir-btn" data-action="toggleCsSortDirection" data-idx="${idx}" title="${dirTitle}">${dirIcon}</button>
          <button class="custom-order-btn custom-order-btn-compact" data-action="openCsCustomOrderModal" data-arg="${criteria.field}" title="${customTitle}">${customIcon}</button>
          <button class="remove-sort-btn" data-action="removeCsSortCriteria" data-idx="${idx}">✕</button>
        </div>
      `;
    })
    .join("");
}

/**
 * Add a sort criteria
 */
function addCsSortCriteria() {
  const usedFields = csSortCriteria.map((c) => c.field);
  const available = CS_SORT_FIELDS.find((f) => !usedFields.includes(f.value));
  if (available) {
    csSortCriteria.push({ field: available.value, direction: "asc" });
    renderCsSortCriteria();
  } else {
    showToast("All sort fields are already in use");
  }
}

/**
 * Remove a sort criteria
 */
function removeCsSortCriteria(idx) {
  if (csSortCriteria.length <= 1) {
    showToast("Must have at least one sort field");
    return;
  }
  csSortCriteria.splice(idx, 1);
  renderCsSortCriteria();
}

/**
 * Update sort field at index
 */
function updateCsSortField(idx, newField) {
  csSortCriteria[idx].field = newField;
  renderCsSortCriteria();
}

/**
 * Toggle direction
 */
function toggleCsSortDirection(idx) {
  csSortCriteria[idx].direction =
    csSortCriteria[idx].direction === "asc" ? "desc" : "asc";
  renderCsSortCriteria();
}

// Drag handlers for sort criteria reordering
function handleCsSortDragStart(event, idx) {
  csSortDraggedIdx = idx;
  event.target.classList.add("dragging");
}
function handleCsSortDragOver(event) {
  event.preventDefault();
}
function handleCsSortDrop(event, targetIdx) {
  event.preventDefault();
  if (csSortDraggedIdx === null || csSortDraggedIdx === targetIdx) return;
  const moved = csSortCriteria.splice(csSortDraggedIdx, 1)[0];
  csSortCriteria.splice(targetIdx, 0, moved);
  renderCsSortCriteria();
}
function handleCsSortDragEnd(event) {
  event.target.classList.remove("dragging");
  csSortDraggedIdx = null;
}

// ============ Custom Order Modal (Call Sheet) ============

function openCsCustomOrderModal(field) {
  const fieldLabel =
    CS_SORT_FIELDS.find((f) => f.value === field)?.label || field;
  const uniqueValues = getCsSortUniqueValues(field);

  if (uniqueValues.length === 0) {
    showToast(`No values found for "${fieldLabel}" — add plays first`);
    return;
  }

  let orderedValues = csSortCustomOrders[field] || [];
  uniqueValues.forEach((val) => {
    if (!orderedValues.includes(val)) orderedValues.push(val);
  });
  orderedValues = orderedValues.filter((val) => uniqueValues.includes(val));

  showReorderModal(orderedValues, {
    title: `Custom Order: ${fieldLabel}`,
    onSave(order) {
      csSortCustomOrders[field] = [...order];
      showToast(
        `Custom order saved for ${CS_SORT_FIELDS.find((f) => f.value === field)?.label || field}`,
      );
      renderCsSortCriteria();
    },
    onClear() {
      delete csSortCustomOrders[field];
      showToast("Custom order cleared");
      renderCsSortCriteria();
    },
  });
}

// ============ Apply Sort ============

/**
 * Apply sort to the selected scope
 */
function applyCsSort(originCategoryId) {
  if (csSortCriteria.length === 0) return;

  // Get scope
  const scopeRadio = document.querySelector(
    'input[name="csSortScope"]:checked',
  );
  const scope = scopeRadio ? scopeRadio.value : "category";
  const sortIndependently =
    document.getElementById("csSortIndependently")?.checked ?? true;

  // Determine which category IDs to sort
  let targetCategoryIds = [];
  if (scope === "category") {
    targetCategoryIds = [originCategoryId];
  } else if (scope === "page") {
    const pageCategories = getCallSheetCategoriesForPage(
      callSheetSettings.currentPage,
    );
    targetCategoryIds = pageCategories.map((c) => c.id);
  } else {
    targetCategoryIds = CALLSHEET_CATEGORIES.map((c) => c.id);
  }

  let totalSorted = 0;

  targetCategoryIds.forEach((catId) => {
    const data = callSheet[catId];
    if (!data) return;

    const leftPlays = data.left || [];
    const rightPlays = data.right || [];

    if (leftPlays.length + rightPlays.length === 0) return;

    if (sortIndependently) {
      // Sort each hash column independently
      if (leftPlays.length > 1) {
        data.left = sortPlaysByCriteria(leftPlays);
      }
      if (rightPlays.length > 1) {
        data.right = sortPlaysByCriteria(rightPlays);
      }
    } else {
      // Merge, sort, redistribute evenly
      const merged = [...leftPlays, ...rightPlays];
      const sorted = sortPlaysByCriteria(merged);
      const mid = Math.ceil(sorted.length / 2);
      data.left = sorted.slice(0, mid);
      data.right = sorted.slice(mid);
    }

    totalSorted++;
  });

  // Save and re-render
  saveCallSheet();
  renderCallSheet();

  // Close modal
  closeCsSortModal({ returnFocus: false });

  const scopeLabel =
    scope === "category"
      ? "1 category"
      : scope === "page"
        ? "current page"
        : "all categories";
  showToast(
    `⇅ Sorted ${totalSorted} ${totalSorted === 1 ? "category" : "categories"} (${scopeLabel})`,
  );
}

/**
 * Sort an array of plays using the current sort criteria
 */
function sortPlaysByCriteria(plays) {
  return [...plays].sort((a, b) => {
    for (const criteria of csSortCriteria) {
      const valA = String(a[criteria.field] || "").trim();
      const valB = String(b[criteria.field] || "").trim();
      const cmp = csSortCompare(valA, valB, criteria.field, criteria.direction);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}
