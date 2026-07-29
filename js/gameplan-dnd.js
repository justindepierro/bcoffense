/* =========================================================================
   Game Plan — drag & drop wiring
   Split out of gameplan.js — see AGENTS.md for ownership map.
   ========================================================================= */

let _gpDndWired = false;

// Cache of drop-target row geometry, built once per drag instead of calling
// getBoundingClientRect() for every row on every dragover (~60Hz). Box rows
// don't reflow during a drag (drop indicators are box-shadow only), so the
// cached midpoints stay valid until the pointer leaves the box or the page
// scrolls. Invalidated on scroll and dragend.
let _gpDropRowCache = null;
let _gpDropRowCacheZone = null;

// Cleanup function shared by dragend + drop. CRITICAL: must be called from
// drop *before* any mutation that re-renders the source row, because once
// the source element is detached from the DOM, dragend does NOT bubble to
// document and our document-level cleanup listener never fires -- leaving
// body classes and module state stuck.
function _gpClearDragState() {
  _gpDragPayload = null;
  _gpDragSource = null;
  document.body.classList.remove("gp-dragging-from-library");
  document.body.classList.remove("gp-dragging-from-box");
  document.querySelectorAll(".gp-box.is-drop-target").forEach((b) => b.classList.remove("is-drop-target"));
  document.querySelectorAll(".gp-box-body").forEach((dz) => {
    if (typeof _gpClearDropIndicators === "function") _gpClearDropIndicators(dz);
  });
  const trash = document.getElementById("gpTrashZone");
  if (trash) trash.classList.remove("is-active");
  _gpInvalidateDropRowCache();
}

function _gpWireDnd() {
  if (_gpDndWired) return;
  _gpDndWired = true;

  // Cached drag row geometry is viewport-relative, so any scroll mid-drag
  // invalidates it. Cheap no-op when not dragging (cache is empty).
  window.addEventListener("scroll", () => {
    if (_gpDropRowCacheZone) _gpInvalidateDropRowCache();
  }, { passive: true, capture: true });

  // Diagnostic toggle: append ?gpdebug to URL to enable console tracing.
  const _gpDbg = (() => {
    try { return new URLSearchParams(location.search).has("gpdebug"); }
    catch (_e) { return false; }
  })();
  const _gpLog = _gpDbg ? (...args) => console.log("[gp-dnd]", ...args) : () => { };
  if (_gpDbg) console.log("[gp-dnd] wired (capture-phase delegated)");

  // dragstart -- works for both library rows and box rows.
  // CRITICAL: do NOT perform synchronous DOM mutations (querySelectorAll +
  // class removals across many elements) inside dragstart -- some Chromium
  // versions abort the drag gesture if the layout changes mid-dragstart,
  // resulting in dragstart firing but no ghost image, no dragenter/dragover,
  // and no drop. We only zero the JS module state here; the previous
  // gesture's body classes and indicator classes are cleared by dragend
  // (or by drop's snapshot-then-clear) so they will already be clean by
  // the time the next gesture starts.
  document.addEventListener("dragstart", (e) => {
    const target = e.target;
    if (!target || !target.closest) {
      _gpDragPayload = null;
      _gpDragSource = null;
      return;
    }

    const libRow = target.closest("#gpLibraryList .gp-play-row[draggable='true']");
    if (libRow) {
      const sig = libRow.dataset.sig;
      const sigs = _gpSelected.size > 0 && _gpSelected.has(sig)
        ? Array.from(_gpSelected)
        : [sig];
      _gpDragPayload = { sigs, source: "library" };
      _gpDragSource = null;
      try { e.dataTransfer.setData("text/plain", sigs.join("\n")); } catch (_e) { /* ignore */ }
      e.dataTransfer.effectAllowed = "copyMove";
      // Defer body class -- adding it synchronously inside dragstart causes
      // layout reflow (CSS `body.gp-dragging-from-* .gp-trash-zone` toggles
      // `display`), which Chrome/macOS interprets as a reason to cancel
      // the drag (no dragenter/dragover ever fires).
      setTimeout(() => { document.body.classList.add("gp-dragging-from-library"); }, 0);
      _gpLog("dragstart library", { sig, sigs });
      return;
    }

    const boxRow = target.closest(".gp-box-play[draggable='true']");
    if (boxRow) {
      _gpDragSource = {
        boxId: boxRow.dataset.boxId,
        sig: boxRow.dataset.sig,
        rawIdx: _gpNormalizeBoxPlayIndex(boxRow.dataset.rawIdx),
      };
      _gpDragPayload = null;
      // Defer body class -- see comment above. Synchronous layout changes
      // during dragstart kill the drag on Chrome/macOS.
      setTimeout(() => { document.body.classList.add("gp-dragging-from-box"); }, 0);
      try { e.dataTransfer.setData("text/plain", boxRow.dataset.sig || ""); } catch (_e) { /* ignore */ }
      e.dataTransfer.effectAllowed = "move";
      _gpLog("dragstart box", _gpDragSource);
      return;
    }
    // Non-row target (e.g. user drags some random element). Clear state so
    // we don't leak it into the gesture.
    _gpDragPayload = null;
    _gpDragSource = null;
    _gpLog("dragstart on non-row target", target.tagName, target.className);
  }, true);

  document.addEventListener("dragend", () => {
    _gpClearDragState();
  }, true);

  // dragenter -- highlight target box / trash. We unconditionally
  // preventDefault on game-plan drop zones so the browser allows the drop
  // even if our internal state was somehow lost or never set (e.g. a stray
  // drag from a foreign source dragged into the gameplan area). The drop
  // handler still gates on state before mutating data.
  document.addEventListener("dragenter", (e) => {
    const target = e.target;
    if (!target || !target.closest) return;

    const trash = target.closest("#gpTrashZone");
    if (trash) {
      e.preventDefault();
      if (_gpDragSource) trash.classList.add("is-active");
      return;
    }

    // Allow drops on the entire .gp-box (header included), not just the
    // body. If the body is hidden because the box is collapsed, auto-
    // expand it so the drop zone becomes interactive and the user can
    // see what they're aiming at.
    const box = target.closest(".gp-box");
    if (box) {
      e.preventDefault();
      if (_gpDragPayload || _gpDragSource) {
        if (box.classList.contains("is-collapsed")) {
          box.classList.remove("is-collapsed");
        }
        box.classList.add("is-drop-target");
      }
    }
  }, true);

  // dragover -- MUST preventDefault to allow drop. We unconditionally
  // preventDefault on game-plan drop zones (matches dragenter). Without
  // this, any timing issue between dragstart setting state and the first
  // dragover can cause the browser to flag the zone as no-drop for the
  // remainder of the gesture.
  document.addEventListener("dragover", (e) => {
    const target = e.target;
    if (!target || !target.closest) return;

    const trash = target.closest("#gpTrashZone");
    if (trash) {
      e.preventDefault();
      e.dataTransfer.dropEffect = _gpDragSource ? "move" : "copy";
      return;
    }

    const box = target.closest(".gp-box");
    if (!box) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = _gpDragSource ? "move" : "copy";

    // intra-box reorder indicator (only if body is visible)
    const boxId = box?.dataset.boxId;
    const dropZone = box.querySelector(".gp-box-body");
    if (dropZone && _gpDragSource && boxId && _gpDragSource.boxId === boxId) {
      _gpUpdateDropIndicator(dropZone, e.clientY);
    }
  }, true);

  document.addEventListener("dragleave", (e) => {
    const target = e.target;
    if (!target || !target.closest) return;
    const box = target.closest(".gp-box");
    if (box && !box.contains(e.relatedTarget)) {
      box.classList.remove("is-drop-target");
      const dz = box.querySelector(".gp-box-body");
      if (dz) _gpClearDropIndicators(dz);
    }
    const trash = target.closest("#gpTrashZone");
    if (trash && !trash.contains(e.relatedTarget)) {
      trash.classList.remove("is-active");
    }
  }, true);

  document.addEventListener("drop", (e) => {
    const target = e.target;
    if (!target || !target.closest) return;
    if (!_gpDragPayload && !_gpDragSource) {
      _gpLog("drop with no source/payload -- ignored", target.tagName);
      _gpClearDragState();
      return;
    }
    _gpLog("drop", { hasSource: !!_gpDragSource, hasPayload: !!_gpDragPayload, target: target.tagName + "." + (target.className || "").substring(0, 30) });

    // Trash drop -- send to holding (or remove if already holding)
    const trash = target.closest("#gpTrashZone");
    if (trash && _gpDragSource) {
      e.preventDefault();
      e.stopPropagation();
      const { boxId, sig, rawIdx } = _gpDragSource;
      // Snapshot then clear state BEFORE mutation -- mutation re-renders
      // and detaches the source, after which dragend won't fire on document.
      _gpClearDragState();
      if (boxId === GP_HOLDING_ID) {
        removeFromGamePlanBox(_gpBuildBoxPlayArg(boxId, sig, rawIdx));
      } else {
        _gpMoveBetweenBoxes(boxId, GP_HOLDING_ID, sig, rawIdx);
        showToast("Sent to Holding", { duration: 1500 });
      }
      return;
    }

    // Accept drop on the whole .gp-box (header included). Body may be
    // hidden (collapsed), in which case intra-box reorder index falls
    // back to the end of the list.
    const box = target.closest(".gp-box");
    if (!box) {
      _gpClearDragState();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const boxId = box.dataset.boxId;
    const dropZone = box.querySelector(".gp-box-body");
    if (!boxId) {
      _gpClearDragState();
      return;
    }

    // Snapshot drag state, then clear it BEFORE mutating, so cleanup is
    // not blocked by detached-source dragend semantics.
    const dragSource = _gpDragSource;
    const dragPayload = _gpDragPayload;
    const dropY = e.clientY;
    _gpClearDragState();

    if (dragSource) {
      if (dragSource.boxId === boxId) {
        const targetIdx = dropZone
          ? _gpComputeRawDropIndex(dropZone, dropY)
          : Infinity;
        _gpReorderInBox(boxId, dragSource.sig, targetIdx, dragSource.rawIdx);
      } else {
        _gpMoveBetweenBoxes(dragSource.boxId, boxId, dragSource.sig, dragSource.rawIdx);
      }
    } else if (dragPayload && Array.isArray(dragPayload.sigs)) {
      _gpAddSigsToBox(dragPayload.sigs, boxId);
    }
  }, true);

  // Right-click + long-press on a box-play row (still need per-row, but
  // delegated so re-render doesn't matter)
  document.addEventListener("contextmenu", (e) => {
    const row = e.target?.closest?.(".gp-box-play[draggable='true']");
    if (!row) return;
    e.preventDefault();
    _gpOpenPlayContextMenu(e, row.dataset.boxId, row.dataset.sig, row.dataset.rawIdx);
  });
}

// Called from renderGamePlan -- now mostly a no-op for drag (delegated).
// Still wires non-drag concerns: dblclick rename on titles, header-action
// stopPropagation, long-press on box rows.
function _gpAttachLibraryHandlers() {
  _gpWireDnd();
  // Library rows have no other per-row concerns -- delegation handles drag
  // and data-action handles the checkbox.
}

function _gpAttachBoxHandlers() {
  _gpWireDnd();
  const boxes = document.querySelectorAll(".gp-box");
  boxes.forEach((box) => {
    const boxId = box.dataset.boxId;
    // Prevent header-action clicks from bubbling up and toggling box collapse
    box.querySelectorAll("[data-stop-toggle], .gp-box-sort").forEach((el) => {
      el.addEventListener("click", (e) => e.stopPropagation());
      el.addEventListener("mousedown", (e) => e.stopPropagation());
    });
    // The stopPropagation above also blocks document-level data-action delegation
    // for buttons inside .gp-box-actions, so we wire those directly here.
    box.querySelectorAll(".gp-box-actions [data-action]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const action = btn.dataset.action;
        const arg = btn.dataset.arg;
        const fn = window[action];
        if (typeof fn !== "function") return;
        if (arg !== undefined) fn(arg);
        else fn();
      });
    });
    // Double-click on title to rename
    const titleEl = box.querySelector(".gp-box-title");
    if (titleEl && boxId && boxId !== GP_HOLDING_ID) {
      titleEl.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        renameAnyGamePlanBox(boxId);
      });
    }
  });

  // Long-press on box-play rows (mobile context menu) -- still per-row
  if (typeof addLongPress === "function") {
    document.querySelectorAll(".gp-box-play[draggable='true']").forEach((row) => {
      if (row._gpLongPressBound) return;
      row._gpLongPressBound = true;
      addLongPress(row, () => {
        const rect = row.getBoundingClientRect();
        _gpOpenPlayContextMenu(
          { preventDefault() { }, clientX: rect.left + 20, clientY: rect.top + 20 },
          row.dataset.boxId,
          row.dataset.sig,
          row.dataset.rawIdx,
        );
      });
    });
  }
}

function _gpGetDropRows(dropZone) {
  if (_gpDropRowCacheZone === dropZone && _gpDropRowCache) return _gpDropRowCache;
  const rows = Array.from(dropZone.querySelectorAll(".gp-box-play"));
  _gpDropRowCache = rows.map((row) => {
    const r = row.getBoundingClientRect();
    return {
      el: row,
      mid: r.top + r.height / 2,
      rawIdx: _gpNormalizeBoxPlayIndex(row.dataset.rawIdx),
    };
  });
  _gpDropRowCacheZone = dropZone;
  return _gpDropRowCache;
}

function _gpInvalidateDropRowCache() {
  _gpDropRowCache = null;
  _gpDropRowCacheZone = null;
}

function _gpComputeDropIndex(dropZone, clientY) {
  const rows = _gpGetDropRows(dropZone);
  for (let i = 0; i < rows.length; i += 1) {
    if (clientY < rows[i].mid) return i;
  }
  return rows.length;
}

function _gpComputeRawDropIndex(dropZone, clientY) {
  const rows = _gpGetDropRows(dropZone);
  for (let i = 0; i < rows.length; i += 1) {
    if (clientY < rows[i].mid) {
      const rawIdx = rows[i].rawIdx;
      return rawIdx === null ? i : rawIdx;
    }
  }
  if (rows.length === 0) return Infinity;
  const lastRawIdx = rows[rows.length - 1].rawIdx;
  return lastRawIdx === null ? rows.length : lastRawIdx + 1;
}

function _gpUpdateDropIndicator(dropZone, clientY) {
  _gpClearDropIndicators(dropZone);
  const rows = _gpGetDropRows(dropZone);
  if (rows.length === 0) return;
  const idx = _gpComputeDropIndex(dropZone, clientY);
  if (idx >= rows.length) rows[rows.length - 1].el.classList.add("gp-drop-after");
  else rows[idx].el.classList.add("gp-drop-before");
}

function _gpClearDropIndicators(dropZone) {
  if (!dropZone) return;
  dropZone.querySelectorAll(".gp-drop-before, .gp-drop-after").forEach((el) => {
    el.classList.remove("gp-drop-before");
    el.classList.remove("gp-drop-after");
  });
}

function _gpReorderInBox(boxId, sig, targetIdx, rawIdx) {
  if (!boxId || !sig) return;
  _gpUpdateBoard((board) => {
    const arr = board.assignments[boxId] || [];
    const fromIdx = _gpFindBoxPlayIndex(arr, sig, rawIdx);
    if (fromIdx < 0) return;
    const [item] = arr.splice(fromIdx, 1);
    let toIdx = Math.max(0, Math.min(arr.length, targetIdx));
    if (fromIdx < targetIdx) toIdx = Math.max(0, toIdx - 1);
    arr.splice(toIdx, 0, item);
    // Switch to manual sort so the user's order is honored
    if (!board.sort) board.sort = {};
    board.sort[boxId] = "manual";
  });
  requestRenderGamePlan();
}

/* -------------------------------------------------------------------------
   Mutations
   ------------------------------------------------------------------------- */

function _gpAddSigsToBox(sigs, boxId) {
  if (!Array.isArray(sigs) || sigs.length === 0 || !boxId) return;
  let added = 0;
  let skipped = 0;
  let restricted = 0;
  const primaryDuplicates = [];
  _gpUpdateBoard((board) => {
    if (!Array.isArray(board.assignments[boxId])) board.assignments[boxId] = [];
    const existingIdentities = new Set(board.assignments[boxId].map((p) => _gpAssignmentIdentity(p)));
    sigs.forEach((sig) => {
      const play = _gpFindPlayBySig(sig);
      if (!play) { skipped += 1; return; }
      const primaryIdentity = _gpAssignmentIdentity(play);
      if (existingIdentities.has(primaryIdentity)) {
        skipped += 1;
        primaryDuplicates.push(sig);
        return;
      }
      if (!_gpPlayAllowedOnBoard(play, board)) {
        restricted += 1;
        return;
      }
      board.assignments[boxId].push(
        typeof copyPlayWithSourceIdentity === "function"
          ? copyPlayWithSourceIdentity(play)
          : { ...play },
      );
      existingIdentities.add(primaryIdentity);
      added += 1;
    });
  });
  _gpSelected.clear();
  requestRenderGamePlan();
  if (added > 0) {
    const label = _gpBoxLabel(boxId);
    const skippedCount = skipped + restricted;
    const duplicateSig = primaryDuplicates[0] || "";
    const duplicateSource = duplicateSig ? _gpFindPlayBySig(duplicateSig) : null;
    const hasAlternate = duplicateSource && typeof getPlayPersonnelOptions === "function"
      ? getPlayPersonnelOptions(duplicateSource).length > 1
      : false;
    showToast(
      `Added ${added} play${added === 1 ? "" : "s"} to ${label}${skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}`,
      hasAlternate
        ? {
          type: "success",
          duration: 7000,
          actionLabel: "Add variant",
          action: () => openGamePlanDuplicatePersonnelVariant(boxId, duplicateSig),
        }
        : { type: "success" },
    );
  } else if (restricted > 0) {
    showToast("This template accepts passing play types only.", {
      type: "warning",
      duration: 3000,
    });
  } else if (skipped > 0) {
    const duplicateSig = primaryDuplicates[0] || "";
    const duplicateSource = duplicateSig ? _gpFindPlayBySig(duplicateSig) : null;
    const hasAlternate = duplicateSource && typeof getPlayPersonnelOptions === "function"
      ? getPlayPersonnelOptions(duplicateSource).length > 1
      : false;
    showToast(
      hasAlternate
        ? `That primary call is already in ${_gpBoxLabel(boxId)}. You can add it as an approved personnel variant instead.`
        : `No plays added — ${skipped} were already in the box.`,
      hasAlternate
        ? {
          type: "warning",
          duration: 7000,
          actionLabel: "Choose variant",
          action: () => openGamePlanDuplicatePersonnelVariant(boxId, duplicateSig),
        }
        : { type: "warning" },
    );
  }
}

function _gpMoveBetweenBoxes(fromBoxId, toBoxId, sig, rawIdx) {
  if (!fromBoxId || !toBoxId || fromBoxId === toBoxId) return;
  _gpUpdateBoard((board) => {
    const fromArr = board.assignments[fromBoxId] || [];
    const idx = _gpFindBoxPlayIndex(fromArr, sig, rawIdx);
    if (idx < 0) return;
    const [play] = fromArr.splice(idx, 1);
    if (!Array.isArray(board.assignments[toBoxId])) board.assignments[toBoxId] = [];
    const exists = board.assignments[toBoxId].some((p) => _gpAssignmentIdentity(p) === _gpAssignmentIdentity(play));
    if (!exists) board.assignments[toBoxId].push(play);
  });
  requestRenderGamePlan();
}
