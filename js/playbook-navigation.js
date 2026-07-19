function _renderPagination(totalPages, totalFiltered) {
  let pager = document.getElementById("pbPagination");
  if (totalFiltered <= PLAYS_PER_PAGE) {
    if (pager) pager.remove();
    return;
  }
  if (!pager) {
    pager = document.createElement("div");
    pager.id = "pbPagination";
    pager.className = "pb-pagination";
    const container = document.getElementById("playbookContainer");
    if (container) container.appendChild(pager);
  }
  pager.innerHTML = `
    <button class="btn btn-sm" data-action="pbPagePrev" ${currentPage === 0 ? "disabled" : ""}>◀ Prev</button>
    <span class="pb-page-info">Page ${currentPage + 1} of ${totalPages}</span>
    <button class="btn btn-sm" data-action="pbPageNext" ${currentPage >= totalPages - 1 ? "disabled" : ""}>Next ▶</button>
  `;
}

function pbPagePrev() {
  if (currentPage > 0) {
    currentPage--;
    requestRenderPlaybook();
  }
}

function pbPageNext() {
  const totalPages = Math.ceil(filteredPlays.length / PLAYS_PER_PAGE);
  if (currentPage < totalPages - 1) {
    currentPage++;
    requestRenderPlaybook();
  }
}

function selectPlaybookRow(index) {
  index = parseInt(index, 10);
  if (!Number.isInteger(index)) return;
  const tbody = document.querySelector("#playbookTable tbody");
  const cards = document.querySelectorAll("#pbCards .pb-card");
  if (!tbody) return;

  tbody.querySelectorAll("tr.selected").forEach((row) => {
    row.classList.remove("selected");
  });
  cards.forEach((card) => card.classList.remove("selected"));

  const row = tbody.querySelector(`tr[data-idx="${index}"]`);
  if (row) {
    row.classList.add("selected");
  }

  const card = document.querySelector(`#pbCards .pb-card[data-idx="${index}"]`);
  if (card) {
    card.classList.add("selected");
  }

  selectedRowIndex = index;
  // Selecting a row is intentionally lightweight. Readiness has its own
  // explicit per-play button so a normal click/double-click never expands a
  // large panel above the table and steals the editor interaction.
  if (typeof closePlaybookReadinessPanel === "function") closePlaybookReadinessPanel();
}

function copyPlayName(playName) {
  navigator.clipboard.writeText(playName).then(() => {
    showToast(`Copied: ${playName}`);
  });
}
