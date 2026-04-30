function startInlineEdit(td, playIndex, field) {
  if (td.querySelector(".pb-inline-edit")) return;
  const play = filteredPlays[playIndex];
  if (!play) return;
  const original = play[field] || "";

  const input = document.createElement("input");
  input.className = "pb-inline-edit";
  input.type = "text";
  input.value = original;
  td.textContent = "";
  td.appendChild(input);
  input.focus();
  input.select();

  function commit() {
    const newVal = input.value.trim();
    const masterIdx = plays.indexOf(play);
    play[field] = newVal;
    if (masterIdx >= 0) plays[masterIdx][field] = newVal;
    storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
    invalidateFilterCache();
    renderPlaybook();
    if (newVal !== original) showToast("✏️ Updated");
  }

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      input.value = original;
      input.blur();
    }
  });
}

function addPlayFromPlaybook(index) {
  const play = filteredPlays[index];
  if (!play) return;

  const originalIndex = plays.findIndex(
    (p) => p.play === play.play && p.formation === play.formation,
  );

  if (originalIndex >= 0) {
    addToScript(originalIndex);
    showToast(`Added "${play.play}" to script`);
  }
}