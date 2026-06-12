/* =========================================================================
   Practice Script — outbound Game Plan and Wristband integrations
   ========================================================================= */

const SCRIPT_WRISTBAND_IDENTITY_FIELDS = [
  "type",
  "personnel",
  "formation",
  "formTag1",
  "formTag2",
  "under",
  "back",
  "shift",
  "motion",
  "protection",
  "lineCall",
  "play",
  "playTag1",
  "playTag2",
  "basePlay",
  "oneWord",
];

function _scriptIntegrationPlaySnapshot(scriptPlay) {
  const playbookPlays = typeof plays !== "undefined" && Array.isArray(plays) ? plays : [];
  const callKey = _scriptIntegrationCallIdentity(scriptPlay);
  const tagKey =
    typeof getPlayIdentityKey === "function"
      ? getPlayIdentityKey(scriptPlay, "tag", { trim: false })
      : "";
  const playbookPlay =
    playbookPlays.find(
      (candidate) =>
        callKey && _scriptIntegrationCallIdentity(candidate) === callKey,
    ) ||
    playbookPlays.find(
      (candidate) =>
        tagKey &&
        getPlayIdentityKey(candidate, "tag", { trim: false }) === tagKey,
    ) ||
    playbookPlays.find(
      (candidate) =>
        typeof playsMatch === "function" && playsMatch(candidate, scriptPlay),
    );
  const snapshot = {
    ...(playbookPlay || {}),
    ...scriptPlay,
  };
  if (playbookPlay?.id) {
    snapshot.id = playbookPlay.id;
  } else {
    delete snapshot.id;
  }
  delete snapshot.isSeparator;
  delete snapshot._gpFlags;
  return snapshot;
}

function _getScriptIntegrationSource() {
  const selectedIndices =
    typeof bulkSelectedIndices !== "undefined" && Array.isArray(bulkSelectedIndices)
      ? [...new Set(bulkSelectedIndices)]
        .filter((index) => Number.isInteger(index) && script[index] && !script[index].isSeparator)
        .sort((a, b) => a - b)
      : [];
  const sourcePlays = selectedIndices.length
    ? selectedIndices.map((index) => script[index])
    : script.filter((item) => item && !item.isSeparator);
  return {
    plays: sourcePlays.map(_scriptIntegrationPlaySnapshot),
    selected: selectedIndices.length > 0,
  };
}

function _uniqueScriptIntegrationPlays(sourcePlays, keyForPlay) {
  const seen = new Set();
  const unique = [];
  sourcePlays.forEach((play) => {
    const key = keyForPlay(play);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(play);
  });
  return unique;
}

async function sendScriptToGamePlan() {
  if (
    typeof _gpEnsureBoard !== "function" ||
    typeof _gpUpdateBoard !== "function" ||
    typeof _gpPlaySignature !== "function"
  ) {
    showToast("Game Plan is not ready yet.", { type: "error" });
    return;
  }
  const source = _getScriptIntegrationSource();
  if (!source.plays.length) {
    showToast("Add plays to the Script first.", { type: "warning" });
    return;
  }

  const routeChoice = await showChoice(
    `<p>Send <strong>${source.plays.length}</strong> ${source.selected ? "selected " : ""}Script play${source.plays.length === 1 ? "" : "s"} to the Game Plan?</p>`,
    {
      title: "Send Script to Game Plan",
      icon: "🎯",
      option1: "Auto-route by rules/type",
      option2: "Pick one box",
    },
  );
  if (!routeChoice) return;

  const board = _gpEnsureBoard();
  const allBoxItems = _gpGetBoardBoxes(board, { includeHolding: true })
    .map((box) => ({
      value: box.id,
      label: box.label,
    }));
  let selectedBoxId = null;
  if (routeChoice === "option2") {
    selectedBoxId = await showListPicker("Choose a Game Plan box:", allBoxItems, {
      title: "Send Script to Box",
      icon: "🎯",
    });
    if (!selectedBoxId) return;
  }

  const uniqueSource = _uniqueScriptIntegrationPlays(
    source.plays,
    _scriptIntegrationCallIdentity,
  );
  const assigned = new Set(
    Object.values(board.assignments || {})
      .flat()
      .filter(Boolean)
      .map(_scriptIntegrationCallIdentity),
  );
  const eligibleSource = uniqueSource.filter(
    (play) => _gpPlayAllowedOnBoard(play, board),
  );
  const restricted = uniqueSource.length - eligibleSource.length;
  const candidates = eligibleSource.filter(
    (play) => !assigned.has(_scriptIntegrationCallIdentity(play)),
  );
  const skipped = source.plays.length - candidates.length;
  if (!candidates.length) {
    showToast(
      restricted > 0
        ? "This game plan template accepts passing play types only."
        : "Those Script plays are already on the Game Plan.",
      {
        type: restricted > 0 ? "warning" : "info",
      },
    );
    return;
  }

  const byBox = {};
  candidates.forEach((play) => {
    const boxId =
      selectedBoxId || _gpAutoDestinationForPlay(play, board);
    if (!byBox[boxId]) byBox[boxId] = [];
    byBox[boxId].push(play);
  });
  const breakdown = Object.entries(byBox)
    .map(([boxId, boxPlays]) => {
      const label =
        typeof _gpBoxLabel === "function" ? _gpBoxLabel(boxId) : boxId;
      return `<li>${escapeHtml(label)}: <strong>${boxPlays.length}</strong></li>`;
    })
    .join("");
  const confirmed = await showConfirm(
    `<p>Send <strong>${candidates.length}</strong> play${candidates.length === 1 ? "" : "s"} from the Script?</p>
     <ul>${breakdown}</ul>
     ${skipped ? `<p>${skipped} repeated, restricted, or already assigned play${skipped === 1 ? "" : "s"} will be skipped.</p>` : ""}`,
    {
      title: "Send Script to Game Plan",
      icon: "🎯",
      confirmText: "Send",
    },
  );
  if (!confirmed) return;

  let added = 0;
  _gpUpdateBoard((latestBoard) => {
    const existing = new Set(
      Object.values(latestBoard.assignments || {})
        .flat()
        .filter(Boolean)
        .map(_scriptIntegrationCallIdentity),
    );
    Object.entries(byBox).forEach(([boxId, boxPlays]) => {
      if (!Array.isArray(latestBoard.assignments[boxId])) {
        latestBoard.assignments[boxId] = [];
      }
      boxPlays.forEach((play) => {
        const signature = _scriptIntegrationCallIdentity(play);
        if (
          existing.has(signature) ||
          !_gpPlayAllowedOnBoard(play, latestBoard)
        ) {
          return;
        }
        latestBoard.assignments[boxId].push({ ...play });
        existing.add(signature);
        added += 1;
      });
    });
  });

  if (typeof requestRenderGamePlan === "function") requestRenderGamePlan();
  showToast(
    `Sent ${added} Script play${added === 1 ? "" : "s"} to the Game Plan${skipped ? ` (${skipped} skipped)` : ""}.`,
    { type: "success", duration: 3500 },
  );
  if (typeof showTab === "function") showTab("gameplan");
}

function _scriptIntegrationCallIdentity(play) {
  if (typeof getPlayIdentityKey === "function") {
    return getPlayIdentityKey(play, SCRIPT_WRISTBAND_IDENTITY_FIELDS, {
      trim: false,
    });
  }
  return [
    play.type,
    play.personnel,
    play.formation,
    play.play,
    play.playTag1,
    play.playTag2,
  ].join("|");
}

function _scriptWristbandCardName(baseName, cardNumber, cardCount) {
  const cleanName = String(baseName || "Practice Script").trim() || "Practice Script";
  return cardCount > 1
    ? `${cleanName} ${cardNumber}/${cardCount}`
    : cleanName;
}

async function _confirmScriptWristbandTrim(playCount, capacity) {
  if (playCount <= capacity) return true;
  return showConfirm(
    `The Script has ${playCount} unique plays, but this option has room for ${capacity}. Continue with the first ${capacity}?`,
    {
      title: "Wristband Capacity",
      icon: "🃏",
      confirmText: "Continue",
      cancelText: "Cancel",
    },
  );
}

async function sendScriptToWristband() {
  if (
    typeof wristbandCards === "undefined" ||
    !Array.isArray(wristbandCards) ||
    typeof mutateWristbandState !== "function"
  ) {
    showToast("Wristband is not ready yet.", { type: "error" });
    return;
  }
  const source = _getScriptIntegrationSource();
  if (!source.plays.length) {
    showToast("Add plays to the Script first.", { type: "warning" });
    return;
  }
  const uniquePlays = _uniqueScriptIntegrationPlays(
    source.plays,
    _scriptIntegrationCallIdentity,
  );
  const repeatedCount = source.plays.length - uniquePlays.length;
  const mode = await showChoice(
    `<p>Send <strong>${uniquePlays.length}</strong> unique ${source.selected ? "selected " : ""}Script play${uniquePlays.length === 1 ? "" : "s"} to the Wristband?</p>
     ${repeatedCount ? `<p>${repeatedCount} repeated Script call${repeatedCount === 1 ? "" : "s"} will be skipped.</p>` : ""}`,
    {
      title: "Send Script to Wristband",
      icon: "🃏",
      option1: "Build new card(s)",
      option2: "Fill empty cells",
    },
  );
  if (!mode) return;

  const cellsPerCard = getActiveWristbandCellCount();
  const maxCards = MAX_CARDS;
  const scriptName =
    document.getElementById("scriptName")?.value || "Practice Script";
  let added = 0;

  if (mode === "option1") {
    const reusableStarter =
      wristbandCards.length === 1 &&
      !(wristbandCards[0]?.data || []).some(Boolean);
    const availableCards =
      maxCards - wristbandCards.length + (reusableStarter ? 1 : 0);
    const capacity = Math.max(0, availableCards * cellsPerCard);
    if (capacity === 0) {
      showToast(
        `Maximum ${maxCards} Wristband cards reached. Use Fill Empty Cells or remove a card first.`,
        { type: "warning", duration: 4000 },
      );
      return;
    }
    const shouldContinue = await _confirmScriptWristbandTrim(
      uniquePlays.length,
      capacity,
    );
    if (!shouldContinue) return;
    const playsToAdd = uniquePlays.slice(0, capacity);
    const cardCount = Math.ceil(playsToAdd.length / cellsPerCard);

    mutateWristbandState(() => {
      let playOffset = 0;
      let lastCardIndex = currentCardIndex;
      for (let cardNumber = 1; cardNumber <= cardCount; cardNumber += 1) {
        const data = Array(CELLS_PER_CARD).fill(null);
        playsToAdd
          .slice(playOffset, playOffset + cellsPerCard)
          .forEach((play, index) => {
            data[index] = safeDeepClone(play);
            added += 1;
          });
        const card = {
          name: _scriptWristbandCardName(scriptName, cardNumber, cardCount),
          data,
        };
        if (reusableStarter && cardNumber === 1) {
          wristbandCards[0] = { ...wristbandCards[0], ...card };
          lastCardIndex = 0;
        } else {
          wristbandCards.push(card);
          lastCardIndex = wristbandCards.length - 1;
        }
        playOffset += cellsPerCard;
      }
      currentCardIndex = lastCardIndex;
    }, { updateCardColorPicker: true });
  } else {
    const existingCards = wristbandCards.length || 1;
    const cardOrder = Array.from(
      { length: existingCards },
      (_, offset) => (currentCardIndex + offset) % existingCards,
    );
    const emptyCells = wristbandCards.length
      ? cardOrder.reduce(
        (total, cardIndex) =>
          total +
          (wristbandCards[cardIndex]?.data || [])
            .slice(0, cellsPerCard)
            .filter((play) => play === null).length,
        0,
      )
      : cellsPerCard;
    if (emptyCells === 0) {
      showToast("No empty Wristband cells are available.", {
        type: "warning",
      });
      return;
    }
    const shouldContinue = await _confirmScriptWristbandTrim(
      uniquePlays.length,
      emptyCells,
    );
    if (!shouldContinue) return;
    const playsToAdd = uniquePlays.slice(0, emptyCells);

    mutateWristbandState(() => {
      if (wristbandCards.length === 0) {
        wristbandCards.push({
          name: _scriptWristbandCardName(scriptName, 1, 1),
          data: Array(CELLS_PER_CARD).fill(null),
        });
        currentCardIndex = 0;
      }
      const orderedCardIndices = Array.from(
        { length: wristbandCards.length },
        (_, offset) => (currentCardIndex + offset) % wristbandCards.length,
      );
      let playIndex = 0;
      for (const cardIndex of orderedCardIndices) {
        const cardData = wristbandCards[cardIndex].data;
        for (
          let cellIndex = 0;
          cellIndex < Math.min(cardData.length, cellsPerCard) &&
          playIndex < playsToAdd.length;
          cellIndex += 1
        ) {
          if (cardData[cellIndex] !== null) continue;
          cardData[cellIndex] = safeDeepClone(playsToAdd[playIndex]);
          playIndex += 1;
          added += 1;
        }
        if (playIndex >= playsToAdd.length) {
          currentCardIndex = cardIndex;
          break;
        }
      }
    }, { updateCardColorPicker: true });
  }

  if (typeof showTab === "function") showTab("wristband");
  if (
    typeof wristbandType !== "undefined" &&
    !wristbandType &&
    typeof startClassicWristband === "function"
  ) {
    startClassicWristband();
  }
  showToast(
    `Sent ${added} Script play${added === 1 ? "" : "s"} to the Wristband${repeatedCount ? ` (${repeatedCount} repeat${repeatedCount === 1 ? "" : "s"} skipped)` : ""}.`,
    { type: "success", duration: 3500 },
  );
}
