function renderCardTabs() {
  const container = document.getElementById("cardTabs");
  let html = wristbandCards
    .map((card, i) => {
      const count = card.data.filter((p) => p !== null).length;
      const total = card.data.length;
      const descHtml = card.description
        ? `<span class="card-tab-desc" title="${escapeHtml(card.description)}">${escapeHtml(card.description)}</span>`
        : "";
      return `
        <div class="card-tab ${i === currentCardIndex ? "active" : ""}" data-action="switchCard" data-idx="${i}" title="Double-click to rename">
          <span class="card-tab-name">${escapeHtml(card.name)}</span>
          ${descHtml}
          <span class="card-count">${count}/${total}</span>
        </div>
      `;
    })
    .join("");

  if (wristbandCards.length < MAX_CARDS) {
    html += `<button class="add-card-btn" data-action="addNewCard" title="Add new card">+ Add Card</button>`;
  }

  if (wristbandCards.length < MAX_CARDS) {
    html += `<button class="btn btn-sm wb-duplicate-card-btn" data-action="duplicateCard" title="Duplicate current card">📋 Duplicate</button>`;
  }

  if (wristbandCards.length > 1) {
    html += `<button class="btn btn-danger btn-sm wb-remove-card-btn" data-action="removeCurrentCard" title="Remove current card">🗑 Remove</button>`;
  }

  container.innerHTML = html;
}

function refreshWristbandCardView(opts = {}) {
  renderCardTabs();
  renderWristbandGrid();
  if (opts.updateCardColorPicker) {
    updateCardColorPicker();
  }
}

function switchCard(index) {
  currentCardIndex = index;
  refreshWristbandCardView({ updateCardColorPicker: true });
}

function addNewCard() {
  if (wristbandCards.length >= MAX_CARDS) return;
  mutateWristbandState(() => {
    wristbandCards.push({
      name: `Card ${wristbandCards.length + 1}`,
      data: Array(40).fill(null),
    });
    currentCardIndex = wristbandCards.length - 1;
  });
}

async function removeCurrentCard() {
  if (wristbandCards.length <= 1) return;
  const ok = await showConfirm(
    `Remove ${wristbandCards[currentCardIndex].name}?`,
    { title: "Remove Card", icon: "🗑️", confirmText: "Remove", danger: true },
  );
  if (!ok) return;
  const removedCardIdx = currentCardIndex;
  mutateWristbandState(() => {
    wristbandCards.splice(removedCardIdx, 1);
    shiftWristbandCardCustomizationIndices(removedCardIdx + 1, -1);
    currentCardIndex = Math.min(removedCardIdx, wristbandCards.length - 1);
  });
}

function duplicateCard() {
  if (wristbandCards.length >= MAX_CARDS) {
    showToast(`Maximum ${MAX_CARDS} cards allowed`);
    return;
  }
  const src = wristbandCards[currentCardIndex];
  const clone = {
    name: `${src.name} (Copy)`,
    data: safeDeepClone(src.data),
  };
  const newIdx = currentCardIndex + 1;
  mutateWristbandState(() => {
    wristbandCards.splice(newIdx, 0, clone);
    shiftWristbandCardCustomizationIndices(newIdx, 1);
    for (let si = 0; si < 40; si++) {
      moveWristbandCellCustomization(
        currentCardIndex,
        si,
        newIdx,
        si,
        { clone: true, removeSource: false },
      );
    }
    currentCardIndex = newIdx;
  });
  showToast(`Duplicated as "${escapeHtml(clone.name)}"`);
}

async function renameCard(index) {
  const card = wristbandCards[index];
  if (!card) return;
  const newName = await showPrompt("Rename card:", card.name, {
    title: "Rename Card",
    icon: "✏️",
    placeholder: "Card name",
  });
  if (newName !== null && newName.trim()) {
    card.name = newName.trim();
    renderCardTabs();
    markWristbandDirty();
    scheduleWristbandAutosave();
  }
}

function getCurrentCardData() {
  return wristbandCards[currentCardIndex]?.data || [];
}

function setCurrentCardData(index, play) {
  if (wristbandCards[currentCardIndex]) {
    wristbandCards[currentCardIndex].data[index] = play;
  }
}

async function editCardDescription(index) {
  const card = wristbandCards[index];
  if (!card) return;
  const desc = await showPrompt(
    `Add a description for ${card.name}:`,
    card.description || "",
    {
      title: "Card Description",
      icon: "📝",
      placeholder: "e.g. Run Heavy, Pass Heavy, 2-Minute",
    },
  );
  if (desc === null) return;
  card.description = desc.trim();
  renderCardTabs();
  markWristbandDirty();
  scheduleWristbandAutosave();
}