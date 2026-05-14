function getCategoryDisplayName(cat) {
  return callSheetSettings.customNames[cat.id] || cat.name;
}

function getCategoryColor(cat, colorMap = callSheetSettings.customColors) {
  return colorMap?.[cat.id] || cat.color;
}

function editCategoryName(categoryId) {
  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return;

  const currentName = getCategoryDisplayName(cat);
  const headerEl = document.querySelector(
    `.callsheet-category[data-category="${categoryId}"] .category-header`,
  );
  if (!headerEl) return;

  const input = document.createElement("input");
  input.type = "text";
  input.value = currentName;
  input.className = "cs-rename-input";
  input.setAttribute("aria-label", "Rename category");

  const originalHTML = headerEl.innerHTML;
  headerEl.innerHTML = "";
  headerEl.appendChild(input);
  input.focus();
  input.select();

  const finishRename = () => {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      callSheetSettings.customNames[categoryId] = newName;
      saveCallSheetSettings();
      showToast(`✏️ Renamed to "${newName}"`);
    }
    scheduleRenderCallSheet();
  };

  input.addEventListener("blur", finishRename);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }
    if (e.key === "Escape") {
      headerEl.innerHTML = originalHTML;
    }
  });
}

function syncCallSheetCategoryData() {
  CALLSHEET_CATEGORIES.forEach((cat) => {
    if (!callSheet[cat.id]) {
      callSheet[cat.id] = { left: [], right: [] };
    }
  });
}

function slugifyCallSheetCategoryName(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildUniqueCallSheetCategoryId(name) {
  const base = slugifyCallSheetCategoryName(name) || "custom-category";
  let candidate = base;
  let counter = 2;

  while (CALLSHEET_CATEGORIES.some((cat) => cat.id === candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  return candidate;
}

function openAddCallSheetCategoryModal() {
  const modalHtml = `
    <div id="csAddCategoryOverlay" class="cs-sort-overlay">
      <div class="cs-sort-modal cs-sort-modal-md">
        <div class="cs-sort-header">
          <h3>➕ Add Category</h3>
          <button class="cs-sort-close" data-action="closeAddCallSheetCategoryModal">&times;</button>
        </div>
        <div class="cs-sort-body">
          <div class="cs-add-cat-form">
            <label class="cs-add-cat-field">
              <span>Name</span>
              <input id="csAddCategoryName" class="cs-template-name-input" type="text" maxlength="40" placeholder="e.g. Trick Plays" autofocus />
            </label>
            <label class="cs-add-cat-field">
              <span>Page</span>
              <select id="csAddCategoryPage">
                <option value="front">Front</option>
                <option value="back">Back</option>
              </select>
            </label>
            <label class="cs-add-cat-field">
              <span>Header Color</span>
              <select id="csAddCategoryColor">
                ${CS_HEADER_COLOR_OPTIONS.map((option) => `<option value="${option.value}">${option.name}</option>`).join("")}
              </select>
            </label>
          </div>
        </div>
        <div class="cs-sort-actions">
          <button class="btn btn-primary btn-sm" data-action="saveNewCallSheetCategory">Add Category</button>
          <button class="btn btn-sm" data-action="closeAddCallSheetCategoryModal">Cancel</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  const overlay = document.getElementById("csAddCategoryOverlay");
  overlay?.addEventListener("click", (event) => {
    if (event.target.id === "csAddCategoryOverlay") {
      closeAddCallSheetCategoryModal();
    }
  });
  trapFocus(overlay);
  document.getElementById("csAddCategoryName")?.focus();
}

function closeAddCallSheetCategoryModal() {
  document.getElementById("csAddCategoryOverlay")?.remove();
}

function saveNewCallSheetCategory() {
  const name = document.getElementById("csAddCategoryName")?.value.trim();
  const page = document.getElementById("csAddCategoryPage")?.value || "front";
  const color = document.getElementById("csAddCategoryColor")?.value || CS_COLORS.teal;

  if (!name) {
    showToast("⚠️ Enter a category name", { type: "warning" });
    return;
  }

  const newCategory = {
    id: buildUniqueCallSheetCategoryId(name),
    name,
    color,
    manual: true,
    custom: true,
  };

  const customCategories = getCustomCallSheetCategoriesFromSettings();
  customCategories[page].push(newCategory);
  callSheetSettings.customCategories = customCategories;

  rebuildCallSheetCategoryRegistry();
  syncCallSheetCategoryData();
  csCategoryOrder = normalizeCallSheetCategoryOrder({
    ...csCategoryOrder,
    [page]: [...(csCategoryOrder?.[page] || []), newCategory.id],
  });

  saveCallSheetSettings();
  persistCallSheetCategoryOrder();
  saveCallSheet();
  closeAddCallSheetCategoryModal();
  scheduleRenderCallSheet();
  showToast(`➕ Added ${name}`);
}

async function deleteCustomCallSheetCategory(categoryId) {
  const cat = CALLSHEET_CATEGORIES.find((candidate) => candidate.id === categoryId);
  if (!cat?.custom) return;

  const ok = await showConfirm(
    `Delete "${getCategoryDisplayName(cat)}"? Plays in this custom category will be removed from the sheet.`,
    {
      title: "Delete Category",
      icon: "🗑️",
      confirmText: "Delete",
      danger: true,
    },
  );
  if (!ok) return;

  const customCategories = getCustomCallSheetCategoriesFromSettings();
  customCategories.front = customCategories.front.filter((item) => item.id !== categoryId);
  customCategories.back = customCategories.back.filter((item) => item.id !== categoryId);
  callSheetSettings.customCategories = customCategories;

  delete callSheet[categoryId];
  delete callSheetSettings.customNames[categoryId];
  delete callSheetSettings.customColors[categoryId];
  delete csNotes[categoryId];
  delete csTargets[categoryId];
  csCollapsed.delete(categoryId);
  csCategoryOrder = normalizeCallSheetCategoryOrder({
    front: (csCategoryOrder.front || []).filter((id) => id !== categoryId),
    back: (csCategoryOrder.back || []).filter((id) => id !== categoryId),
  });

  rebuildCallSheetCategoryRegistry();
  saveCallSheetSettings();
  persistCallSheetCategoryOrder();
  storageManager.set(STORAGE_KEYS.CALLSHEET_NOTES, csNotes);
  storageManager.set(STORAGE_KEYS.CALLSHEET_TARGETS, csTargets);
  storageManager.set(STORAGE_KEYS.CALLSHEET_COLLAPSED, [...csCollapsed]);
  saveCallSheet();
  scheduleRenderCallSheet();
  showToast("🗑️ Category deleted");
}
