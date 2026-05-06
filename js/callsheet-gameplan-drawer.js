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
  search: "",
  searchTimer: null,
};

// Plays currently rendered in the drawer (used by drag drop to look up by index)
window._gpDrawerVisiblePlays = [];

/* ---------- Source plays ---------------------------------------------------- */

function _gpDrawerSourcePlays() {
  if (!Array.isArray(plays)) return [];
  if (typeof getGamePlanTags !== "function" || typeof playSignature !== "function") {
    return [];
  }
  const tags = getGamePlanTags() || {};

  if (_gpDrawerState.scope === "active") {
    const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
    const opp = gw && gw.opponentName ? gw.opponentName : "";
    if (!opp) return [];
    const sigs = new Set(tags[opp] || []);
    if (!sigs.size) return [];
    return plays.filter((p) => sigs.has(playSignature(p)));
  }

  // "all" — union of every opponent's tags
  const all = new Set();
  Object.values(tags).forEach((arr) => (arr || []).forEach((s) => all.add(s)));
  if (!all.size) return [];
  return plays.filter((p) => all.has(playSignature(p)));
}

function _gpDrawerFilterAndSort(source) {
  let out = source.slice();

  // Type chip filter
  if (_gpDrawerState.type) {
    out = out.filter((p) => (p.type || "") === _gpDrawerState.type);
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

  // Sort: by type, then formation, then play
  out.sort((a, b) => {
    const ta = (a.type || "").localeCompare(b.type || "");
    if (ta) return ta;
    const fa = (a.formation || "").localeCompare(b.formation || "");
    if (fa) return fa;
    return (a.play || "").localeCompare(b.play || "");
  });

  return out;
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

/* ---------- Render --------------------------------------------------------- */

function _gpDrawerRender() {
  const drawer = document.getElementById("gpDrawer");
  if (!drawer) return;

  const source = _gpDrawerSourcePlays();
  const visible = _gpDrawerFilterAndSort(source);
  window._gpDrawerVisiblePlays = visible;

  // Counts
  const totalEl = document.getElementById("gpDrawerCount");
  if (totalEl) totalEl.textContent = `${visible.length} of ${source.length}`;

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
          ? `No plays tagged for <strong>${escapeHtml(opp)}</strong> yet. Open the Game Plan tab and tag plays to fill this drawer.`
          : `No active opponent set. Open the Tendencies tab and mark a team as the active opponent.`
        : `No plays tagged for any opponent yet. Open the Game Plan tab to tag plays.`;
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
      return `
        <div class="gp-drawer-row" draggable="true"
             data-gp-idx="${idx}"
             title="Drag onto a call sheet category">
          <span class="gp-drawer-grip" aria-hidden="true">⋮⋮</span>
          <div class="gp-drawer-row-body">
            <div class="gp-drawer-call">${call}</div>
            ${meta ? `<div class="gp-drawer-meta">${highlightedMeta}</div>` : ""}
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

function _gpDrawerOnDragStart(event) {
  const row = event.currentTarget;
  const idx = parseInt(row.dataset.gpIdx, 10);
  if (Number.isNaN(idx)) return;
  event.dataTransfer.setData("source", "gameplan");
  event.dataTransfer.setData("gpIndex", String(idx));
  event.dataTransfer.effectAllowed = "copy";
  row.classList.add("gp-drawer-row-dragging");
  // Visual hint: highlight all category drop zones
  document.body.classList.add("gp-drag-active");
}

function _gpDrawerOnDragEnd(event) {
  event.currentTarget.classList.remove("gp-drawer-row-dragging");
  document.body.classList.remove("gp-drag-active");
}

/* ---------- Public API ----------------------------------------------------- */

function openGameplanDrawer() {
  _gpDrawerState.open = true;
  const drawer = document.getElementById("gpDrawer");
  if (drawer) {
    drawer.classList.add("gp-drawer-open");
    drawer.removeAttribute("inert");
    drawer.setAttribute("aria-hidden", "false");
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
});
