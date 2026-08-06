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
function _csIndexIdentity(play) {
  if (typeof _gpAssignmentIdentity === "function") return _gpAssignmentIdentity(play);
  if (typeof getPlayIdentityKey === "function") return getPlayIdentityKey(play, "callsheet-index", { trim: false });
  return [play?.personnel, play?.formation, play?.protection, play?.play, play?.personnelVariantId || "base"].map((value) => String(value || "").trim()).join("|");
}
function _csBucketRows(bucket) {
  const data = callSheet?.[bucket?.categoryId] || {};
  const hash = _csBucketHash(bucket);
  const makeRows = (items, side) => _csSafeList(items).map((play, index) => ({ play, hash: side, index, key: _csIndexPlayKey(play, side, index) }));
  const rows = hash === "both" ? [...makeRows(data.left, "left"), ...makeRows(data.right, "right")] : makeRows(data[hash], hash);
  // Smart cards are a scoped view of the canonical Call Sheet. Older/manual
  // cards have no playKeys and continue to show the full linked category.
  const keys = Array.isArray(bucket?.playKeys) ? new Set(bucket.playKeys) : null;
  return keys?.size ? rows.filter((row) => keys.has(_csIndexIdentity(row.play))) : rows;
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
  const category = CALLSHEET_CATEGORIES.find((item) => item.id === bucket.categoryId);
  const headerColor = category && typeof getCategoryColor === "function" ? getCategoryColor(category) : "#173768";
  const headerText = typeof getCategoryHeaderTextColor === "function" ? getCategoryHeaderTextColor(headerColor) : "#fff";
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
  return `<section class="cs-index-bucket"${dropAttrs}><header style="--cs-index-category: ${escapeAttr(headerColor)}; --cs-index-category-text: ${escapeAttr(headerText)}"><span class="cs-index-bucket-heading"><b>${escapeHtml(bucket.label)}</b><span class="cs-index-bucket-count">${rows.length}</span></span>${editable ? `<span class="cs-index-bucket-actions"><button data-action="changeCallSheetIndexCardSource" data-arg="${escapeAttr(bucket.id)}" title="Change linked Call Sheet situation">↻</button><button data-action="removeCallSheetIndexCardBucket" data-arg="${escapeAttr(bucket.id)}" title="Remove this index-card bucket">×</button></span>` : ""}</header><ol>${plays}</ol>${add}</section>`;
}
function _csCardMarkup(card, side, editable = false) {
  const buckets = card?.[side] || [];
  return `<article class="cs-index-card"><div class="cs-index-card-head"><b>${escapeHtml(card?.name || "Game Day Card")}</b><span>${side === "front" ? "Front" : "Back"}</span></div><div class="cs-index-grid">${buckets.map((bucket) => _csIndexBucketMarkup(bucket, editable)).join("") || `<div class="cs-index-empty">Use + Add bucket to build this side.</div>`}</div></article>`;
}

const CS_INDEX_SMART_CATEGORY_PRIORITY = [
  "openers", "goal-line", "rz-5", "rz-10", "rz-20", "backed-up", "2-minute", "4-minute",
  "3rd-short-1-3", "3rd-short-2down", "3rd-medium", "3rd-long", "4th-down", "1st-down",
  "short-yardage", "base-run", "run-options", "rpos", "base-pass", "quick", "play-action",
  "movement", "screen", "perimeter-screens", "must-haves",
];

function _csSmartIndexCategoryForPlay(play, sourceBoxId = "") {
  const targets = typeof _gpComputeCallSheetTargets === "function"
    ? [..._gpComputeCallSheetTargets(play, sourceBoxId)].filter((id) => CALLSHEET_CATEGORIES.some((category) => category.id === id))
    : [];
  if (!targets.length && typeof findMatchingCategories === "function") {
    try { targets.push(...findMatchingCategories(play)); } catch (_err) { /* best-effort routing */ }
  }
  const ranked = targets.sort((a, b) => {
    const ai = CS_INDEX_SMART_CATEGORY_PRIORITY.indexOf(a);
    const bi = CS_INDEX_SMART_CATEGORY_PRIORITY.indexOf(b);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  return ranked[0] || "must-haves";
}

function _csSmartIndexBucketLabel(categoryId) {
  return _csName(categoryId) || "Core Calls";
}

function _csSmartIndexPlan(entries) {
  const seen = new Set();
  const groups = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    // A Script gives us play objects directly; a Game Plan supplies wrapper
    // entries ({ play, sourceBoxId }). Do not use `entry.play || entry` here:
    // on a normal play object `play` is the call-name string, not the object.
    const play = entry && typeof entry.play === "object" ? entry.play : entry;
    if (!play || typeof play !== "object") return;
    const identity = _csIndexIdentity(play);
    if (!identity || seen.has(identity)) return;
    seen.add(identity);
    const categoryId = _csSmartIndexCategoryForPlay(play, entry?.sourceBoxId || "");
    if (!groups.has(categoryId)) groups.set(categoryId, []);
    groups.get(categoryId).push(play);
  });
  const ranked = [...groups.entries()].sort(([a, aPlays], [b, bPlays]) => {
    const ai = CS_INDEX_SMART_CATEGORY_PRIORITY.indexOf(a);
    const bi = CS_INDEX_SMART_CATEGORY_PRIORITY.indexOf(b);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || bPlays.length - aPlays.length;
  });
  // Six focused groups (three per side) keep a portrait 4×6 card usable. Any
  // lower-priority overflow becomes one deliberately named Core Calls group.
  const primary = ranked.slice(0, 6);
  const overflow = ranked.slice(6).flatMap(([, plays]) => plays);
  if (overflow.length) {
    const existing = primary.find(([id]) => id === "must-haves");
    if (existing) existing[1].push(...overflow);
    else if (primary.length < 6) primary.push(["must-haves", overflow]);
    else primary[primary.length - 1] = ["must-haves", [...primary[primary.length - 1][1], ...overflow]];
  }
  const sides = { front: [], back: [] };
  const rowCounts = { front: 0, back: 0 };
  primary.forEach(([categoryId, plays], index) => {
    const side = rowCounts.front <= rowCounts.back ? "front" : "back";
    sides[side].push({
      id: `bucket-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 5)}`,
      label: categoryId === "must-haves" && overflow.length ? "Core Calls" : _csSmartIndexBucketLabel(categoryId),
      categoryId,
      hash: "both",
      targetHash: "left",
      playKeys: plays.map(_csIndexIdentity),
      family: {},
    });
    rowCounts[side] += plays.length;
  });
  return { sides, groups: primary, playCount: seen.size };
}

function createSmartCallSheetIndexCard(entries, options = {}) {
  if (typeof callSheet !== "object" || !callSheet || !Array.isArray(entries) || !entries.length) {
    showToast("Add Script or Game Plan plays before building an Index Card.", { type: "warning" });
    return null;
  }
  const plan = _csSmartIndexPlan(entries);
  if (!plan.playCount) {
    showToast("No usable calls were found for this Index Card.", { type: "warning" });
    return null;
  }
  plan.groups.forEach(([categoryId, plays]) => {
    plays.forEach((play) => {
      if (typeof _gpPushPlayIntoCategory === "function") _gpPushPlayIntoCategory(play, categoryId);
    });
  });
  const name = String(options.name || "Game Day Call Card").trim() || "Game Day Call Card";
  const card = _csNewCard(name);
  card.front = plan.sides.front;
  card.back = plan.sides.back;
  callSheetSettings.indexCards = _csCards();
  callSheetSettings.indexCards.push(card);
  _csIndexCardId = card.id;
  _csIndexSide = "front";
  if (typeof saveCallSheet === "function") saveCallSheet();
  _csPersistCards();
  if (typeof showTab === "function") showTab("callsheet");
  if (typeof switchCallSheetPage === "function") switchCallSheetPage("index");
  showToast(`Built ${name}: ${plan.playCount} calls in ${plan.groups.length} compact groups.`, { type: "success", duration: 4500 });
  return card;
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
const CS_INDEX_PRINT_DEFAULTS = { cards: "all", sides: "both", copies: 1 };

function normalizeCallSheetIndexCardPrintOptions(options = {}) {
  const raw = { ...CS_INDEX_PRINT_DEFAULTS, ...(options && typeof options === "object" ? options : {}) };
  return {
    cards: raw.cards === "current" ? "current" : "all",
    sides: ["both", "front", "back"].includes(raw.sides) ? raw.sides : "both",
    copies: Math.max(1, Math.min(4, Number.parseInt(raw.copies, 10) || 1)),
  };
}

function getCallSheetIndexCardPrintOptions() {
  return normalizeCallSheetIndexCardPrintOptions(callSheetSettings?.indexCardPrintOptions);
}

function setCallSheetIndexCardPrintOptions(options = {}) {
  const normalized = normalizeCallSheetIndexCardPrintOptions(options);
  callSheetSettings.indexCardPrintOptions = normalized;
  saveCallSheetSettings();
  return normalized;
}

function _csIndexCardsForPrint(options = {}) {
  const job = normalizeCallSheetIndexCardPrintOptions(options);
  const cards = job.cards === "current" ? [_csActiveCard()].filter(Boolean) : _csCards();
  return cards.filter(Boolean);
}

function _csIndexPrintSides(options = {}) {
  const sides = normalizeCallSheetIndexCardPrintOptions(options).sides;
  return sides === "both" ? ["front", "back"] : [sides];
}

function renderCallSheetIndexCardPrintPages(options = {}) {
  const job = normalizeCallSheetIndexCardPrintOptions(options);
  const cards = _csIndexCardsForPrint(job);
  const sides = _csIndexPrintSides(job);
  return Array.from({ length: job.copies }, () => cards.flatMap((card) => sides.map((side) => `
    <section class="cs-index-print-page" data-card-id="${escapeAttr(card.id)}" data-card-side="${side}">
      ${_csCardMarkup(card, side)}
    </section>`))).flat().join("");
}

function _csIndexPrintSummary(options = {}) {
  const job = normalizeCallSheetIndexCardPrintOptions(options);
  const cards = _csIndexCardsForPrint(job);
  const sides = _csIndexPrintSides(job);
  const pageCount = cards.length * sides.length * job.copies;
  const cardLabel = job.cards === "current" ? "current card" : `${cards.length} card${cards.length === 1 ? "" : "s"}`;
  const sideLabel = job.sides === "both" ? "front + back" : job.sides;
  return { pageCount, title: `${cardLabel} · ${sideLabel}`, detail: `${pageCount} 4×6 page${pageCount === 1 ? "" : "s"} · ${job.copies} cop${job.copies === 1 ? "y" : "ies"}` };
}

async function openCallSheetIndexCardPrintModal() {
  if (!_csCards().length) {
    showToast("Create an Index Card before printing.", { type: "warning" });
    return;
  }
  const stored = getCallSheetIndexCardPrintOptions();
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay";
  overlay.innerHTML = `
    <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="csIndexPrintTitle">
      <div class="custom-modal-header"><span class="custom-modal-icon">🗂️</span><h3 class="custom-modal-title" id="csIndexPrintTitle">Print Index Cards</h3></div>
      <div class="custom-modal-body"><div class="gp-print-form">
        <div class="gp-print-row"><label for="csIndexPrintCards">Cards</label><select id="csIndexPrintCards"><option value="all">All saved index cards</option><option value="current">Current card only</option></select></div>
        <div class="gp-print-row"><label for="csIndexPrintSides">Sides</label><select id="csIndexPrintSides"><option value="both">Front + Back (duplex)</option><option value="front">Front only</option><option value="back">Back only</option></select></div>
        <div class="gp-print-row"><label for="csIndexPrintCopies">Copies</label><select id="csIndexPrintCopies"><option value="1">1 copy</option><option value="2">2 copies</option><option value="3">3 copies</option><option value="4">4 copies</option></select></div>
        <p class="cs-print-hint">Index Cards are locked to <strong>portrait 4 × 6 in</strong>. For double-sided cards, select <strong>Flip on short edge</strong> in your printer dialog.</p>
        <div class="cs-print-preview-summary" id="csIndexPrintSummary" role="status" aria-live="polite"></div>
      </div></div>
      <div class="custom-modal-actions"><button type="button" class="btn custom-modal-btn custom-modal-cancel" data-index-print="cancel">Cancel</button><button type="button" class="btn btn-secondary custom-modal-btn" data-index-print="preview">Preview</button><button type="button" class="btn btn-primary custom-modal-btn" data-index-print="print">Print</button></div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
  if (typeof openLayer === "function") openLayer(overlay, { id: "cs-index-print-modal", exclusive: false, trapFocus: false });
  const read = () => ({
    cards: overlay.querySelector("#csIndexPrintCards")?.value || stored.cards,
    sides: overlay.querySelector("#csIndexPrintSides")?.value || stored.sides,
    copies: overlay.querySelector("#csIndexPrintCopies")?.value || stored.copies,
  });
  overlay.querySelector("#csIndexPrintCards").value = stored.cards;
  overlay.querySelector("#csIndexPrintSides").value = stored.sides;
  overlay.querySelector("#csIndexPrintCopies").value = String(stored.copies);
  const update = () => {
    const summary = _csIndexPrintSummary(read());
    const target = overlay.querySelector("#csIndexPrintSummary");
    if (target) target.innerHTML = `<strong>${escapeHtml(summary.title)}</strong><span>${escapeHtml(summary.detail)}</span>${read().sides === "both" ? "<small>Pages print in Front → Back order for each card.</small>" : ""}`;
  };
  const close = () => {
    if (typeof closeLayer === "function") closeLayer("cs-index-print-modal");
    overlay.remove();
  };
  overlay.querySelectorAll("select").forEach((select) => select.addEventListener("change", update));
  overlay.querySelector('[data-index-print="cancel"]').addEventListener("click", close);
  overlay.querySelector('[data-index-print="preview"]').addEventListener("click", () => {
    const job = setCallSheetIndexCardPrintOptions(read());
    close();
    openCallSheetIndexCardPrintPreview(job);
  });
  overlay.querySelector('[data-index-print="print"]').addEventListener("click", () => {
    const job = setCallSheetIndexCardPrintOptions(read());
    close();
    _runCallSheetIndexCardsPrint(job);
  });
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); close(); } });
  update();
}

function openCallSheetIndexCardPrintPreview(options = {}) {
  const job = normalizeCallSheetIndexCardPrintOptions(options);
  const summary = _csIndexPrintSummary(job);
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay cs-index-print-preview-overlay";
  overlay.innerHTML = `
    <div class="custom-modal cs-index-print-preview-modal" role="dialog" aria-modal="true" aria-labelledby="csIndexPrintPreviewTitle">
      <div class="custom-modal-header"><span class="custom-modal-icon">👁️</span><h3 class="custom-modal-title" id="csIndexPrintPreviewTitle">Index Card Print Preview</h3></div>
      <div class="cs-print-preview-meta"><strong>${escapeHtml(summary.title)}</strong><span>${escapeHtml(summary.detail)}</span></div>
      <div class="cs-index-print-preview-pages">${renderCallSheetIndexCardPrintPages(job)}</div>
      <div class="custom-modal-actions"><button type="button" class="btn custom-modal-btn custom-modal-cancel" data-index-preview="back">Back</button><button type="button" class="btn btn-primary custom-modal-btn" data-index-preview="print">Print this job</button></div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
  if (typeof openLayer === "function") openLayer(overlay, { id: "cs-index-print-preview", exclusive: false, trapFocus: false });
  const close = () => { if (typeof closeLayer === "function") closeLayer("cs-index-print-preview"); overlay.remove(); };
  overlay.querySelector('[data-index-preview="back"]').addEventListener("click", close);
  overlay.querySelector('[data-index-preview="print"]').addEventListener("click", () => { close(); _runCallSheetIndexCardsPrint(job); });
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); close(); } });
}

function _runCallSheetIndexCardsPrint(options = {}) {
  const job = normalizeCallSheetIndexCardPrintOptions(options);
  const pages = renderCallSheetIndexCardPrintPages(job);
  if (!pages) { showToast("There are no Index Card pages to print.", { type: "warning" }); return; }
  let host = document.getElementById("csIndexCardPrintRoot");
  if (!host) { host = document.createElement("div"); host.id = "csIndexCardPrintRoot"; document.body.appendChild(host); }
  host.innerHTML = pages;
  document.body.classList.add("cs-index-printing");
  if (typeof setupPrintPageStyle === "function") setupPrintPageStyle("@media print { @page { size: 4in 6in; margin: .08in; } }");
  const cleanup = () => { document.body.classList.remove("cs-index-printing"); window.removeEventListener("afterprint", cleanup); };
  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 60000);
  setTimeout(() => window.print(), 80);
}

function printCallSheetIndexCards() { openCallSheetIndexCardPrintModal(); }

function renderCallSheetIndexCardPage() {
  const cards = _csCards(); const card = _csActiveCard();
  if (!card) return `<section class="cs-index-main-empty"><h3>🗂️ Call Sheet Index Cards</h3><p>Build a compact, printable view from the same situations and calls already on your Call Sheet.</p><button class="btn btn-primary" data-action="newCallSheetIndexCard">＋ Create first card</button></section>`;
  return `<section class="cs-index-main"><div class="cs-index-main-head"><div><span class="cs-index-kicker">CALL SHEET · GAME-DAY CARD · 4 × 6</span><h3>Compact call sheet, same categories</h3></div><div class="cs-index-main-actions"><button class="btn btn-sm btn-outline" data-action="newCallSheetIndexCard">＋ New card</button><button class="btn btn-sm btn-primary" data-action="openCallSheetIndexCardPrintModal">🖨️ Print options</button></div></div><div class="cs-index-main-tabs" aria-label="Index cards">${cards.map((item, index) => `<button class="btn btn-sm ${item.id === card.id ? "btn-primary" : "btn-outline"}" data-action="selectCallSheetIndexCard" data-arg="${escapeAttr(item.id)}">${escapeHtml(item.name || `Card ${index + 1}`)}</button>`).join("")}</div><div class="cs-index-main-sides"><span class="cs-index-side-label">Side</span><button class="btn ${_csIndexSide === "front" ? "btn-primary" : "btn-outline"}" data-action="setCallSheetIndexCardSide" data-arg="front">Front</button><button class="btn ${_csIndexSide === "back" ? "btn-primary" : "btn-outline"}" data-action="setCallSheetIndexCardSide" data-arg="back">Back</button><span>Uses your live Call Sheet calls. Drop from Game Plan, add a play, or open ⋯ to edit it.</span></div>${_csCardMarkup(card, _csIndexSide, true)}<button class="btn btn-outline cs-index-add" data-action="addCallSheetIndexCardBucket">＋ Add situation</button></section>`;
}
function selectCallSheetIndexCard(id) { _csIndexCardId = String(id || ""); renderCallSheet(); }
function setCallSheetIndexCardSide(side) { _csIndexSide = side === "back" ? "back" : "front"; renderCallSheet(); }
function addCallSheetIndexCardBucket() { return _csAddBucket(); }
function changeCallSheetIndexCardSource(id) { return _csChangeSource(id); }
function removeCallSheetIndexCardBucket(id) { const card = _csActiveCard(); if (!card) return; card[_csIndexSide] = card[_csIndexSide].filter((item) => item.id !== id); _csPersistCards(); }
async function newCallSheetIndexCard() { const name = await showPrompt("Card name:", `Game Day Call Card ${_csCards().length + 1}`, { title: "New index card", icon: "🗂️" }); if (!name?.trim()) return; const card = _csNewCard(name.trim()); callSheetSettings.indexCards.push(card); _csIndexCardId = card.id; _csPersistCards(); }
