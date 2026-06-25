function openWbQuickSearch() {
  let overlay = document.getElementById("wbQuickSearchOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "wbQuickSearchOverlay";
    overlay.className = "wb-quicksearch-overlay";
    overlay.setAttribute("data-action", "closeWbQuickSearchOverlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Wristband quick search");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("inert", "");
    overlay.innerHTML = `
      <div class="wb-quicksearch-box">
        <input type="text" class="wb-quicksearch-input" id="wbQuickSearchInput"
               placeholder="Search plays… (type to filter)" autocomplete="off" />
        <div class="wb-quicksearch-results" id="wbQuickSearchResults">
          <div class="wb-quicksearch-empty">Type to search your playbook</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document
      .getElementById("wbQuickSearchInput")
      .addEventListener("input", debounce((e) => {
        renderQuickSearchResults(e.target.value);
      }, 80));

    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeWbQuickSearch();
        return;
      }
      const results = document.getElementById("wbQuickSearchResults");
      const items = results.querySelectorAll(".wb-quicksearch-item");
      if (items.length === 0) return;

      const current = results.querySelector(".wb-quicksearch-item.highlighted");
      let idx = current ? Array.from(items).indexOf(current) : -1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        idx = Math.min(idx + 1, items.length - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
      } else if (e.key === "Enter" && idx >= 0) {
        e.preventDefault();
        items[idx].click();
        return;
      } else {
        return;
      }
      items.forEach((el, i) => el.classList.toggle("highlighted", i === idx));
      if (items[idx]) items[idx].scrollIntoView({ block: "nearest" });
    });
  }

  const input = document.getElementById("wbQuickSearchInput");
  setWristbandOverlayVisibility(overlay, true, {
    visibilityClass: "visible",
    openClass: true,
  });
  input.value = "";
  document.getElementById("wbQuickSearchResults").innerHTML =
    '<div class="wb-quicksearch-empty">Type to search your playbook</div>';
  setTimeout(() => input.focus(), 50);
}

function closeWbQuickSearch() {
  const overlay = document.getElementById("wbQuickSearchOverlay");
  setWristbandOverlayVisibility(overlay, false, {
    visibilityClass: "visible",
    openClass: true,
  });
}

function renderQuickSearchResults(query) {
  const results = document.getElementById("wbQuickSearchResults");
  if (!query.trim()) {
    results.innerHTML =
      '<div class="wb-quicksearch-empty">Type to search your playbook</div>';
    return;
  }
  const q = query.toLowerCase();
  const matches = plays
    .filter((p) => {
      const text =
        `${p.formation} ${p.protection} ${p.play} ${p.type} ${p.personnel}`.toLowerCase();
      return text.includes(q);
    })
    .slice(0, 20);

  if (matches.length === 0) {
    results.innerHTML =
      '<div class="wb-quicksearch-empty">No plays found</div>';
    return;
  }

  results.innerHTML = matches
    .map((p) => {
      const idx = plays.indexOf(p);
      return `<div class="wb-quicksearch-item" data-play-idx="${idx}">
      <span class="cell-play-option-type">${escapeHtml(p.type || "Play")}</span>
      ${escapeHtml(p.formation)} ${escapeHtml(p.protection)} ${escapeHtml(p.play)}
      <span class="td-meta-inline">${escapeHtml(p.personnel || "")}</span>
    </div>`;
    })
    .join("");

  results.querySelectorAll(".wb-quicksearch-item").forEach((item) => {
    item.addEventListener("click", () => {
      const playIdx = parseInt(item.dataset.playIdx, 10);
      addPlayToNextEmpty(playIdx);
      closeWbQuickSearch();
    });
  });
}

function toggleWbFavorite(playIndex) {
  playIndex = parseInt(playIndex, 10);
  if (!Number.isInteger(playIndex) || playIndex < 0) return;
  const idx = wbFavorites.indexOf(playIndex);
  if (idx >= 0) {
    wbFavorites.splice(idx, 1);
  } else {
    wbFavorites.push(playIndex);
  }
  wbFavorites = normalizeWbFavorites(wbFavorites);
  scheduleWristbandAutosave();
  storageManager.set(STORAGE_KEYS.WRISTBAND_FAVORITES, wbFavorites);
  renderWristbandPlays();
}

async function smartFillBySituation() {
  const situations = [
    { label: "1st Down", value: "1" },
    { label: "2nd & Short", value: "2s" },
    { label: "2nd & Long", value: "2l" },
    { label: "3rd & Short", value: "3s" },
    { label: "3rd & Long", value: "3l" },
    { label: "Red Zone", value: "rz" },
    { label: "Goal Line", value: "gl" },
    { label: "2-Minute", value: "2min" },
    { label: "Short Yardage", value: "sy" },
  ];
  const items = situations.map((s) => ({ label: s.label, value: s.value }));
  const picked = await showListPicker("Fill with plays for:", items, {
    title: "Smart Fill by Situation",
    icon: "🧠",
  });
  if (!picked) return;

  const usageMap = getWristbandPlayUsageMap();
  const filtered = plays.filter((p) => {
    switch (picked) {
      case "1":
        return p.preferredDown === "1";
      case "2s":
        return p.preferredDown === "2" && p.preferredDistance === "Short";
      case "2l":
        return (
          p.preferredDown === "2" &&
          (p.preferredDistance === "Medium" || p.preferredDistance === "Long")
        );
      case "3s":
        return p.preferredDown === "3" && p.preferredDistance === "Short";
      case "3l":
        return (
          p.preferredDown === "3" &&
          (p.preferredDistance === "Medium" || p.preferredDistance === "Long")
        );
      case "rz":
        return (
          p.preferredFieldPosition === "Lo-RZ" ||
          p.preferredFieldPosition === "Hi-RZ"
        );
      case "gl":
        return p.preferredFieldPosition === "Goal Line";
      case "2min":
        return p.preferredSituation === "2 Minute";
      case "sy":
        return p.preferredSituation === "Short Yardage";
      default:
        return false;
    }
  }).filter(
    (play) =>
      !wbPreventDuplicates || !usageMap.has(playSignature(play)),
  );

  if (filtered.length === 0) {
    showToast("No plays found for that situation");
    return;
  }

  const cardData = getCurrentCardData();
  const cellsPerCard = getActiveWristbandCellCount();
  const emptyCount = cardData.slice(0, cellsPerCard).filter((c) => c === null).length;
  const toFill = Math.min(filtered.length, emptyCount);

  if (toFill === 0) {
    showToast("No empty cells — clear some first");
    return;
  }

  const sitLabel = situations.find((s) => s.value === picked)?.label || picked;
  const ok = await showConfirm(
    `Add ${toFill} of ${filtered.length} "${sitLabel}" plays to empty cells on ${wristbandCards[currentCardIndex].name}?`,
    { title: "Smart Fill", icon: "🧠", confirmText: `Fill ${toFill} Plays` },
  );
  if (!ok) return;

  saveWristbandState();
  let fillIdx = 0;
  for (
    let cellIdx = 0;
    cellIdx < cellsPerCard && fillIdx < filtered.length;
    cellIdx++
  ) {
    if (wristbandCards[currentCardIndex].data[cellIdx] === null) {
      wristbandCards[currentCardIndex].data[cellIdx] = filtered[fillIdx];
      fillIdx++;
    }
  }

  renderCardTabs();
  renderWristbandGrid();
  renderWristbandPlays();
  showToast(`✅ Added ${fillIdx} "${sitLabel}" plays`);
}
