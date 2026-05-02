let draggedCatId = null;

let csLayoutDraft = null;
let csLayoutDragged = null;
let csLayoutColorDraft = null;
let csLayoutActiveDropKey = null;
let csLayoutPickedCategoryId = null;

function clearCsLayoutActiveDrop() {
  document
    .querySelectorAll(".cs-layout-drop-slot--active")
    .forEach((slot) => slot.classList.remove("cs-layout-drop-slot--active"));
  csLayoutActiveDropKey = null;
}

function getCallSheetLayoutDraftPage(categoryId) {
  if (!csLayoutDraft) return null;
  if (csLayoutDraft.front.includes(categoryId)) return "front";
  if (csLayoutDraft.back.includes(categoryId)) return "back";
  return null;
}

function setCsLayoutActiveDrop(page, beforeCategoryId = "") {
  const nextKey = `${page}:${beforeCategoryId || "end"}`;
  if (csLayoutActiveDropKey === nextKey) return;

  clearCsLayoutActiveDrop();

  const selector = `[data-drop-slot='csLayout'][data-page='${page}'][data-before='${beforeCategoryId}']`;
  const slot = document.querySelector(selector);
  if (slot) {
    slot.classList.add("cs-layout-drop-slot--active");
    csLayoutActiveDropKey = nextKey;
  }
}

function persistCallSheetCategoryOrder() {
  csCategoryOrder = normalizeCallSheetCategoryOrder(csCategoryOrder);
  storageManager.set(STORAGE_KEYS.CALLSHEET_CATEGORY_ORDER, csCategoryOrder);
}

function handleCatDragStart(event, categoryId) {
  if (
    !event.target.closest(".category-header") &&
    event.target.closest(".callsheet-play")
  ) {
    event.stopPropagation();
    return;
  }
  draggedCatId = categoryId;
  event.dataTransfer.effectAllowed = "move";
  setTimeout(() => {
    event.target.classList.add("cs-cat-dragging");
  }, 0);
}

function handleCatDragOver(event) {
  if (!draggedCatId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleCatDrop(event, targetCategoryId) {
  if (!draggedCatId || draggedCatId === targetCategoryId) return;
  event.preventDefault();

  const page = callSheetSettings.currentPage;
  const order = getCallSheetCategoriesForPage(page).map((cat) => cat.id);

  const fromIdx = order.indexOf(draggedCatId);
  const toIdx = order.indexOf(targetCategoryId);
  if (fromIdx === -1 || toIdx === -1) return;

  order.splice(fromIdx, 1);
  order.splice(toIdx, 0, draggedCatId);

  csCategoryOrder[page] = order;
  persistCallSheetCategoryOrder();

  draggedCatId = null;
  renderCallSheet();
}

function handleCatDragEnd(event) {
  event.target.classList.remove("cs-cat-dragging");
  draggedCatId = null;
}

function renderCallSheetLayoutPanel(page) {
  if (!csLayoutDraft) return "";

  const categories = csLayoutDraft[page]
    .map((id) => CALLSHEET_CATEGORIES.find((cat) => cat.id === id))
    .filter(Boolean);
  const orderIndexById = new Map(categories.map((cat, index) => [cat.id, index + 1]));
  const columns = buildCallSheetColumns(categories);

  if (categories.length === 0) {
    return '<div class="cs-layout-empty">Drag categories here</div>';
  }

  return `
    <div class="cs-layout-board-head">
      <span>Col 1</span>
      <span>Col 2</span>
      <span>Col 3</span>
    </div>
    <div class="cs-layout-board" data-drop="csLayoutPage" data-page="${page}">
      ${columns
        .map(
          (column) => `
            <div class="cs-layout-board-column">
              ${column
                .map((cat) => {
                  const otherPage = page === "front" ? "back" : "front";
                  const headerColor = getCategoryColor(cat, csLayoutColorDraft);
                  const textColor = getCategoryHeaderTextColor(headerColor);
                  const isPicked = csLayoutPickedCategoryId === cat.id;
                  const pageIds = csLayoutDraft[page] || [];
                  const pageIndex = pageIds.indexOf(cat.id);
                  const canMoveUp = pageIndex > 0;
                  const canMoveDown = pageIndex !== -1 && pageIndex < pageIds.length - 1;
                  const colorOptions = CS_HEADER_COLOR_OPTIONS.map(
                    (option) =>
                      `<option value="${option.value}" ${option.value === headerColor ? "selected" : ""}>${option.name}</option>`,
                  ).join("");
                  const dropKey = `${page}:${cat.id}`;
                  const dropActive = csLayoutActiveDropKey === dropKey ? " cs-layout-card--drop-target" : "";
                  const placeAction = isPicked
                    ? ""
                    : `<button class="cs-layout-card-place" data-action="placePickedCallSheetCategory" data-arg="${page}|${cat.id}">Place Before</button>`;

                  return `
            <div class="cs-layout-card${isPicked ? " cs-layout-card--picked" : ""}${dropActive}" data-page="${page}" data-category="${cat.id}" data-drop-card="csLayoutCard">
              <div class="cs-layout-card-header" style="background: ${headerColor}; color: ${textColor};">
                <span class="cs-layout-card-handle" draggable="true" data-drag="csLayoutCategory" data-page="${page}" data-category="${cat.id}" title="Drag to reorder">☰</span>
                <span class="cs-layout-card-order">${orderIndexById.get(cat.id) || ""}</span>
                <span class="cs-layout-card-name">${escapeHtml(getCategoryDisplayName(cat))}</span>
              </div>
              <div class="cs-layout-card-meta">
                <div class="cs-layout-card-actions-row">
                  <button class="btn btn-xs cs-layout-pick-btn${isPicked ? " is-active" : ""}" data-action="togglePickCallSheetCategory" data-arg="${cat.id}">
                    ${isPicked ? "Selected" : "Pick Up"}
                  </button>
                  <button class="btn btn-xs cs-layout-nudge-btn" data-action="nudgeCallSheetCategory" data-arg="${cat.id}|up" ${canMoveUp ? "" : "disabled"}>
                    ↑
                  </button>
                  <button class="btn btn-xs cs-layout-nudge-btn" data-action="nudgeCallSheetCategory" data-arg="${cat.id}|down" ${canMoveDown ? "" : "disabled"}>
                    ↓
                  </button>
                </div>
                ${csLayoutPickedCategoryId && !isPicked ? placeAction : ""}
                <label class="cs-layout-color-field">
                  <span>Color</span>
                  <select class="cs-layout-color-select" data-category="${cat.id}">
                    ${colorOptions}
                  </select>
                </label>
                <button class="btn btn-xs cs-layout-page-btn" data-action="moveCallSheetCategoryToPage" data-arg="${cat.id}|${otherPage}">
                  Move to ${otherPage === "front" ? "Front" : "Back"}
                </button>
              </div>
            </div>
          `;
                })
                .join("")}
            </div>
          `,
        )
        .join("")}
    </div>
    <div class="cs-layout-board-end">
      ${csLayoutPickedCategoryId ? `<button class="cs-layout-place-btn" data-action="placePickedCallSheetCategory" data-arg="${page}|">Place At End Of ${page === "front" ? "Front" : "Back"}</button>` : '<span class="cs-layout-end-copy">Order flows top to bottom in each column, then left to right.</span>'}
    </div>
  `;
}

function renderCallSheetLayoutModal() {
  if (!csLayoutDraft) return;

  const frontList = document.getElementById("csLayoutFrontList");
  const backList = document.getElementById("csLayoutBackList");
  const frontCount = document.getElementById("csLayoutFrontCount");
  const backCount = document.getElementById("csLayoutBackCount");

  if (frontList) frontList.innerHTML = renderCallSheetLayoutPanel("front");
  if (backList) backList.innerHTML = renderCallSheetLayoutPanel("back");
  if (frontCount) frontCount.textContent = `${csLayoutDraft.front.length} categories`;
  if (backCount) backCount.textContent = `${csLayoutDraft.back.length} categories`;
}

function openCallSheetLayoutModal() {
  csLayoutDraft = normalizeCallSheetCategoryOrder(csCategoryOrder);
  csLayoutColorDraft = { ...(callSheetSettings.customColors || {}) };
  csLayoutPickedCategoryId = null;

  const modalHtml = `
    <div id="csLayoutOverlay" class="modal-overlay show" data-action="closeCallSheetLayoutModalOverlay">
      <div class="modal-content cs-layout-modal">
        <div class="modal-header cs-layout-modal-header">
          <div>
            <h3>🗂️ Reorder Call Sheet</h3>
            <p class="cs-layout-modal-copy">Use Pick Up + Place Here as the primary layout tool, or drag by the handle if you prefer. You can also nudge categories up or down and move them between front and back.</p>
          </div>
          <button class="cs-sort-close" data-action="closeCallSheetLayoutModal">&times;</button>
        </div>
        <div class="modal-body cs-layout-modal-body">
          <div class="cs-layout-grid">
            <section class="cs-layout-panel" data-drop="csLayoutPage" data-page="front">
              <div class="cs-layout-panel-head">
                <div>
                  <h4>Front Page</h4>
                  <p id="csLayoutFrontCount" class="cs-layout-panel-copy"></p>
                </div>
              </div>
              <div id="csLayoutFrontList" class="cs-layout-list" data-drop="csLayoutPage" data-page="front"></div>
            </section>
            <section class="cs-layout-panel" data-drop="csLayoutPage" data-page="back">
              <div class="cs-layout-panel-head">
                <div>
                  <h4>Back Page</h4>
                  <p id="csLayoutBackCount" class="cs-layout-panel-copy"></p>
                </div>
              </div>
              <div id="csLayoutBackList" class="cs-layout-list" data-drop="csLayoutPage" data-page="back"></div>
            </section>
          </div>
        </div>
        <div class="cs-layout-actions">
          <button class="btn btn-primary btn-sm" data-action="saveCallSheetLayoutModal">Apply Layout</button>
          <button class="btn btn-sm" data-action="resetCallSheetLayoutModal">Reset Default</button>
          <button class="btn btn-sm" data-action="closeCallSheetLayoutModal">Cancel</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  const overlay = document.getElementById("csLayoutOverlay");
  if (!overlay) return;

  overlay.addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-drag='csLayoutCategory']");
    if (!card) return;
    handleCsLayoutDragStart(event, card.dataset.category, card.dataset.page);
  });

  overlay.addEventListener("dragover", (event) => {
    const dropTarget = event.target.closest(
      "[data-drop-card='csLayoutCard'], [data-drop='csLayoutPage']",
    );
    if (!dropTarget) return;
    handleCsLayoutDragOver(event);
  });

  overlay.addEventListener("drop", (event) => {
    const card = event.target.closest("[data-drop-card='csLayoutCard']");
    const panel = event.target.closest("[data-drop='csLayoutPage']");
    if (!card && !panel) return;
    handleCsLayoutDrop(
      event,
      card?.dataset.category || "",
      card?.dataset.page || panel?.dataset.page,
    );
  });

  overlay.addEventListener("dragend", (event) => {
    const card = event.target.closest("[data-drag='csLayoutCategory']");
    if (!card) return;
    handleCsLayoutDragEnd(event);
  });

  overlay.addEventListener("change", (event) => {
    const select = event.target.closest(".cs-layout-color-select");
    if (!select) return;
    setCallSheetLayoutDraftColor(select.dataset.category, select.value);
  });

  renderCallSheetLayoutModal();
}

function closeCallSheetLayoutModal() {
  const overlay = document.getElementById("csLayoutOverlay");
  if (overlay) overlay.remove();
  csLayoutDraft = null;
  csLayoutDragged = null;
  csLayoutColorDraft = null;
  clearCsLayoutActiveDrop();
  csLayoutPickedCategoryId = null;
}

function updateCallSheetLayoutDraft(categoryId, targetPage, beforeCategoryId = null) {
  if (!csLayoutDraft || !targetPage) return;

  ["front", "back"].forEach((page) => {
    csLayoutDraft[page] = csLayoutDraft[page].filter((id) => id !== categoryId);
  });

  const targetList = [...(csLayoutDraft[targetPage] || [])];
  const insertIndex = beforeCategoryId ? targetList.indexOf(beforeCategoryId) : -1;

  if (insertIndex === -1) {
    targetList.push(categoryId);
  } else {
    targetList.splice(insertIndex, 0, categoryId);
  }

  csLayoutDraft[targetPage] = targetList;
}

function moveCallSheetCategoryToPage(arg) {
  const [categoryId, targetPage] = String(arg || "").split("|");
  if (!categoryId || !targetPage || !csLayoutDraft) return;
  updateCallSheetLayoutDraft(categoryId, targetPage);
  if (csLayoutPickedCategoryId === categoryId) {
    csLayoutPickedCategoryId = categoryId;
  }
  renderCallSheetLayoutModal();
}

function togglePickCallSheetCategory(categoryId) {
  if (!categoryId || !csLayoutDraft) return;
  csLayoutPickedCategoryId =
    csLayoutPickedCategoryId === categoryId ? null : categoryId;
  clearCsLayoutActiveDrop();
  renderCallSheetLayoutModal();
}

function placePickedCallSheetCategory(arg) {
  if (!csLayoutPickedCategoryId || !csLayoutDraft) return;
  const [targetPage, beforeCategoryId = ""] = String(arg || "").split("|");
  if (!targetPage) return;

  const pickedPage = getCallSheetLayoutDraftPage(csLayoutPickedCategoryId);
  if (
    beforeCategoryId === csLayoutPickedCategoryId &&
    targetPage === pickedPage
  ) {
    csLayoutPickedCategoryId = null;
    renderCallSheetLayoutModal();
    return;
  }

  updateCallSheetLayoutDraft(
    csLayoutPickedCategoryId,
    targetPage,
    beforeCategoryId || null,
  );
  csLayoutPickedCategoryId = null;
  renderCallSheetLayoutModal();
}

function nudgeCallSheetCategory(arg) {
  const [categoryId, direction] = String(arg || "").split("|");
  const page = getCallSheetLayoutDraftPage(categoryId);
  if (!page || !direction || !csLayoutDraft) return;

  const pageIds = [...(csLayoutDraft[page] || [])];
  const index = pageIds.indexOf(categoryId);
  if (index === -1) return;

  const delta = direction === "up" ? -1 : direction === "down" ? 1 : 0;
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= pageIds.length) return;

  pageIds.splice(index, 1);
  pageIds.splice(nextIndex, 0, categoryId);
  csLayoutDraft[page] = pageIds;
  renderCallSheetLayoutModal();
}

function setCallSheetLayoutDraftColor(categoryId, color) {
  const cat = CALLSHEET_CATEGORIES.find((candidate) => candidate.id === categoryId);
  if (!cat) return;

  if (!csLayoutColorDraft) {
    csLayoutColorDraft = { ...(callSheetSettings.customColors || {}) };
  }

  if (!color || color === cat.color) {
    delete csLayoutColorDraft[categoryId];
  } else {
    csLayoutColorDraft[categoryId] = color;
  }

  renderCallSheetLayoutModal();
}

function resetCallSheetLayoutModal() {
  csLayoutDraft = getDefaultCallSheetCategoryOrder();
  csLayoutColorDraft = { ...(callSheetSettings.customColors || {}) };
  csLayoutPickedCategoryId = null;
  renderCallSheetLayoutModal();
}

function saveCallSheetLayoutModal() {
  if (!csLayoutDraft) return;
  csCategoryOrder = normalizeCallSheetCategoryOrder(csLayoutDraft);
  callSheetSettings.customColors = { ...(csLayoutColorDraft || {}) };
  persistCallSheetCategoryOrder();
  saveCallSheetSettings();
  closeCallSheetLayoutModal();
  renderCallSheet();
  showToast("🗂️ Call sheet layout updated");
}

function handleCsLayoutDragStart(event, categoryId, page) {
  csLayoutDragged = { categoryId, page };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", categoryId);
  event.target.closest(".cs-layout-card")?.classList.add("dragging");
}

function handleCsLayoutDragOver(event) {
  if (!csLayoutDragged) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";

  const card = event.target.closest("[data-drop-card='csLayoutCard']");
  if (card) {
    setCsLayoutActiveDrop(card.dataset.page, card.dataset.category || "");
    return;
  }

  const board = event.target.closest("[data-drop='csLayoutPage']");
  if (board) {
    setCsLayoutActiveDrop(board.dataset.page, "");
  }
}

function handleCsLayoutDrop(event, beforeCategoryId, targetPage) {
  if (!csLayoutDragged || !targetPage) return;
  event.preventDefault();

  if (
    beforeCategoryId === csLayoutDragged.categoryId &&
    targetPage === csLayoutDragged.page
  ) {
    clearCsLayoutActiveDrop();
    return;
  }

  updateCallSheetLayoutDraft(
    csLayoutDragged.categoryId,
    targetPage,
    beforeCategoryId || null,
  );
  csLayoutPickedCategoryId = null;
  clearCsLayoutActiveDrop();
  csLayoutDragged = null;
  renderCallSheetLayoutModal();
}

function handleCsLayoutDragEnd(event) {
  event.target.closest(".cs-layout-card")?.classList.remove("dragging");
  clearCsLayoutActiveDrop();
  csLayoutDragged = null;
}