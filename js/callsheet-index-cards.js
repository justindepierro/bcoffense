/* Compact 4×6 front/back cards. Index cards are a focused, editable view of
 * the canonical Call Sheet — they never create a second copy of a call. */
let _csIndexCardId = "";
let _csIndexSide = "front";

function _csCards() { return Array.isArray(callSheetSettings.indexCards) ? callSheetSettings.indexCards : []; }
function _csActiveCard() { const cards = _csCards(); const card = cards.find((item) => item.id === _csIndexCardId) || cards[0] || null; if (card) _csIndexCardId = card.id; return card; }
function _csNewCard(name) { return { id: `cs-index-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, front: [], back: [] }; }
function _csName(id) { const category = CALLSHEET_CATEGORIES.find((item) => item.id === id); return category ? getCategoryDisplayName(category) : "Unlinked"; }
function _csPersistCards() { saveCallSheetSettings(); if (typeof renderCallSheet === "function") renderCallSheet(); }
function _csSafeList(value) { return Array.isArray(value) ? value : []; }
function _csBucketHash(bucket) { return bucket?.hash === "right" ? "right" : bucket?.hash === "both" ? "both" : "left"; }
function _csIndexPlayKey(play, hash, index) {
  return [hash, play?.id || play?.playId || play?._id || "", play?.wristbandNumber || "", play?.personnel || "", play?.formation || "", play?.protection || "", play?.play || "", index].join("|");
}
function _csBucketRows(bucket) {
  const data = callSheet?.[bucket?.categoryId] || {};
  const hash = _csBucketHash(bucket);
  const makeRows = (items, side) => _csSafeList(items).map((play, index) => ({ play, hash: side, index, key: _csIndexPlayKey(play, side, index) }));
  if (hash === "both") return [...makeRows(data.left, "left"), ...makeRows(data.right, "right")];
  return makeRows(data[hash], hash);
}
function _csIndexFamily(bucket, row) { return Boolean(bucket?.family?.[row.key]?.indent); }
function _csIndexCompact(bucket, row) { return Boolean(bucket?.family?.[row.key]?.compact); }
function _csIndexSetFamily(bucket, row, prop) {
  if (!bucket || !row?.key) return;
  bucket.family = bucket.family && typeof bucket.family === "object" ? bucket.family : {};
  const value = { ...(bucket.family[row.key] || {}) };
  value[prop] = !value[prop];
  if (!value.indent && !value.compact) delete bucket.family[row.key];
  else bucket.family[row.key] = value;
}
function _csIndexComparable(value) { return String(value || "").trim().toLowerCase(); }
function _csIndexDisplayPlay(play, previous, compact) {
  if (!compact || !play || !previous) return play;
  const copy = { ...play };
  const matches = (field) => _csIndexComparable(play[field]) && _csIndexComparable(play[field]) === _csIndexComparable(previous[field]);
  if (matches("formation")) copy.cellHideFormation = true;
  if (matches("formTag1") && matches("formTag2")) copy.cellHideFormationTags = true;
  if (matches("shift")) copy.cellHideShift = true;
  if (matches("motion")) copy.cellHideMotion = true;
  if (matches("protection")) copy.cellHideProtection = true;
  if (matches("back")) copy.cellHideBack = true;
  if (matches("playTag1") && matches("playTag2")) copy.cellHidePlayTags = true;
  return copy;
}
function _csIndexCall(play, previous, compact) {
  const shownPlay = _csIndexDisplayPlay(play, previous, compact);
  const options = typeof getCallSheetPlayDisplayOptions === "function"
    ? getCallSheetPlayDisplayOptions(shownPlay, getCallSheetDisplayOptions())
    : {};
  const parts = typeof buildCallSheetPlayParts === "function" ? buildCallSheetPlayParts(shownPlay, options) : [];
  return parts.join(" ") || escapeHtml([shownPlay?.formation, shownPlay?.protection, shownPlay?.play].filter(Boolean).join(" ")) || "Untitled call";
}
function _csIndexBucketMarkup(bucket, editable) {
  const rows = _csBucketRows(bucket);
  let previous = null;
  const plays = rows.map((row) => {
    const family = _csIndexFamily(bucket, row);
    const compact = family && _csIndexCompact(bucket, row);
    const text = _csIndexCall(row.play, previous, compact);
    previous = row.play;
    if (!editable) return `<li class="${family ? "cs-index-play--family" : ""}">${text}</li>`;
    const label = escapeHtml([row.play?.formation, row.play?.play].filter(Boolean).join(" ") || "Call Sheet play");
    return `<li class="cs-index-play callsheet-play${family ? " cs-index-play--family" : ""}" draggable="true" data-category="${escapeAttr(bucket.categoryId || "")}" data-hash="${row.hash}" data-index="${row.index}" data-cs-card-bucket="${escapeAttr(bucket.id)}" aria-label="${label}"><span class="cs-index-play-text">${text}</span><span class="cs-index-play-actions"><button data-action="toggleCallSheetIndexFamily" data-arg="${escapeAttr(bucket.id)}|${escapeAttr(row.key)}" title="${family ? "Make this a normal row" : "Indent beneath the call above"}" aria-label="${family ? "Remove family indent" : "Indent as a related family call"}">↳</button><button data-action="toggleCallSheetIndexCompact" data-arg="${escapeAttr(bucket.id)}|${escapeAttr(row.key)}" ${family ? "" : "disabled"} title="${compact ? "Show repeated components" : "Hide components shared with the call above"}" aria-label="${compact ? "Show repeated components" : "Hide repeated components"}">≈</button><button data-action="openCallSheetIndexPlayMenu" title="Edit this Call Sheet play" aria-label="Edit ${label}">⋯</button></span></li>`;
  }).join("") || "<li class=\"cs-index-no-calls\">Drop or add plays here</li>";
  const add = editable && bucket.categoryId ? `<button class="cs-index-add-play" data-action="openCallSheetPlayPicker" data-cat="${escapeAttr(bucket.categoryId)}" data-hash="${bucket.targetHash === "right" ? "right" : "left"}">＋ Play</button>` : "";
  const dropAttrs = bucket.categoryId ? ` data-drop="csHashDrop" data-cat="${escapeAttr(bucket.categoryId)}" data-hash="${bucket.targetHash === "right" ? "right" : "left"}"` : "";
  return `<section class="cs-index-bucket"${dropAttrs}><header><b>${escapeHtml(bucket.label)}</b>${editable ? `<span><button data-action="changeCallSheetIndexCardSource" data-arg="${escapeAttr(bucket.id)}" title="Change linked Call Sheet situation">↻</button><button data-action="removeCallSheetIndexCardBucket" data-arg="${escapeAttr(bucket.id)}" title="Remove this index-card bucket">×</button></span>` : ""}</header><ol>${plays}</ol>${add}</section>`;
}
function _csCardMarkup(card, side, editable = false) {
  const buckets = card?.[side] || [];
  return `<article class="cs-index-card"><div class="cs-index-card-head"><b>${escapeHtml(card?.name || "Game Day Card")}</b><span>${side === "front" ? "Front" : "Back"}</span></div><div class="cs-index-grid">${buckets.map((bucket) => _csIndexBucketMarkup(bucket, editable)).join("") || `<div class="cs-index-empty">Use + Add bucket to build this side.</div>`}</div></article>`;
}

function openCallSheetIndexCards() { switchCallSheetPage("index"); }
async function _csAddBucket() {
  const categoryId = await showListPicker("Pick the Call Sheet situation for this mini-card bucket.", [{ value: "", label: "Blank custom bucket" }, ...CALLSHEET_CATEGORIES.map((category) => ({ value: category.id, label: _csName(category.id), sublabel: `${_csSafeList(callSheet?.[category.id]?.left).length + _csSafeList(callSheet?.[category.id]?.right).length} calls` }))], { title: "Add call-sheet bucket", icon: "＋" });
  if (categoryId === null) return;
  const hash = categoryId ? await showListPicker("Show calls from which normal Call Sheet column?", [{ value: "both", label: "Both columns (one card list)" }, { value: "left", label: "Left column" }, { value: "right", label: "Right column" }], { title: "Source calls", icon: "↔" }) : "both";
  if (hash === null) return;
  const label = await showPrompt("Bucket label:", categoryId ? _csName(categoryId) : "Must Haves", { title: "Name bucket", icon: "🗂️" });
  if (!label?.trim()) return;
  _csActiveCard()[_csIndexSide].push({ id: `bucket-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, label: label.trim(), categoryId, hash, targetHash: hash === "right" ? "right" : "left", family: {} });
  _csPersistCards();
}
async function _csChangeSource(id) {
  const bucket = _csActiveCard()?.[_csIndexSide]?.find((item) => item.id === id);
  if (!bucket) return;
  const categoryId = await showListPicker("Choose the Call Sheet category.", [{ value: "", label: "Leave blank" }, ...CALLSHEET_CATEGORIES.map((category) => ({ value: category.id, label: _csName(category.id) }))], { title: "Change source", icon: "↻" });
  if (categoryId === null) return;
  bucket.categoryId = categoryId;
  bucket.family = {};
  _csPersistCards();
}
function _csIndexBucketFromArg(arg) { return _csActiveCard()?.[_csIndexSide]?.find((item) => item.id === String(arg || "")); }
function _csIndexRowFromArg(arg) {
  const [bucketId, ...parts] = String(arg || "").split("|");
  const bucket = _csIndexBucketFromArg(bucketId);
  const key = parts.join("|");
  return { bucket, row: _csBucketRows(bucket).find((item) => item.key === key) };
}
function toggleCallSheetIndexFamily(arg) { const { bucket, row } = _csIndexRowFromArg(arg); if (!bucket || !row || _csBucketRows(bucket).findIndex((item) => item.key === row.key) < 1) return; _csIndexSetFamily(bucket, row, "indent"); _csPersistCards(); }
function toggleCallSheetIndexCompact(arg) { const { bucket, row } = _csIndexRowFromArg(arg); if (!bucket || !row || !_csIndexFamily(bucket, row)) return; _csIndexSetFamily(bucket, row, "compact"); _csPersistCards(); }
function openCallSheetIndexPlayMenu(element) {
  const row = element?.closest?.(".callsheet-play");
  if (!row) return;
  const rect = element.getBoundingClientRect();
  showPlayContextMenu({ preventDefault() {}, clientX: rect.left, clientY: rect.bottom + 4 }, row.dataset.category, row.dataset.hash, parseInt(row.dataset.index, 10));
}
function printCallSheetIndexCards() { const cards = _csCards(); let host = document.getElementById("csIndexCardPrintRoot"); if (!host) { host = document.createElement("div"); host.id = "csIndexCardPrintRoot"; document.body.appendChild(host); } host.innerHTML = cards.flatMap((card) => ["front", "back"].map((side) => `<section class="cs-index-print-page">${_csCardMarkup(card, side)}</section>`)).join(""); document.body.classList.add("cs-index-printing"); let style = document.getElementById("csIndexCardPrintStyle"); if (!style) { style = document.createElement("style"); style.id = "csIndexCardPrintStyle"; document.head.appendChild(style); } style.textContent = "@page { size: 4in 6in; margin: .08in; }"; setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove("cs-index-printing"), 500); }, 80); }

function renderCallSheetIndexCardPage() {
  const cards = _csCards(); const card = _csActiveCard();
  if (!card) return `<section class="cs-index-main-empty"><h3>🗂️ Index Card Template</h3><p>Build a portrait 4×6 mini call sheet from your current Call Sheet categories.</p><button class="btn btn-primary" data-action="newCallSheetIndexCard">＋ Create first card</button></section>`;
  return `<section class="cs-index-main"><div class="cs-index-main-head"><div><span class="cs-index-kicker">INDEX CARD TEMPLATE · PORTRAIT 4 × 6</span><h3>Signal-ready mini call sheets</h3></div><div class="cs-index-main-actions"><button class="btn btn-sm btn-outline" data-action="newCallSheetIndexCard">＋ Card</button><button class="btn btn-sm btn-primary" data-action="printCallSheetIndexCards">🖨️ Print front & back</button></div></div><div class="cs-index-main-tabs">${cards.map((item, index) => `<button class="btn btn-sm ${item.id === card.id ? "btn-primary" : "btn-outline"}" data-action="selectCallSheetIndexCard" data-arg="${escapeAttr(item.id)}">${escapeHtml(item.name || `Card ${index + 1}`)}</button>`).join("")}</div><div class="cs-index-main-sides"><button class="btn ${_csIndexSide === "front" ? "btn-primary" : "btn-outline"}" data-action="setCallSheetIndexCardSide" data-arg="front">Front</button><button class="btn ${_csIndexSide === "back" ? "btn-primary" : "btn-outline"}" data-action="setCallSheetIndexCardSide" data-arg="back">Back</button><span>Drop from Game Plan, use ＋ Play, or open ⋯ to edit a call. ↳ nests a family call; ≈ hides repeated components.</span></div>${_csCardMarkup(card, _csIndexSide, true)}<button class="btn btn-outline cs-index-add" data-action="addCallSheetIndexCardBucket">＋ Add bucket</button></section>`;
}
function selectCallSheetIndexCard(id) { _csIndexCardId = String(id || ""); renderCallSheet(); }
function setCallSheetIndexCardSide(side) { _csIndexSide = side === "back" ? "back" : "front"; renderCallSheet(); }
function addCallSheetIndexCardBucket() { return _csAddBucket(); }
function changeCallSheetIndexCardSource(id) { return _csChangeSource(id); }
function removeCallSheetIndexCardBucket(id) { const card = _csActiveCard(); if (!card) return; card[_csIndexSide] = card[_csIndexSide].filter((item) => item.id !== id); _csPersistCards(); }
async function newCallSheetIndexCard() { const name = await showPrompt("Card name:", `Game Day Call Card ${_csCards().length + 1}`, { title: "New index card", icon: "🗂️" }); if (!name?.trim()) return; const card = _csNewCard(name.trim()); callSheetSettings.indexCards.push(card); _csIndexCardId = card.id; _csPersistCards(); }
