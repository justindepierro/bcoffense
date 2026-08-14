/* Game Plan 4×6 Index Cards — quick-call cards linked to Game Plan buckets. */
let _gpIndexCardSelectedId = "";
let _gpIndexCardSelectedSide = "front";
let _gpIndexCardCloseTimer = 0;

function _gpIndexCards(board = _gpEnsureBoard()) { return Array.isArray(board.indexCards) ? board.indexCards : []; }
function _gpIndexCardId() { return `index-card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function _gpNewIndexCard(name = "Game Day Card") { return { id: _gpIndexCardId(), name, front: [], back: [], createdAt: new Date().toISOString() }; }
function _gpCurrentIndexCard(board = _gpEnsureBoard()) {
  const cards = _gpIndexCards(board);
  let card = cards.find((item) => item.id === _gpIndexCardSelectedId);
  if (!card && cards.length) card = cards[0];
  if (card) _gpIndexCardSelectedId = card.id;
  return card || null;
}
function _gpIndexCardSide(card) { return _gpIndexCardSelectedSide === "back" ? card.back : card.front; }
function _gpIndexCardBuckets(board) { return _gpGetBoardBoxes(board, { includeHolding: false, includeHidden: true }); }
function _gpIndexCardBucketPlays(board, bucket) { const list = board.assignments?.[bucket.sourceBoxId]; return Array.isArray(list) ? list : []; }
function _gpIndexCardCall(play) { return typeof getFullCall === "function" ? getFullCall(play, { showLineCall: false, showEmoji: true, useSquares: true }) : escapeHtml(play?.play || ""); }

function _gpIndexCardCardMarkup(card, side, board, options = {}) {
  const buckets = Array.isArray(card?.[side]) ? card[side] : [];
  const controls = Boolean(options.controls);
  const printable = Boolean(options.printable);
  const bucketMarkup = buckets.map((bucket) => {
    const plays = _gpIndexCardBucketPlays(board, bucket);
    const playsMarkup = plays.length ? plays.map((play) => `<li>${_gpIndexCardCall(play)}</li>`).join("") : `<li class="gp-index-empty">Add a Game Plan bucket</li>`;
    return `<section class="gp-index-bucket"><header><strong>${escapeHtml(bucket.label || "Untitled")}</strong>${controls ? `<span class="gp-index-bucket-actions"><button type="button" data-gp-index-action="source" data-id="${escapeAttr(bucket.id)}" title="Choose Game Plan source">↻</button><button type="button" data-gp-index-action="remove" data-id="${escapeAttr(bucket.id)}" title="Remove bucket">×</button></span>` : ""}</header><ol>${playsMarkup}</ol></section>`;
  }).join("");
  const empty = buckets.length ? "" : `<div class="gp-index-empty-card">Use <strong>+ Add bucket</strong> to build this side.</div>`;
  return `<article class="gp-index-card ${printable ? "gp-index-card-print" : ""}"><div class="gp-index-card-head"><span>${escapeHtml(card?.name || "Game Day Card")}</span><span>${side === "front" ? "Front" : "Back"}</span></div><div class="gp-index-card-grid">${bucketMarkup}${empty}</div></article>`;
}

function _gpRenderIndexCardBuilder() {
  const overlay = document.getElementById("gpIndexCardBuilder");
  if (!overlay) return;
  const board = _gpEnsureBoard();
  const cards = _gpIndexCards(board);
  const card = _gpCurrentIndexCard(board);
  const tabs = cards
    .map((item, index) => `<button type="button" class="btn btn-sm ${item.id === card?.id ? "btn-primary" : "btn-outline"}" data-gp-index-action="card" data-id="${escapeAttr(item.id)}">${escapeHtml(item.name || `Card ${index + 1}`)}</button>`)
    .join("");
  const editorMarkup = card
    ? `<div class="gp-index-side-tabs"><button type="button" class="btn ${_gpIndexCardSelectedSide === "front" ? "btn-primary" : "btn-outline"}" data-gp-index-action="side" data-side="front">Front</button><button type="button" class="btn ${_gpIndexCardSelectedSide === "back" ? "btn-primary" : "btn-outline"}" data-gp-index-action="side" data-side="back">Back</button><span>4 × 6 in · two columns</span></div>${_gpIndexCardCardMarkup(card, _gpIndexCardSelectedSide, board, { controls: true })}<button type="button" class="btn btn-outline gp-index-add" data-gp-index-action="add">＋ Add bucket</button>`
    : "<p class=\"gp-index-empty-state\">No card yet.</p>";

  overlay.innerHTML = `<div class="custom-modal gp-index-modal" role="dialog" aria-modal="true" aria-labelledby="gpIndexCardTitle"><div class="custom-modal-header gp-index-modal-header"><span class="custom-modal-icon">🗂️</span><h3 class="custom-modal-title" id="gpIndexCardTitle">4×6 Game Day Index Cards</h3><button type="button" class="btn btn-ghost gp-index-close" data-gp-index-action="close" aria-label="Close Game Day Index Cards" title="Close">×</button></div><div class="gp-index-scroll"><div class="custom-modal-body gp-index-intro">Build a short, signal-ready menu from the active Game Plan. Buckets stay linked to their source plays.</div><div class="gp-index-toolbar"><div class="gp-index-card-tabs">${tabs}</div><button type="button" class="btn btn-sm btn-outline" data-gp-index-action="new">＋ Card</button>${card ? `<button type="button" class="btn btn-sm btn-outline" data-gp-index-action="rename">Rename</button><button type="button" class="btn btn-sm btn-danger" data-gp-index-action="delete-card">Delete</button>` : ""}</div>${editorMarkup}</div><div class="custom-modal-actions"><button type="button" class="btn btn-secondary" data-gp-index-action="close">Close</button>${cards.length ? `<button type="button" class="btn btn-primary" data-gp-index-action="print">🖨️ Print front & back</button>` : ""}</div></div>`;
  overlay.querySelectorAll("[data-gp-index-action]").forEach((button) => button.addEventListener("click", _gpHandleIndexCardAction));

  // Re-rendering replaces the scroll body. Refresh the existing layer state
  // without moving focus so touch scroll containment keeps pointing at the
  // current editor instead of a detached node.
  if (overlay.dataset.layerOpen === "true" && typeof openLayer === "function") {
    openLayer(overlay, {
      id: "gp-index-cards",
      blocking: true,
      safeArea: true,
      scrollElement: overlay.querySelector(".gp-index-scroll") || overlay.querySelector(".gp-index-modal") || overlay,
      onEscape: () => closeGamePlanIndexCards(),
    });
  }
}

function openGamePlanIndexCards() {
  let overlay = document.getElementById("gpIndexCardBuilder");
  const returnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "gpIndexCardBuilder";
    overlay.className = "custom-modal-overlay gp-index-overlay";
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeGamePlanIndexCards();
    });
    document.body.appendChild(overlay);
  }
  const board = _gpEnsureBoard();
  if (!_gpIndexCards(board).length) { const card = _gpNewIndexCard(); _gpUpdateBoard((next) => { next.indexCards = [card]; }); _gpIndexCardSelectedId = card.id; }
  window.clearTimeout(_gpIndexCardCloseTimer);
  _gpRenderIndexCardBuilder();
  // `openLayer()` owns initial focus. Make the animated overlay focusable
  // before registering it so the managed close target can actually receive
  // that focus (a visibility:hidden overlay rejects programmatic focus).
  overlay.classList.add("visible");
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "gp-index-cards",
      blocking: true,
      safeArea: true,
      scrollElement: overlay.querySelector(".gp-index-scroll") || overlay.querySelector(".gp-index-modal") || overlay,
      initialFocus: overlay.querySelector(".gp-index-close") || overlay.querySelector(".gp-index-modal") || overlay,
      onEscape: () => closeGamePlanIndexCards(),
      returnFocus,
    });
  } else if (typeof trapFocus === "function") {
    trapFocus(overlay);
    overlay.querySelector(".gp-index-close")?.focus({ preventScroll: true });
  }
}
function closeGamePlanIndexCards() {
  const overlay = document.getElementById("gpIndexCardBuilder");
  if (!overlay) return;
  if (typeof closeLayer === "function") closeLayer("gp-index-cards");
  overlay.classList.remove("visible");
  window.clearTimeout(_gpIndexCardCloseTimer);
  _gpIndexCardCloseTimer = window.setTimeout(() => {
    if (!overlay.classList.contains("visible")) overlay.remove();
  }, 180);
}

async function _gpIndexCardAddBucket() {
  const template = await showListPicker("Choose a common situation, then connect it to an active Game Plan bucket.", GP_BUCKET_TEMPLATES.map((item) => ({ value: item.id, label: `${item.icon} ${item.label}`, sublabel: item.description })), { title: "Add index-card bucket", icon: "＋" });
  if (!template) return;
  const cfg = GP_BUCKET_TEMPLATES.find((item) => item.id === template); const board = _gpEnsureBoard(); const sources = _gpIndexCardBuckets(board);
  const sourceId = await showListPicker("Choose the Game Plan bucket that supplies these plays.", [{ value: "", label: "Leave blank for now", sublabel: "You can link it later." }, ...sources.map((box) => ({ value: box.id, label: box.label, sublabel: `${(board.assignments?.[box.id] || []).length} plays` }))], { title: "Source bucket", icon: "📋" });
  if (sourceId === null) return;
  const source = sources.find((box) => box.id === sourceId);
  const label = await showPrompt("Bucket label:", cfg?.defaultName || source?.label || cfg?.label || "Bucket", { title: "Name index-card bucket", icon: cfg?.icon || "🗂️" });
  if (!label?.trim()) return;
  const card = _gpCurrentIndexCard(board); if (!card) return; const side = _gpIndexCardSelectedSide;
  _gpUpdateBoard((next) => { const target = (next.indexCards || []).find((item) => item.id === card.id); if (!target) return; target[side] = Array.isArray(target[side]) ? target[side] : []; target[side].push({ id: `bucket-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: label.trim(), sourceBoxId: sourceId || "" }); });
  _gpRenderIndexCardBuilder();
}

async function _gpIndexCardChooseSource(bucketId) {
  const board = _gpEnsureBoard(); const card = _gpCurrentIndexCard(board); const bucket = _gpIndexCardSide(card).find((item) => item.id === bucketId); if (!bucket) return;
  const sources = _gpIndexCardBuckets(board); const sourceId = await showListPicker("Choose a Game Plan bucket.", [{ value: "", label: "Leave blank" }, ...sources.map((box) => ({ value: box.id, label: box.label, sublabel: `${(board.assignments?.[box.id] || []).length} plays` }))], { title: "Change source", icon: "↻" });
  if (sourceId === null) return;
  _gpUpdateBoard((next) => { const target = (next.indexCards || []).find((item) => item.id === card.id); const item = target?.[_gpIndexCardSelectedSide]?.find((entry) => entry.id === bucketId); if (item) item.sourceBoxId = sourceId || ""; }); _gpRenderIndexCardBuilder();
}

async function _gpHandleIndexCardAction(event) {
  const button = event.currentTarget; const action = button.dataset.gpIndexAction; const id = button.dataset.id;
  if (action === "close") return closeGamePlanIndexCards();
  if (action === "card") { _gpIndexCardSelectedId = id; _gpRenderIndexCardBuilder(); return; }
  if (action === "side") { _gpIndexCardSelectedSide = button.dataset.side === "back" ? "back" : "front"; _gpRenderIndexCardBuilder(); return; }
  if (action === "add") return _gpIndexCardAddBucket(); if (action === "source") return _gpIndexCardChooseSource(id);
  const board = _gpEnsureBoard(); const card = _gpCurrentIndexCard(board);
  if (action === "new") { const name = await showPrompt("Card name:", `Game Day Card ${_gpIndexCards(board).length + 1}`, { title: "New index card", icon: "🗂️" }); if (!name?.trim()) return; const next = _gpNewIndexCard(name.trim()); _gpUpdateBoard((target) => { target.indexCards = [...(target.indexCards || []), next]; }); _gpIndexCardSelectedId = next.id; return _gpRenderIndexCardBuilder(); }
  if (!card) return;
  if (action === "rename") { const name = await showPrompt("Card name:", card.name || "Game Day Card", { title: "Rename index card", icon: "🗂️" }); if (!name?.trim()) return; _gpUpdateBoard((target) => { const item = target.indexCards.find((entry) => entry.id === card.id); if (item) item.name = name.trim(); }); return _gpRenderIndexCardBuilder(); }
  if (action === "remove") { _gpUpdateBoard((target) => { const item = target.indexCards.find((entry) => entry.id === card.id); if (item) item[_gpIndexCardSelectedSide] = (item[_gpIndexCardSelectedSide] || []).filter((entry) => entry.id !== id); }); return _gpRenderIndexCardBuilder(); }
  if (action === "delete-card") { const ok = await showConfirm(`Delete <strong>${escapeHtml(card.name)}</strong>? This only removes the compact card—not Game Plan plays or buckets.`, { title: "Delete index card", icon: "🗑️", confirmText: "Delete" }); if (!ok) return; _gpUpdateBoard((target) => { target.indexCards = (target.indexCards || []).filter((entry) => entry.id !== card.id); }); _gpIndexCardSelectedId = ""; return _gpRenderIndexCardBuilder(); }
  if (action === "print") return printGamePlanIndexCards();
}

function printGamePlanIndexCards() {
  const board = _gpEnsureBoard(); const cards = _gpIndexCards(board); if (!cards.length) return;
  let host = document.getElementById("gpIndexCardPrintRoot"); if (!host) { host = document.createElement("div"); host.id = "gpIndexCardPrintRoot"; document.body.appendChild(host); }
  host.innerHTML = cards.flatMap((card) => ["front", "back"].map((side) => `<section class="gp-index-print-page">${_gpIndexCardCardMarkup(card, side, board, { printable: true })}</section>`)).join("");
  document.body.classList.add("gp-index-printing"); let style = document.getElementById("gpIndexCardPrintStyle"); if (!style) { style = document.createElement("style"); style.id = "gpIndexCardPrintStyle"; document.head.appendChild(style); } style.textContent = "@page { size: 4in 6in; margin: 0.08in; }";
  window.setTimeout(() => { window.print(); window.setTimeout(() => document.body.classList.remove("gp-index-printing"), 500); }, 80);
}
