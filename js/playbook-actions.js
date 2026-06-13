async function addPlayFromPlaybook(index) {
  const play = filteredPlays[index];
  if (!play) return;
  const originalIndex = plays.indexOf(play);
  if (originalIndex >= 0) {
    await addToScript(originalIndex);
  }
}
