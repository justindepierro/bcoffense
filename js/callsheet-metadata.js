function editCategoryNote(categoryId) {
  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return;

  const current = csNotes[categoryId] || "";
  const catEl = document.querySelector(
    `.callsheet-category[data-category="${categoryId}"]`,
  );
  if (!catEl) return;

  let noteEl = catEl.querySelector(".cs-cat-note");
  if (!noteEl) {
    noteEl = document.createElement("div");
    noteEl.className = "cs-cat-note";
    const header = catEl.querySelector(".category-header");
    header.after(noteEl);
  }

  const input = document.createElement("input");
  input.type = "text";
  input.value = current;
  input.className = "cs-note-input";
  input.placeholder = "Add a note...";

  noteEl.innerHTML = "";
  noteEl.appendChild(input);
  input.focus();
  input.select();

  const finish = () => {
    const val = input.value.trim();
    if (val) {
      csNotes[categoryId] = val;
    } else {
      delete csNotes[categoryId];
    }
    storageManager.set(STORAGE_KEYS.CALLSHEET_NOTES, csNotes);
    scheduleRenderCallSheet();
  };

  input.addEventListener("blur", finish);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }
    if (e.key === "Escape") {
      scheduleRenderCallSheet();
    }
  });
}

function setCategoryTarget(categoryId) {
  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return;
  const current = csTargets[categoryId] || "";

  const overlay = document.createElement("div");
  overlay.className = "cs-target-popup";
  overlay.innerHTML = `
    <label>Target play count for <strong>${escapeHtml(getCategoryDisplayName(cat))}</strong>:</label>
    <input type="number" min="0" max="50" value="${current}" class="cs-target-input" placeholder="e.g. 6">
    <div class="cs-target-actions">
      <button class="btn btn-sm btn-primary cs-target-save">Save</button>
      <button class="btn btn-sm cs-target-clear">Clear</button>
      <button class="btn btn-sm cs-target-cancel">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);
  const input = overlay.querySelector("input");
  input.focus();
  input.select();

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onEscKey, true);
    overlay.remove();
  };
  const onOutside = (e) => {
    if (!overlay.contains(e.target)) close();
  };
  const onEscKey = (e) => {
    if (e.key === "Escape") close();
  };
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onEscKey, true);
  }, 0);

  overlay.querySelector(".cs-target-save").addEventListener("click", () => {
    const val = parseInt(input.value, 10);
    if (val > 0) {
      csTargets[categoryId] = val;
    } else {
      delete csTargets[categoryId];
    }
    storageManager.set(STORAGE_KEYS.CALLSHEET_TARGETS, csTargets);
    close();
    scheduleRenderCallSheet();
  });

  overlay.querySelector(".cs-target-clear").addEventListener("click", () => {
    delete csTargets[categoryId];
    storageManager.set(STORAGE_KEYS.CALLSHEET_TARGETS, csTargets);
    close();
    scheduleRenderCallSheet();
  });

  overlay.querySelector(".cs-target-cancel").addEventListener("click", close);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") overlay.querySelector(".cs-target-save").click();
    if (e.key === "Escape") close();
  });
}

function openCategoryMenu(event, categoryId) {
  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return;

  const menu = document.createElement("div");
  menu.className = "cs-context-menu";

  const hasNote = csNotes[categoryId];
  const hasTarget = csTargets[categoryId];
  const blankCount = ["left", "right"].reduce(
    (count, hash) => count + (callSheet[categoryId]?.[hash] || []).filter((play) => play?._blank).length,
    0,
  );

  menu.innerHTML = `
    <button class="cs-ctx-item" data-action="editCategoryNote" data-arg="${categoryId}" data-ctx-close="true">
      ${hasNote ? "✏️ Edit Note" : "📝 Add Note"}
    </button>
    <button class="cs-ctx-item" data-action="setCategoryTarget" data-arg="${categoryId}" data-ctx-close="true">
      ${hasTarget ? "🎯 Edit Target (" + hasTarget + ")" : "🎯 Set Target Count"}
    </button>
    <button class="cs-ctx-item" data-action="editCategoryName" data-arg="${categoryId}" data-ctx-close="true">
      ✏️ Rename
    </button>
    <div class="cs-ctx-divider"></div>
    <button class="cs-ctx-item" data-action="applyCategoryDisplayPreset" data-arg="${categoryId}" data-ctx-close="true">
      🎛️ Apply Display Preset
    </button>
    <button class="cs-ctx-item" data-action="clearCategoryDisplayOverrides" data-arg="${categoryId}" data-ctx-close="true">
      🧹 Clear Side Display Overrides
    </button>
    ${blankCount ? `<button class="cs-ctx-item" data-action="removeCallSheetBlankRows" data-arg="${categoryId}" data-ctx-close="true">↕️ Remove ${blankCount} spacer${blankCount === 1 ? "" : "s"}</button>` : ""}
    ${cat.custom ? `<button class="cs-ctx-item cs-ctx-clear" data-action="deleteCustomCallSheetCategory" data-arg="${categoryId}" data-ctx-close="true">🗑️ Delete Category</button>` : ""}
    <div class="cs-ctx-divider"></div>
    <button class="cs-ctx-item" data-action="clearCategory" data-arg="${categoryId}" data-ctx-close="true">
      🗑️ Clear Category
    </button>
  `;

  showContextMenu(event, menu);
}

function removeCallSheetBlankRows(categoryId) {
  if (!categoryId || !callSheet[categoryId]) return;
  let removed = 0;
  ["left", "right"].forEach((hash) => {
    const list = Array.isArray(callSheet[categoryId][hash]) ? callSheet[categoryId][hash] : [];
    const next = list.filter((play) => !play?._blank);
    removed += list.length - next.length;
    callSheet[categoryId][hash] = next;
  });
  if (!removed) return;
  scheduleRenderCallSheet();
  saveCallSheet();
  showToast(`Removed ${removed} spacer${removed === 1 ? "" : "s"}`);
}

function clearCategory(categoryId) {
  callSheet[categoryId] = { left: [], right: [] };
  scheduleRenderCallSheet();
  saveCallSheet();
  showToast("🗑️ Category cleared");
}
