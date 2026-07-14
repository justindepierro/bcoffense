async function addPlayFromPlaybook(index) {
  const play = filteredPlays[index];
  if (!play) return;
  const originalIndex = plays.indexOf(play);
  if (originalIndex >= 0) {
    await addToScript(originalIndex);
  }
}

function isPlayHiddenFromPlayers(play) {
  if (!play) return false;
  return play.playerHidden === true || play.hiddenFromPlayers === true;
}

function togglePlayPlayerVisibility(filteredIdx) {
  const index = Number.parseInt(filteredIdx, 10);
  const play =
    Number.isInteger(index) && Array.isArray(filteredPlays)
      ? filteredPlays[index]
      : null;
  if (!play) return;
  if (typeof canEditUser === "function" && !canEditUser()) {
    showToast("Only coaches can change player visibility.", { type: "warning" });
    return;
  }

  const masterIdx = Array.isArray(plays) ? plays.indexOf(play) : -1;
  const target = masterIdx >= 0 ? plays[masterIdx] : play;
  const nextHidden = !isPlayHiddenFromPlayers(target);
  target.playerHidden = nextHidden;
  if ("hiddenFromPlayers" in target) delete target.hiddenFromPlayers;
  target.updatedAt = Date.now();
  if (typeof getCurrentAuthUser === "function") {
    const user = getCurrentAuthUser();
    if (user?.username) target._lastEditedBy = user.username;
  }

  storageManager.setPlaybook(plays);
  if (typeof invalidateFilterCache === "function") invalidateFilterCache();
  if (typeof filterPlays === "function") filterPlays();
  else if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
  showToast(
    nextHidden
      ? "Hidden from player playbook."
      : "Visible in player playbook.",
    { duration: 2200 },
  );
}
