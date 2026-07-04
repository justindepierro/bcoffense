function _quickSetWbCellBg(cardIdx, cellIdx, color) {
  const key = `${cardIdx}-${cellIdx}`;
  const existing = cellCustomizations[key] || {};
  const custom = { ...existing };
  if (!color) {
    delete custom.bgColor;
    custom.textColor = UI_COLORS.textBlack;
  } else {
    custom.bgColor = color;
    custom.textColor =
      typeof isColorDark === "function" && isColorDark(color)
        ? UI_COLORS.textWhite
        : UI_COLORS.textBlack;
  }
  mutateWristbandState(() => setWristbandCellCustomization(key, custom));
}

function _showWbCellContextMenu(e, cardIdx, cellIdx) {
  const hasPlay = wristbandCards[cardIdx]?.data[cellIdx] !== null;
  const menuItems = [];

  // ── Quick cell colors ──────────────────────────────────────────────────
  // Always show color shortcuts so users can tint a cell in one right-click.
  const QUICK_COLORS = [
    { label: "⬜ Clear color", color: "" },
    { label: "🟡 Yellow", color: "#ffeb3b" },
    { label: "🟠 Orange", color: "#ff9800" },
    { label: "🔴 Red", color: "#f44336" },
    { label: "🟢 Green", color: "#4caf50" },
    { label: "🔵 Blue", color: "#2196f3" },
    { label: "🟣 Purple", color: "#9c27b0" },
  ];
  QUICK_COLORS.forEach(({ label, color }) => {
    menuItems.push({
      label,
      action: () => _quickSetWbCellBg(cardIdx, cellIdx, color),
    });
  });

  // ── Full editor ────────────────────────────────────────────────────────
  menuItems.push({ label: "🎨 Edit Style (popup)…", action: () => openCellPopup(cardIdx, cellIdx, e) });

  if (hasPlay) {
    menuItems.push({ label: "📋 Copy Cell", action: () => copyWbCell(cardIdx, cellIdx) });
  }
  if (copiedCell) {
    menuItems.push({ label: "📌 Paste Cell", action: () => pasteWbCell(cardIdx, cellIdx) });
  }
  if (hasPlay) {
    menuItems.push({ label: "🗑️ Clear Cell", action: () => clearWristbandCell(cardIdx, cellIdx) });
  }

  showContextMenu(e, menuItems);
}

document.addEventListener("DOMContentLoaded", () => {
  _initBatchBarSwatches();

  const grid = document.getElementById("wristbandGrid");
  if (grid) {
    grid.addEventListener("click", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (!cell) {
        if (typeof traceWristbandAction === "function") {
          traceWristbandAction("grid click outside cell", {
            action: "wristbandGridClick",
            targetTag: e.target?.tagName || "",
            targetClassName: String(e.target?.className || "").slice(0, 120),
          });
        }
        return;
      }
      const cardIdx = parseInt(cell.dataset.card, 10);
      const cellIdx = parseInt(cell.dataset.cellIdx, 10);
      if (typeof traceWristbandAction === "function") {
        traceWristbandAction("grid cell click", {
          action: "wristbandGridClick",
          cardIdx,
          cellIdx,
          shiftKey: e.shiftKey,
          selectionMode: wbSelectionMode,
        });
      }

      if (e.shiftKey || wbSelectionMode) {
        e.preventDefault();
        toggleBatchSelect(cardIdx, cellIdx);
        return;
      }

      openCellPopup(cardIdx, cellIdx, e);
    });

    grid.addEventListener("contextmenu", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (!cell) return;
      e.preventDefault();
      const cardIdx = parseInt(cell.dataset.card, 10);
      const cellIdx = parseInt(cell.dataset.cellIdx, 10);
      _showWbCellContextMenu(e, cardIdx, cellIdx);
    });

    grid.addEventListener("dragstart", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (cell) {
        handleCellDragStart(
          e,
          parseInt(cell.dataset.cellIdx, 10),
          parseInt(cell.dataset.card, 10),
        );
      }
    });

    grid.addEventListener("dragover", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (cell) handleCellDragOver(e);
    });

    grid.addEventListener("dragleave", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (cell) handleCellDragLeave(e);
    });

    grid.addEventListener("drop", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (cell) handleCellDrop(e, parseInt(cell.dataset.cellIdx, 10));
    });

    grid.addEventListener("dragend", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (cell) handleCellDragEnd(e);
    });
  }

  document.body.addEventListener("dragstart", (e) => {
    const el = e.target.closest("[data-drag='wbSort']");
    if (el) handleSortDragStart(e, parseInt(el.dataset.idx, 10));
  });
  document.body.addEventListener("dragover", (e) => {
    const el = e.target.closest("[data-drag='wbSort']");
    if (el) handleSortDragOver(e);
  });
  document.body.addEventListener("drop", (e) => {
    const el = e.target.closest("[data-drag='wbSort']");
    if (el) handleSortDrop(e, parseInt(el.dataset.idx, 10));
  });
  document.body.addEventListener("dragend", (e) => {
    const el = e.target.closest("[data-drag='wbSort']");
    if (el) handleSortDragEnd(e);
  });

  const cardTabsEl = document.getElementById("cardTabs");
  if (cardTabsEl) {
    cardTabsEl.addEventListener("dblclick", (e) => {
      const tab = e.target.closest(".card-tab");
      if (tab && tab.dataset.idx !== undefined) {
        renameCard(parseInt(tab.dataset.idx, 10));
      }
    });

    cardTabsEl.addEventListener("contextmenu", (e) => {
      const tab = e.target.closest(".card-tab");
      if (!tab || tab.dataset.idx === undefined) return;
      e.preventDefault();
      const idx = parseInt(tab.dataset.idx, 10);
      showContextMenu(e, [
        { label: "✏️ Rename Card", action: () => renameCard(idx) },
        {
          label: "📝 Edit Description",
          action: () => editCardDescription(idx),
        },
      ]);
    });
  }

  const wbAvailEl = document.getElementById("wbAvailablePlays");
  if (wbAvailEl) {
    wbAvailEl.addEventListener("dblclick", (e) => {
      if (e.target.closest("button")) return;
      const item = e.target.closest("[data-play-idx]");
      if (item) addPlayToNextEmpty(parseInt(item.dataset.playIdx, 10));
    });
  }

  const tabsContainer = document.getElementById("cardTabs");
  if (tabsContainer) {
    tabsContainer.addEventListener("dragover", (e) => {
      if (draggedCellIndex === null) return;
      const tab = e.target.closest(".card-tab");
      if (tab) {
        e.preventDefault();
        tab.classList.add("drag-over");
      }
    });
    tabsContainer.addEventListener("dragleave", (e) => {
      const tab = e.target.closest(".card-tab");
      if (tab) tab.classList.remove("drag-over");
    });
    tabsContainer.addEventListener("drop", (e) => {
      const tab = e.target.closest(".card-tab");
      if (!tab || draggedCellIndex === null) return;
      e.preventDefault();
      tab.classList.remove("drag-over");
      const targetCardIdx = parseInt(tab.dataset.idx, 10);
      const sourceCardIdx = draggedCellCardIdx !== null ? draggedCellCardIdx : currentCardIndex;
      if (targetCardIdx === sourceCardIdx) return;

      const play = wristbandCards[sourceCardIdx].data[draggedCellIndex];
      if (!play) return;

      const emptyIdx = wristbandCards[targetCardIdx].data
        .slice(0, getActiveWristbandCellCount())
        .findIndex((c) => c === null);
      if (emptyIdx === -1) {
        showToast("No empty cells on that card");
        return;
      }

      mutateWristbandState(() => {
        wristbandCards[targetCardIdx].data[emptyIdx] = play;
        wristbandCards[sourceCardIdx].data[draggedCellIndex] = null;
        moveWristbandCellCustomization(
          sourceCardIdx,
          draggedCellIndex,
          targetCardIdx,
          emptyIdx,
        );
        draggedCellIndex = null;
        draggedCellCardIdx = null;
      });
      showToast(`Moved to ${wristbandCards[targetCardIdx].name}`);
    });
  }

  if (grid) {
    grid.addEventListener("keydown", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (!cell) return;
      const cellIdx = parseInt(cell.dataset.cellIdx, 10);
      const cardIdx = parseInt(cell.dataset.card, 10);

      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        e.stopPropagation();
        const selectedCount = selectAllWbCellsOnCurrentCard(grid);
        showToast(`Selected ${selectedCount} cells`);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        e.stopPropagation();
        copyWbCell(cardIdx, cellIdx);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        e.stopPropagation();
        pasteWbCell(cardIdx, cellIdx);
        return;
      }

      if (e.target.matches("select, textarea, input, button")) return;

      const activeCount = getActiveWristbandCellCount();
      let nextCellIdx = null;
      if (e.key === "ArrowLeft") {
        nextCellIdx = wbPlayerCardMode ? cellIdx - 1 : cellIdx - 1;
      } else if (e.key === "ArrowRight") {
        nextCellIdx = wbPlayerCardMode ? cellIdx + 1 : cellIdx + 1;
      } else if (e.key === "ArrowUp") {
        nextCellIdx = cellIdx - (wbPlayerCardMode ? 1 : 2);
      } else if (e.key === "ArrowDown") {
        nextCellIdx = cellIdx + (wbPlayerCardMode ? 1 : 2);
      } else if (e.key === "Home") {
        nextCellIdx = 0;
      } else if (e.key === "End") {
        nextCellIdx = activeCount - 1;
      }

      if (nextCellIdx !== null) {
        e.preventDefault();
        const boundedIdx = Math.max(0, Math.min(activeCount - 1, nextCellIdx));
        grid.querySelector(`[data-cell-idx="${boundedIdx}"]`)?.focus();
        return;
      }

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (wbSelectionMode) {
          toggleBatchSelect(cardIdx, cellIdx);
        } else {
          openCellPopup(cardIdx, cellIdx, e);
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        clearWristbandCell(cardIdx, cellIdx);
        return;
      }

      if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleBatchSelect(cardIdx, cellIdx);
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const play = wristbandCards[cardIdx]?.data[cellIdx];
        if (!play) {
          e.stopPropagation();
          openCellPopup(cardIdx, cellIdx, e);
          setTimeout(() => {
            const searchInput = document.getElementById("cellPlaySearch");
            if (searchInput) {
              searchInput.value = e.key;
              searchInput.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }, 60);
        }
      }
    });
  }

  // Restore color scheme selects from storage
  const _savedPresetId = storageManager.get(STORAGE_KEYS.COLOR_PRESET, "");
  const _wbSel = document.getElementById("wbColorSchemeSelect");
  if (_wbSel) _wbSel.value = _savedPresetId;
  const _scriptSel = document.getElementById("scriptColorSchemeSelect");
  if (_scriptSel) _scriptSel.value = _savedPresetId;
});
