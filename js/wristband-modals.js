function showWbShortcutHelp() {
  setWristbandOverlayVisibility("wbHelpOverlay", true, {
    visibilityClass: "show",
    openClass: true,
  });
}

function closeWbHelpOverlay() {
  setWristbandOverlayVisibility("wbHelpOverlay", false, {
    visibilityClass: "show",
    openClass: true,
  });
}

// Alias — overlay-close dispatcher strips "Overlay" suffix before calling
function closeWbHelp() {
  closeWbHelpOverlay();
}

function openWbFindReplaceModal() {
  const overlay = document.getElementById("wbFindReplaceOverlay");
  if (overlay) {
    setWristbandOverlayVisibility(overlay, true, {
      visibilityClass: "show",
      openClass: true,
    });
    document.getElementById("wbFindPlayInput").focus();
    document.getElementById("wbFindPlayInput").value = "";
    document.getElementById("wbReplacePlayInput").value = "";
  }
}

function closeWbFindReplaceModal() {
  setWristbandOverlayVisibility("wbFindReplaceOverlay", false, {
    visibilityClass: "show",
    openClass: true,
  });
}

async function executeWbFindReplace() {
  const findInput = document.getElementById("wbFindPlayInput");
  const replaceInput = document.getElementById("wbReplacePlayInput");
  const findStr = findInput.value.trim();
  const replaceStr = replaceInput.value.trim();

  if (!findStr) {
    showToast("Enter a play name to find");
    return;
  }
  if (!replaceStr) {
    showToast("Enter a replacement play name");
    return;
  }

  let matchCount = 0;
  let cellsAffected = 0;
  const findLower = findStr.toLowerCase();

  for (let cardIdx = 0; cardIdx < wristbandCards.length; cardIdx++) {
    const cardData = wristbandCards[cardIdx].data;
    for (let cellIdx = 0; cellIdx < cardData.length; cellIdx++) {
      const play = cardData[cellIdx];
      if (play && play.play && play.play.toLowerCase().includes(findLower)) {
        matchCount++;
      }
    }
  }

  if (matchCount === 0) {
    showToast(`No plays found matching "${findStr}"`);
    return;
  }

  const ok = await showConfirm(
    `Replace ${matchCount} play${matchCount === 1 ? "" : "s"} containing "${findStr}" with "${replaceStr}"?`,
    {
      title: "Find & Replace",
      icon: "🔍",
      confirmText: "Replace All",
      danger: false,
    },
  );

  if (!ok) return;

  saveWristbandState();

  for (let cardIdx = 0; cardIdx < wristbandCards.length; cardIdx++) {
    const cardData = wristbandCards[cardIdx].data;
    for (let cellIdx = 0; cellIdx < cardData.length; cellIdx++) {
      const play = cardData[cellIdx];
      if (play && play.play && play.play.toLowerCase().includes(findLower)) {
        const newPlay = safeDeepClone(play);
        newPlay.play = play.play.replace(
          new RegExp(findStr, "gi"),
          replaceStr,
        );
        wristbandCards[cardIdx].data[cellIdx] = newPlay;
        cellsAffected++;
      }
    }
  }

  closeWbFindReplaceModal();
  renderCardTabs();
  renderWristbandGrid();
  showToast(`✅ Replaced ${cellsAffected} play${cellsAffected === 1 ? "" : "s"}`);
}