/* =========================================================================
   Game Plan — named snapshots (save/load/delete/menu)
   Split out of gameplan.js — see AGENTS.md for ownership map.
   ========================================================================= */

/* -------------------------------------------------------------------------
   Snapshots — save / load / delete named plans (per opponent)
   ------------------------------------------------------------------------- */

function _gpLoadAllSnapshots() {
  return storageManager.get(GP_SNAPSHOTS_KEY, {});
}

function _gpSaveAllSnapshots(all) {
  storageManager.set(GP_SNAPSHOTS_KEY, all);
}

function _gpSnapshotsForOpponent() {
  const all = _gpLoadAllSnapshots();
  const key = _gpActiveOpponentKey();
  return Array.isArray(all[key]) ? all[key] : [];
}

async function saveGamePlanSnapshot() {
  const board = _gpEnsureBoard();
  const total = _gpAllAssignedSigs(board).size;
  if (total === 0) {
    const ok = await showConfirm("No plays drafted yet — save an empty plan anyway?",
      { title: "Save Plan", icon: "💾" });
    if (!ok) return;
  }
  const defaultName = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const name = await showPrompt("Name this plan:", defaultName, {
    title: "Save Plan",
    icon: "💾",
    placeholder: "e.g. v1 base, blitz-heavy, etc.",
  });
  if (!name || !name.trim()) return;
  const all = _gpLoadAllSnapshots();
  const key = _gpActiveOpponentKey();
  if (!Array.isArray(all[key])) all[key] = [];
  all[key].push({
    id: `snap-${Date.now()}`,
    name: name.trim(),
    savedAt: new Date().toISOString(),
    board: safeDeepClone(board),
  });
  _gpSaveAllSnapshots(all);
  showToast(`Saved plan “${name.trim()}”`, { type: "success" });
}

async function openGamePlanSnapshotsMenu() {
  const snaps = _gpSnapshotsForOpponent();
  if (snaps.length === 0) {
    showToast("No saved plans yet for this opponent. Use 💾 Save Plan first.", { type: "info", duration: 3500 });
    return;
  }
  const items = snaps.slice().reverse().map((s) => {
    const when = new Date(s.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const total = Object.values(s.board?.assignments || {}).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
    return { value: s.id, label: `${s.name} • ${total} plays • ${when}` };
  });
  const choice = await showListPicker(
    "Pick a saved plan:",
    items,
    { title: "📂 Saved Plans", icon: "📂" },
  );
  if (!choice) return;
  const action = await showChoice(
    "What do you want to do with this plan?",
    {
      title: "Saved Plan",
      icon: "📂",
      option1: "Load (replaces current board)",
      option2: "Delete",
    },
  );
  if (!action) return;
  if (action === "option1") await _gpLoadSnapshot(choice);
  else if (action === "option2") await _gpDeleteSnapshot(choice);
}

async function _gpLoadSnapshot(snapId) {
  const all = _gpLoadAllSnapshots();
  const key = _gpActiveOpponentKey();
  const snap = (all[key] || []).find((s) => s.id === snapId);
  if (!snap) return;
  const ok = await showConfirm(
    `Load <strong>${escapeHtml(snap.name)}</strong>? This replaces the current game plan board for ${escapeHtml(key === "__unassigned__" ? "this session" : key)}.`,
    { title: "Load Plan", icon: "📂", confirmText: "Load", danger: true },
  );
  if (!ok) return;
  const boards = _gpLoadBoards();
  boards[key] = safeDeepClone(snap.board);
  _gpSaveBoards(boards);
  renderGamePlan();
  showToast(`Loaded “${snap.name}”`, { type: "success" });
}

async function _gpDeleteSnapshot(snapId) {
  const all = _gpLoadAllSnapshots();
  const key = _gpActiveOpponentKey();
  const snap = (all[key] || []).find((s) => s.id === snapId);
  if (!snap) return;
  const ok = await showConfirm(
    `Delete saved plan <strong>${escapeHtml(snap.name)}</strong>?`,
    { title: "Delete Plan", icon: "🗑️", confirmText: "Delete", danger: true },
  );
  if (!ok) return;
  all[key] = (all[key] || []).filter((s) => s.id !== snapId);
  _gpSaveAllSnapshots(all);
  showToast("Plan deleted", { type: "success" });
}
