/* =============================================================================
   Call Sheet — Game Plan Drawer
   -----------------------------------------------------------------------------
   Slide-out side drawer on the Call Sheet page that lists the plays in your
   current Game Plan (active opponent by default, or all tagged opponents).
   Drag a play from the drawer onto any call sheet category bucket to add it.

   Public globals (called via data-action / data-onchange / data-oninput):
     - toggleGameplanDrawer()
     - openGameplanDrawer()
     - closeGameplanDrawer()
     - setGameplanDrawerScope(value)              ("active" | "all")
     - setGameplanDrawerType(value)               ("" | "Run" | "Pass" | ...)
     - setGameplanDrawerNotOnSheetOnly(event)     filters to plays absent from call sheet
     - setGameplanDrawerSearch(value)             debounced
     - clearGameplanDrawerSearch()
     - refreshGameplanDrawer()                    re-pulls plays + re-renders

   Drag handshake (consumed by handleCallSheetDrop in callsheet-picker-runtime.js):
     dataTransfer.setData("source", "gameplan")
     dataTransfer.setData("gpIndex", String(idx))
     window._gpDrawerVisiblePlays                  array of plays at drag time
   ============================================================================= */

// State
let _gpDrawerState = {
  open: false,
  scope: "active", // "active" | "all"
  type: "", // "" | "Run" | "Pass" | "Screen" | "Quick" | "Play Action" | "RPO" | "Run Option" | "Movement"
  notOnSheetOnly: false,
  search: "",
  sortBy: "default", // "default" | "az" | "type" | "form" | "uses-desc" | "uses-asc"
  searchTimer: null,
};

// Plays currently rendered in the drawer (used by drag drop to look up by index)
window._gpDrawerVisiblePlays = [];

/* ---------- Source plays ---------------------------------------------------- */

function _gpDrawerPlayKey(play) {
  if (typeof csPlayKey === "function") return csPlayKey(play);
  if (typeof _gpPlaySignature === "function") return _gpPlaySignature(play);
  return typeof playSignature === "function" ? playSignature(play) : "";
}

function _gpDrawerSourcePlays() {
  const sourceBoards = [];
  if (typeof _gpEnsureBoard === "function") {
    // The active board is the authoritative Game Plan. Legacy opponent tags
    // are a Playbook filter and can legitimately be smaller than the board.
    if (_gpDrawerState.scope === "active") sourceBoards.push(_gpEnsureBoard());
    else if (typeof _gpLoadBoards === "function") sourceBoards.push(...Object.values(_gpLoadBoards() || {}));
  }

  const seen = new Set();
  const drafted = [];
  sourceBoards.forEach((board) => {
    Object.entries(board?.assignments || {}).forEach(([boxId, bucket]) => {
      if (typeof GP_HOLDING_ID !== "undefined" && boxId === GP_HOLDING_ID) return;
      (Array.isArray(bucket) ? bucket : []).forEach((play) => {
        const signature = _gpDrawerPlayKey(play);
        if (!signature || seen.has(signature)) return;
        seen.add(signature);
        drafted.push(play);
      });
    });
  });
  if (drafted.length || sourceBoards.length) return drafted;

  // Compatibility fallback for workspaces that have not yet initialized the
  // board model. It is never the preferred source for an active board.
  if (!Array.isArray(plays) || typeof getGamePlanTags !== "function" || typeof playSignature !== "function") return [];
  const tags = getGamePlanTags() || {};
  const all = new Set();
  Object.values(tags).forEach((arr) => (arr || []).forEach((signature) => all.add(signature)));
  return plays.filter((play) => all.has(playSignature(play)));
}

function _gpDrawerFilterAndSort(source, usageMap) {
  let out = source.slice();

  // Type chip filter
  if (_gpDrawerState.type) {
    out = out.filter((p) => (p.type || "") === _gpDrawerState.type);
  }

  if (_gpDrawerState.notOnSheetOnly) {
    out = out.filter((p) => _gpDrawerUseCount(p, usageMap) === 0);
  }

  // Search across the same fields the picker uses
  const q = (_gpDrawerState.search || "").toLowerCase().trim();
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean);
    out = out.filter((play) => {
      const blob = [
        play.type, play.personnel, play.formation, play.formTag1, play.formTag2,
        play.under, play.back, play.shift, play.motion, play.protection,
        play.lineCall, play.play, play.playTag1, play.playTag2, play.basePlay,
        play.oneWord, play.tempo, play.keyPlayerName1, play.keyPlayerName2,
        play.keyPlayerName3, play.constraint1, play.constraint2, play.constraint3,
        play.deadVs, play.notes, play.preferredSituation, play.preferredFieldPosition,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((t) => blob.includes(t));
    });
  }

  // Sort
  const cmpDefault = (a, b) => {
    const ta = (a.type || "").localeCompare(b.type || "");
    if (ta) return ta;
    const fa = (a.formation || "").localeCompare(b.formation || "");
    if (fa) return fa;
    return (a.play || "").localeCompare(b.play || "");
  };
  const cmpAZ = (a, b) => (a.play || "").localeCompare(b.play || "");
  const cmpType = (a, b) => {
    const t = (a.type || "").localeCompare(b.type || "");
    return t || cmpAZ(a, b);
  };
  const cmpForm = (a, b) => {
    const f = (a.formation || "").localeCompare(b.formation || "");
    return f || cmpAZ(a, b);
  };
  const cmpUsesDesc = (a, b) => {
    const d = _gpDrawerUseCount(b, usageMap) - _gpDrawerUseCount(a, usageMap);
    return d || cmpDefault(a, b);
  };
  const cmpUsesAsc = (a, b) => {
    const d = _gpDrawerUseCount(a, usageMap) - _gpDrawerUseCount(b, usageMap);
    return d || cmpDefault(a, b);
  };
  const sorters = {
    default: cmpDefault,
    az: cmpAZ,
    type: cmpType,
    form: cmpForm,
    "uses-desc": cmpUsesDesc,
    "uses-asc": cmpUsesAsc,
  };
  out.sort(sorters[_gpDrawerState.sortBy] || cmpDefault);

  return out;
}

function _gpDrawerUseCount(play, usageMap) {
  if (!usageMap) return 0;
  const arr = usageMap[_gpDrawerPlayKey(play)] || [];
  return arr.reduce((sum, usage) => sum + (usage.count || 1), 0);
}

/* ---------- Type chip counts ----------------------------------------------- */

function _gpDrawerTypeCounts(source) {
  const counts = { "": source.length };
  source.forEach((p) => {
    const t = p.type || "";
    if (!t) return;
    counts[t] = (counts[t] || 0) + 1;
  });
  return counts;
}

/* ---------- Usage map (where each play appears in the call sheet) --------- */

function _gpDrawerBuildUsageMap() {
  // signature -> [{ catId, name, color }]
  const map = Object.create(null);
  if (typeof callSheet !== "object" || !callSheet) return map;

  const cats = Array.isArray(CALLSHEET_CATEGORIES) ? CALLSHEET_CATEGORIES : [];
  const catById = {};
  cats.forEach((c) => (catById[c.id] = c));

  Object.keys(callSheet).forEach((catId) => {
    const bucket = callSheet[catId];
    if (!bucket) return;
    const catObj = catById[catId];
    const name =
      typeof getCategoryDisplayName === "function" && catObj
        ? getCategoryDisplayName(catObj)
        : (catObj && catObj.name) || catId;
    const color =
      typeof getCategoryColor === "function" && catObj
        ? getCategoryColor(catObj)
        : (catObj && catObj.color) || "";

    const seenInBucket = new Set();
    ["left", "right"].forEach((side) => {
      const arr = Array.isArray(bucket[side]) ? bucket[side] : [];
      arr.forEach((play) => {
        if (!play) return;
        const sig = _gpDrawerPlayKey(play);
        if (!sig) return;
        // Count once per bucket (both hashes => single chip), but bump count if
        // the same play is in both hashes of the same bucket.
        const key = sig + "|" + catId;
        const dupInBucket = seenInBucket.has(key);
        seenInBucket.add(key);

        if (!map[sig]) map[sig] = [];
        if (dupInBucket) {
          // increment count on the existing entry for this bucket
          const last = map[sig][map[sig].length - 1];
          if (last && last.catId === catId) last.count = (last.count || 1) + 1;
          return;
        }
        map[sig].push({ catId, name, color, count: 1 });
      });
    });
  });

  return map;
}

/* ---------- Render --------------------------------------------------------- */

function _gpDrawerRender() {
  const drawer = document.getElementById("gpDrawer");
  if (!drawer) return;

  const source = _gpDrawerSourcePlays();
  const usageMap = _gpDrawerBuildUsageMap();
  const visible = _gpDrawerFilterAndSort(source, usageMap);
  window._gpDrawerVisiblePlays = visible;

  // Sync sort dropdown value (in case it was set programmatically)
  const sortSel = document.getElementById("gpDrawerSort");
  if (sortSel && sortSel.value !== _gpDrawerState.sortBy) {
    sortSel.value = _gpDrawerState.sortBy;
  }
  const clearSearch = document.getElementById("gpDrawerSearchClear");
  if (clearSearch) clearSearch.classList.toggle("hidden", !_gpDrawerState.search.trim());

  // Counts
  const totalEl = document.getElementById("gpDrawerCount");
  if (totalEl) totalEl.textContent = `Showing ${visible.length} of ${source.length}`;

  const notOnSheetCount = source.filter((play) => _gpDrawerUseCount(play, usageMap) === 0).length;
  const notOnSheetCountEl = document.getElementById("gpDrawerNotOnSheetCount");
  if (notOnSheetCountEl) {
    notOnSheetCountEl.textContent = notOnSheetCount > 0 ? `(${notOnSheetCount})` : "";
  }
  const notOnSheetToggle = document.getElementById("gpDrawerNotOnSheetFilter");
  if (notOnSheetToggle) {
    notOnSheetToggle.checked = _gpDrawerState.notOnSheetOnly;
  }
  const notOnSheetWrap = document.getElementById("gpDrawerNotOnSheetWrap");
  if (notOnSheetWrap) {
    notOnSheetWrap.classList.toggle("gp-drawer-filter-active", _gpDrawerState.notOnSheetOnly);
  }

  // Active opponent label
  const oppEl = document.getElementById("gpDrawerOpponent");
  if (oppEl) {
    const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
    const opp = gw && gw.opponentName ? gw.opponentName : "";
    oppEl.textContent = opp ? `vs ${opp}` : "(no active opponent set)";
    oppEl.classList.toggle("gp-drawer-no-opp", !opp);
  }

  // Type chips
  const chipsEl = document.getElementById("gpDrawerTypeChips");
  if (chipsEl) {
    const counts = _gpDrawerTypeCounts(source);
    const types = ["", "Run", "Pass", "Screen", "Quick", "Play Action", "RPO", "Run Option", "Movement"];
    chipsEl.innerHTML = types
      .map((t) => {
        const label = t || "All";
        const n = counts[t] || 0;
        const active = _gpDrawerState.type === t ? "gp-chip-active" : "";
        const dim = n === 0 && t !== "" ? "gp-chip-dim" : "";
        return `<button type="button" class="gp-chip ${active} ${dim}" data-action="setGameplanDrawerType" data-arg="${escapeHtml(t)}">${escapeHtml(label)} <span class="gp-chip-count">${n}</span></button>`;
      })
      .join("");
  }

  // Scope buttons highlight
  const sActive = document.getElementById("gpDrawerScopeActive");
  const sAll = document.getElementById("gpDrawerScopeAll");
  if (sActive) sActive.classList.toggle("gp-scope-active", _gpDrawerState.scope === "active");
  if (sAll) sAll.classList.toggle("gp-scope-active", _gpDrawerState.scope === "all");

  // List
  const list = document.getElementById("gpDrawerList");
  if (!list) return;

  if (!source.length) {
    const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
    const opp = gw && gw.opponentName ? gw.opponentName : "";
    const msg =
      _gpDrawerState.scope === "active"
        ? opp
          ? `No plays are in the active Game Plan for <strong>${escapeHtml(opp)}</strong> yet. Add plays to its buckets, then return here to drag them onto the Call Sheet.`
          : `No plays are in the current Game Plan yet. Add plays to its buckets, then return here to drag them onto the Call Sheet.`
        : `No plays are in any saved Game Plan yet. Add plays to a plan, then return here to drag them onto the Call Sheet.`;
    list.innerHTML = `<div class="gp-drawer-empty">${msg}</div>`;
    return;
  }

  if (!visible.length) {
    list.innerHTML = `<div class="gp-drawer-empty">No plays match your search/filter.</div>`;
    return;
  }

  const q = (_gpDrawerState.search || "").toLowerCase().trim();
  list.innerHTML = visible
    .map((play, idx) => {
      const call =
        typeof getFullCall === "function"
          ? getFullCall(play, { showEmoji: true })
          : escapeHtml(play.play || "");
      const meta = [play.personnel, play.formation, play.type].filter(Boolean).join(" • ");
      const highlightedMeta = q ? _gpDrawerHighlight(meta, q) : escapeHtml(meta);
      const sig = _gpDrawerPlayKey(play);
      const uses = (sig && usageMap[sig]) || [];
      const totalUses = _gpDrawerUseCount(play, usageMap);
      const usageBadge = totalUses
        ? `<span class="gp-drawer-uses gp-drawer-uses-${totalUses > 1 ? "multi" : "one"}" title="On the call sheet ${totalUses} time${totalUses === 1 ? "" : "s"}">×${totalUses}</span>`
        : `<span class="gp-drawer-uses gp-drawer-uses-zero" title="Not on the call sheet">×0</span>`;
      const chips = uses
        .map((u) => {
          const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(u.color || "") ? u.color : "";
          const style = safeColor ? ` style="--gp-chip-bg:${safeColor}"` : "";
          const label = u.count > 1 ? `${u.name} ×${u.count}` : u.name;
          return `<span class="gp-drawer-loc-chip"${style} title="${escapeHtml(u.name)}">${escapeHtml(label)}</span>`;
        })
        .join("");
      const locRow = chips
        ? `<div class="gp-drawer-locs">${chips}</div>`
        : "";
      return `
        <div class="gp-drawer-row${totalUses ? " gp-drawer-row-used" : ""}" draggable="true"
             data-gp-idx="${idx}"
             title="Drag onto a call sheet category">
          <span class="gp-drawer-grip" aria-hidden="true">⋮⋮</span>
          <div class="gp-drawer-row-body">
            <div class="gp-drawer-call-row">
              <div class="gp-drawer-call">${call}</div>
              ${usageBadge}
            </div>
            ${meta ? `<div class="gp-drawer-meta">${highlightedMeta}</div>` : ""}
            ${locRow}
          </div>
        </div>`;
    })
    .join("");

  // Wire drag handlers (direct, since these rows are inside the drawer)
  list.querySelectorAll(".gp-drawer-row").forEach((row) => {
    row.addEventListener("dragstart", _gpDrawerOnDragStart);
    row.addEventListener("dragend", _gpDrawerOnDragEnd);
  });
}

function _gpDrawerHighlight(text, q) {
  if (!q) return escapeHtml(text);
  // Highlight each search term separately, on a safely escaped base
  const safe = escapeHtml(text);
  const terms = q.split(/\s+/).filter(Boolean);
  let out = safe;
  terms.forEach((t) => {
    const escTerm = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(${escTerm})`, "ig"), "<mark>$1</mark>");
  });
  return out;
}

/* ---------- Drag wiring ---------------------------------------------------- */

// Cleanup function -- called from both dragend and drop. Mirrors the
// pattern in gameplan.js: drop handlers must invoke this BEFORE triggering
// any re-render that detaches the source row, because dragend does not
// bubble to document if the original target is no longer in the DOM tree.
function _gpDrawerClearDragState() {
  document.body.classList.remove("gp-drag-active");
  document.querySelectorAll(".gp-drawer-row-dragging").forEach((row) => row.classList.remove("gp-drawer-row-dragging"));
  const drawer = document.getElementById("gpDrawer");
  const tab = document.getElementById("gpDrawerToggleBtn");
  if (drawer) drawer.classList.remove("gp-drawer-drag-hide");
  if (tab) tab.classList.remove("gp-drawer-drag-hide");
}

function _gpClearHighlights() {
  document
    .querySelectorAll(".hash-column.gp-drag-over")
    .forEach((el) => el.classList.remove("gp-drag-over"));
}

function _gpDrawerOnDragStart(event) {
  // Defense-in-depth: clear stale state from any previous gesture whose
  // dragend was missed.
  _gpDrawerClearDragState();
  const row = event.currentTarget;
  const idx = parseInt(row.dataset.gpIdx, 10);
  if (Number.isNaN(idx)) return;
  event.dataTransfer.setData("source", "gameplan");
  event.dataTransfer.setData("gpIndex", String(idx));
  // Some browsers require a text/plain payload to register the drag at all.
  try { event.dataTransfer.setData("text/plain", String(idx)); } catch (_e) { /* benign: some browsers reject extra setData payloads */ }
  event.dataTransfer.effectAllowed = "copy";
  // Defensive: if a previous within-callsheet drag left state behind, clear it
  // so the grid's drop handler can't misinterpret our drop as a reorder.
  try { if (typeof draggedCallSheetPlay !== "undefined") draggedCallSheetPlay = null; } catch (_e) { /* benign: variable may be block-scoped elsewhere */ }
  row.classList.add("gp-drawer-row-dragging");
  // Visual hint: highlight all category drop zones
  document.body.classList.add("gp-drag-active");

  // Auto-hide the drawer mid-drag so the user can see and drop on every
  // category bucket. The drag image is captured synchronously at the end of
  // dragstart, so we defer the hide to the next tick to keep the preview clean.
  const drawer = document.getElementById("gpDrawer");
  const tab = document.getElementById("gpDrawerToggleBtn");
  setTimeout(() => {
    if (drawer) drawer.classList.add("gp-drawer-drag-hide");
    if (tab) tab.classList.add("gp-drawer-drag-hide");
  }, 0);
}

function _gpDrawerOnDragEnd(event) {
  event.currentTarget.classList.remove("gp-drawer-row-dragging");
  _gpDrawerClearDragState();
  if (typeof _gpClearHighlights === "function") _gpClearHighlights();
}

/* ---------- Public API ----------------------------------------------------- */

function openGameplanDrawer() {
  _gpDrawerState.open = true;
  const drawer = document.getElementById("gpDrawer");
  if (drawer) {
    drawer.classList.add("gp-drawer-open");
    drawer.removeAttribute("inert");
    drawer.setAttribute("aria-hidden", "false");
    if (typeof openLayer === "function") {
      openLayer(drawer, { id: "gp-drawer", exclusive: false });
    }
  }
  document.body.classList.add("gp-drawer-body-open");
  const btn = document.getElementById("gpDrawerToggleBtn");
  if (btn) {
    btn.classList.add("gp-drawer-toggle-active");
    btn.setAttribute("aria-expanded", "true");
  }
  _gpDrawerRender();
  // Focus search for fast typing
  setTimeout(() => {
    const s = document.getElementById("gpDrawerSearch");
    if (s) s.focus();
  }, 50);
}

function closeGameplanDrawer() {
  _gpDrawerState.open = false;
  const drawer = document.getElementById("gpDrawer");
  if (drawer) {
    drawer.classList.remove("gp-drawer-open");
    drawer.setAttribute("inert", "");
    drawer.setAttribute("aria-hidden", "true");
    if (typeof closeLayer === "function") closeLayer("gp-drawer");
  }
  document.body.classList.remove("gp-drawer-body-open");
  const btn = document.getElementById("gpDrawerToggleBtn");
  if (btn) {
    btn.classList.remove("gp-drawer-toggle-active");
    btn.setAttribute("aria-expanded", "false");
  }
}

function toggleGameplanDrawer() {
  if (_gpDrawerState.open) closeGameplanDrawer();
  else openGameplanDrawer();
}

function setGameplanDrawerScope(value) {
  _gpDrawerState.scope = value === "all" ? "all" : "active";
  _gpDrawerRender();
}

function setGameplanDrawerType(value) {
  _gpDrawerState.type = value || "";
  _gpDrawerRender();
}

function setGameplanDrawerNotOnSheetOnly(valueOrEvent) {
  _gpDrawerState.notOnSheetOnly =
    valueOrEvent && valueOrEvent.target
      ? !!valueOrEvent.target.checked
      : !!valueOrEvent;
  _gpDrawerRender();
}

function setGameplanDrawerSort(value) {
  const allowed = ["default", "az", "type", "form", "uses-desc", "uses-asc"];
  _gpDrawerState.sortBy = allowed.includes(value) ? value : "default";
  _gpDrawerRender();
}

function setGameplanDrawerSearch(value) {
  _gpDrawerState.search = String(value == null ? "" : value);
  clearTimeout(_gpDrawerState.searchTimer);
  _gpDrawerState.searchTimer = setTimeout(_gpDrawerRender, 80);
}

function clearGameplanDrawerSearch() {
  _gpDrawerState.search = "";
  const input = document.getElementById("gpDrawerSearch");
  if (input) input.value = "";
  _gpDrawerRender();
}

function refreshGameplanDrawer() {
  if (_gpDrawerState.open) _gpDrawerRender();
}

/* ---------- Boot ----------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  const drawer = document.getElementById("gpDrawer");
  if (drawer) {
    drawer.setAttribute("inert", "");
    drawer.setAttribute("aria-hidden", "true");
  }
  // Esc closes drawer
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && _gpDrawerState.open) {
      closeGameplanDrawer();
    }
  });

  // Idle fade for the pull-tab: when the cursor moves near the right edge of
  // the viewport the tab pops to full opacity, then fades back after idle.
  const tab = document.getElementById("gpDrawerToggleBtn");
  if (tab) {
    let fadeTimer = null;
    const wakeTab = () => {
      tab.classList.add("gp-drawer-tab-active");
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
        tab.classList.remove("gp-drawer-tab-active");
      }, 1500);
    };
    document.addEventListener("mousemove", (e) => {
      // Only react when on the call sheet tab and the cursor is near the right edge
      if (document.body.dataset.activeTab !== "callsheet") return;
      if (_gpDrawerState.open) return; // already pinned solid when open
      if (e.clientX > window.innerWidth - 80) wakeTab();
    });
    tab.addEventListener("focus", wakeTab);
  }

  // === Bulletproof drag-and-drop pipeline for the Game Plan drawer =========
  // We don't piggy-back on the grid's drop handler at all. We do the entire
  // dragover / drop dance ourselves in the capture phase so:
  //   - dragover preventDefaults anywhere inside the grid (otherwise the
  //     browser refuses the drop when the cursor sits between buckets,
  //     over '+ Add', the empty placeholder, or a category header)
  //   - drop reads our gameplan payload, looks up the target column (cursor
  //     -> elementsFromPoint -> last-highlighted column fallback) and inserts
  //     directly into callSheet[catId][hash]
  //   - we stopPropagation() so the grid's bubble drop never runs and the
  //     within-callsheet draggedCallSheetPlay branch can't swallow us by
  //     accident.

  function _gpFindHashColumnAt(event) {
    // Try the direct event target first.
    let col = event.target && event.target.closest
      ? event.target.closest("[data-drop='csHashDrop']")
      : null;
    if (col) return col;
    // Fall back to elementFromPoint (works even if the source element is
    // pointer-events:none).
    if (typeof document.elementFromPoint === "function") {
      const stack = document.elementsFromPoint
        ? document.elementsFromPoint(event.clientX, event.clientY)
        : [document.elementFromPoint(event.clientX, event.clientY)];
      for (const el of stack) {
        if (!el || !el.closest) continue;
        const c = el.closest("[data-drop='csHashDrop']");
        if (c) return c;
      }
    }
    // Final fallback: the column we most recently highlighted in dragover.
    return document.querySelector(".hash-column.gp-drag-over");
  }

  function _gpHighlightColumn(col) {
    document.querySelectorAll(".hash-column.gp-drag-over").forEach((el) => {
      if (el !== col) el.classList.remove("gp-drag-over");
    });
    if (col) col.classList.add("gp-drag-over");
  }

  // Allow drops anywhere inside the grid while a drawer drag is in flight.
  ["dragenter", "dragover"].forEach((evt) => {
    document.addEventListener(
      evt,
      (event) => {
        if (!document.body.classList.contains("gp-drag-active")) return;
        const grid = event.target && event.target.closest
          ? event.target.closest("#callSheetGrid")
          : null;
        if (!grid) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        if (evt === "dragover") _gpHighlightColumn(_gpFindHashColumnAt(event));
      },
      true,
    );
  });

  document.addEventListener(
    "drop",
    (event) => {
      if (!document.body.classList.contains("gp-drag-active")) return;
      const source = event.dataTransfer && event.dataTransfer.getData
        ? event.dataTransfer.getData("source")
        : "";
      if (source !== "gameplan") {
        _gpClearHighlights();
        return;
      }
      const grid = event.target && event.target.closest
        ? event.target.closest("#callSheetGrid")
        : null;
      if (!grid) {
        _gpClearHighlights();
        return;
      }
      const col = _gpFindHashColumnAt(event);
      _gpClearHighlights();
      if (!col) {
        if (typeof showToast === "function") {
          showToast("Drop on a Left or Right Hash column", { duration: 2200, type: "warning" });
        }
        return;
      }

      // Look up the play (set in dragstart on window._gpDrawerVisiblePlays).
      const gpIdx = parseInt(event.dataTransfer.getData("gpIndex"), 10);
      const arr = Array.isArray(window._gpDrawerVisiblePlays)
        ? window._gpDrawerVisiblePlays
        : [];
      const play = !Number.isNaN(gpIdx) ? arr[gpIdx] : null;
      if (!play) {
        if (typeof showToast === "function") {
          showToast("Could not resolve dragged play", { duration: 2200, type: "error" });
        }
        return;
      }

      // Stop the grid's bubble-phase drop handler from running -- we'll
      // perform the insert ourselves so we can't be tripped up by stale
      // draggedCallSheetPlay state in the picker runtime.
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      const targetCat = col.dataset.cat;
      const targetHash = col.dataset.hash;
      if (!targetCat || !targetHash) return;

      // Optional insert position: if cursor was over an existing play row,
      // insert before it; otherwise append.
      const targetPlay = event.target && event.target.closest
        ? event.target.closest(".callsheet-play")
        : null;
      let insertIdx = -1;
      if (targetPlay) {
        const idx = parseInt(targetPlay.dataset.index, 10);
        if (!Number.isNaN(idx)) insertIdx = idx;
      }

      if (typeof callSheet !== "object" || !callSheet) return;
      if (!callSheet[targetCat]) callSheet[targetCat] = { left: [], right: [] };
      if (!Array.isArray(callSheet[targetCat][targetHash])) {
        callSheet[targetCat][targetHash] = [];
      }

      const playToInsert = Object.assign({}, play);
      delete playToInsert._sourceIdx;
      if (typeof getWristbandNumberForPlay === "function") {
        playToInsert.wristbandNumber = getWristbandNumberForPlay(playToInsert);
      }
      const bucket = callSheet[targetCat][targetHash];
      if (insertIdx >= 0 && insertIdx < bucket.length) {
        bucket.splice(insertIdx, 0, playToInsert);
      } else {
        bucket.push(playToInsert);
      }

      // CRITICAL: clear drag state BEFORE renderCallSheet, because the
      // hooked renderCallSheet rebuilds the drawer DOM and detaches the
      // source row. Once detached, dragend does NOT bubble to document and
      // our cleanup listener never fires -- leaving body class stuck.
      _gpDrawerClearDragState();
      _gpClearHighlights();

      if (typeof renderCallSheet === "function") renderCallSheet();
      if (typeof saveCallSheet === "function") saveCallSheet();

      // Quick toast so the user gets confirmation
      if (typeof showToast === "function") {
        const cat = (Array.isArray(CALLSHEET_CATEGORIES) ? CALLSHEET_CATEGORIES : [])
          .find((c) => c.id === targetCat);
        const name = cat
          ? typeof getCategoryDisplayName === "function"
            ? getCategoryDisplayName(cat)
            : cat.name
          : targetCat;
        showToast(`Added to ${name} (${targetHash === "left" ? "Left" : "Right"} Hash)`, {
          duration: 1800,
          type: "success",
        });
      }
    },
    true, // capture phase: runs before the grid's bubble drop handler
  );

  // Dragend cleanup safety net (capture phase, in case dragend bubbles)
  document.addEventListener("dragend", () => {
    _gpDrawerClearDragState();
    _gpClearHighlights();
  }, true);

});

function refreshCallSheetGamePlanDrawer() {
  if (!_gpDrawerState.open) return;
  try {
    _gpDrawerRender();
  } catch (err) {
    console.error("refreshCallSheetGamePlanDrawer error:", err);
  }
}
