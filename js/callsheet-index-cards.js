/* Compact 4×6 front/back cards. Index cards are a focused, editable view of
 * the canonical Call Sheet — they never create a second copy of a call. */
let _csIndexCardId = "";
let _csIndexSide = "front";
let _csIndexPickerBucketId = "";
let _csIndexPickerAddingKey = "";
let _csIndexDraggingBucketId = "";
let _csIndexDraggingPlay = null;
let _csIndexRecoverySearchInFlight = false;

function _csCards() { return Array.isArray(callSheetSettings.indexCards) ? callSheetSettings.indexCards : []; }
function _csActiveCard() { const cards = _csCards(); const card = cards.find((item) => item.id === _csIndexCardId) || cards[0] || null; if (card) _csIndexCardId = card.id; return card; }
function _csNewCard(name) { return { id: `cs-index-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, front: [], back: [] }; }
function _csName(id) { const category = CALLSHEET_CATEGORIES.find((item) => item.id === id); return category ? getCategoryDisplayName(category) : "Unlinked"; }
function _csPersistCards(options = {}) {
  // A linked library card follows the same save behavior as the rest of the
  // Call Sheet: editing the working card updates its one saved record.
  if (options.syncLibrary !== false) _csSyncActiveIndexCardToLibrary();
  saveCallSheetSettings();
  if (typeof renderCallSheet === "function") renderCallSheet();
}
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
  const hasScopedKeys = Array.isArray(bucket?.playKeys);
  const keys = hasScopedKeys ? new Set(bucket.playKeys) : null;
  const excluded = new Set(Array.isArray(bucket?.excludedPlayKeys) ? bucket.excludedPlayKeys : []);
  const scoped = hasScopedKeys ? rows.filter((row) => keys.has(_csIndexIdentity(row.play))) : rows;
  // A scoped bucket represents a call, not every accidental duplicate copy of
  // that call in the full Call Sheet. Keep the first canonical occurrence so
  // one picker selection always occupies one row on the compact card.
  const seen = new Set();
  const uniqueRows = scoped.filter((row) => {
    const identity = _csIndexIdentity(row.play);
    if (excluded.has(identity) || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  // A scoped card owns its display order. Filtering canonical Call Sheet rows
  // preserves membership, but not a coach's manual card order.
  if (!hasScopedKeys) return uniqueRows;
  const rowsByIdentity = new Map(uniqueRows.map((row) => [_csIndexIdentity(row.play), row]));
  return bucket.playKeys.map((identity) => rowsByIdentity.get(identity)).filter(Boolean);
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
  const call = parts.join(" ") || escapeHtml([shownPlay?.formation, shownPlay?.protection, shownPlay?.play].filter(Boolean).join(" ")) || "Untitled call";
  const wristbandNumber = options.showNumbers
    ? (shownPlay?.wristbandNumber || (typeof getWristbandNumberForPlay === "function" ? getWristbandNumberForPlay(shownPlay) : null))
    : null;
  return wristbandNumber
    ? `<span class="cs-index-wristband-number">#${escapeHtml(wristbandNumber)}</span>${call}`
    : call;
}
function _csIndexPrintBucketClass(bucket) {
  const height = String(bucket?.printHeight || "");
  return height === "row" ? " cs-index-bucket--expand-row" : height === "fill" ? " cs-index-bucket--fill-column" : "";
}
function _csIndexBucketMarkup(bucket, editable) {
  const rows = _csBucketRows(bucket);
  const category = CALLSHEET_CATEGORIES.find((item) => item.id === bucket.categoryId);
  const configuredColor = /^#[0-9a-fA-F]{3,8}$/.test(String(bucket?.color || "")) ? bucket.color : "";
  const headerColor = configuredColor || (category && typeof getCategoryColor === "function" ? getCategoryColor(category) : "#173768");
  const headerText = typeof getCategoryHeaderTextColor === "function" ? getCategoryHeaderTextColor(headerColor) : "#fff";
  let previous = null;
  const plays = rows.map((row) => {
    const family = _csIndexFamily(bucket, row);
    const compact = family && _csIndexCompact(bucket, row);
    const text = _csIndexCall(row.play, previous, compact);
    previous = row.play;
    if (!editable) return `<li class="${family ? "cs-index-play--family" : ""}">${text}</li>`;
    const label = escapeHtml([row.play?.formation, row.play?.play].filter(Boolean).join(" ") || "Call Sheet play");
    return `<li class="cs-index-play callsheet-play${family ? " cs-index-play--family" : ""}" data-category="${escapeAttr(bucket.categoryId || "")}" data-hash="${row.hash}" data-index="${row.index}" data-cs-card-bucket="${escapeAttr(bucket.id)}" data-cs-index-play-key="${escapeAttr(_csIndexIdentity(row.play))}" aria-label="${label}"><span class="cs-index-play-grip" draggable="true" title="Drag to reorder this play" aria-label="Drag ${label} to reorder">⠿</span><span class="cs-index-play-text">${text}</span><span class="cs-index-play-actions"><button data-action="moveCallSheetIndexCardPlay" data-arg="${escapeAttr(bucket.id)}|${escapeAttr(_csIndexIdentity(row.play))}|up" title="Move play up" aria-label="Move ${label} up">↑</button><button data-action="moveCallSheetIndexCardPlay" data-arg="${escapeAttr(bucket.id)}|${escapeAttr(_csIndexIdentity(row.play))}|down" title="Move play down" aria-label="Move ${label} down">↓</button><button data-action="toggleCallSheetIndexFamily" data-arg="${escapeAttr(bucket.id)}|${escapeAttr(row.key)}" title="${family ? "Make this a normal row" : "Indent beneath the call above"}" aria-label="${family ? "Remove family indent" : "Indent as a related family call"}">↳</button><button data-action="toggleCallSheetIndexCompact" data-arg="${escapeAttr(bucket.id)}|${escapeAttr(row.key)}" ${family ? "" : "disabled"} title="${compact ? "Show repeated components" : "Hide components shared with the call above"}" aria-label="${compact ? "Show repeated components" : "Hide repeated components"}">≈</button><button data-action="removeCallSheetIndexPlay" data-arg="${escapeAttr(bucket.id)}|${escapeAttr(row.key)}" title="Remove from this Index Card bucket only" aria-label="Remove ${label} from this Index Card bucket">×</button><button data-action="openCallSheetIndexPlayMenu" title="Edit this Call Sheet play" aria-label="Edit ${label}">⋯</button></span></li>`;
  }).join("") || (editable && bucket.categoryId
    ? `<li class="cs-index-no-calls"><button class="cs-index-empty-add" data-action="openCallSheetIndexCardBucketPicker" data-arg="${escapeAttr(bucket.id)}">＋ Add a play or drop one here</button></li>`
    : "<li class=\"cs-index-no-calls\">Drop or add plays here</li>");
  const addControl = editable && bucket.categoryId ? `<button class="cs-index-bucket-add" data-action="openCallSheetIndexCardBucketPicker" data-arg="${escapeAttr(bucket.id)}" title="Add a play to ${escapeAttr(bucket.label)}" aria-label="Add a play to ${escapeAttr(bucket.label)}">＋</button>` : "";
  const dropAttrs = bucket.categoryId ? ` data-drop="csHashDrop" data-cat="${escapeAttr(bucket.categoryId)}" data-hash="${bucket.targetHash === "right" ? "right" : "left"}"` : "";
  return `<section class="cs-index-bucket${_csIndexPrintBucketClass(bucket)}"${dropAttrs}${editable ? ` data-cs-card-bucket="${escapeAttr(bucket.id)}"` : ""}><header${editable ? ` draggable="true" data-cs-index-bucket-drag="${escapeAttr(bucket.id)}" title="Drag this header to reorder situations"` : ""} style="--cs-index-category: ${escapeAttr(headerColor)}; --cs-index-category-text: ${escapeAttr(headerText)}"><span class="cs-index-bucket-heading">${editable ? '<span class="cs-index-bucket-grip" aria-hidden="true">⠿</span>' : ""}<b>${escapeHtml(bucket.label)}</b><span class="cs-index-bucket-count">${rows.length}</span></span>${editable ? `<span class="cs-index-bucket-actions">${addControl}<button data-action="manageCallSheetIndexCardBucket" data-arg="${escapeAttr(bucket.id)}" title="Manage situation" aria-label="Manage ${escapeAttr(bucket.label)}">⋯</button></span>` : ""}</header><ol class="${bucket.showSequenceNumbers ? "" : "cs-index-list--unsequenced"}">${plays}</ol></section>`;
}

function _csClearIndexBucketDragFeedback() {
  _csClearIndexBucketDropFeedback();
  document.querySelectorAll(".cs-index-bucket--dragging")
    .forEach((element) => element.classList.remove("cs-index-bucket--dragging"));
}
function _csClearIndexBucketDropFeedback() {
  document.querySelectorAll(".cs-index-bucket--drop-before, .cs-index-bucket--drop-after")
    .forEach((element) => element.classList.remove("cs-index-bucket--drop-before", "cs-index-bucket--drop-after"));
}

function _csReorderIndexBuckets(sourceId, targetId, placeAfter) {
  const buckets = _csActiveCard()?.[_csIndexSide];
  if (!Array.isArray(buckets) || !sourceId || !targetId || sourceId === targetId) return false;
  const sourceIndex = buckets.findIndex((bucket) => bucket.id === sourceId);
  let targetIndex = buckets.findIndex((bucket) => bucket.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return false;
  const [bucket] = buckets.splice(sourceIndex, 1);
  if (sourceIndex < targetIndex) targetIndex -= 1;
  buckets.splice(placeAfter ? targetIndex + 1 : targetIndex, 0, bucket);
  _csPersistCards();
  return true;
}

function _csBindIndexBucketDragAndDrop() {
  const grid = document.getElementById("callSheetGrid");
  if (!grid || grid.dataset.csIndexBucketDragBound === "true") return;
  grid.dataset.csIndexBucketDragBound = "true";
  grid.addEventListener("dragstart", (event) => {
    const handle = event.target.closest("[data-cs-index-bucket-drag]");
    if (!handle || event.target.closest("button, input")) return;
    _csIndexDraggingBucketId = handle.dataset.csIndexBucketDrag || "";
    if (!_csIndexDraggingBucketId) return;
    event.dataTransfer?.setData("text/plain", `cs-index-bucket:${_csIndexDraggingBucketId}`);
    event.dataTransfer?.setData("application/x-bcoffense-index-bucket", _csIndexDraggingBucketId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    handle.closest(".cs-index-bucket")?.classList.add("cs-index-bucket--dragging");
  });
  grid.addEventListener("dragover", (event) => {
    if (!_csIndexDraggingBucketId) return;
    const target = event.target.closest(".cs-index-card--editor .cs-index-bucket[data-cs-card-bucket]");
    if (!target || target.dataset.csCardBucket === _csIndexDraggingBucketId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const rect = target.getBoundingClientRect();
    const placeAfter = event.clientY > rect.top + rect.height / 2;
    if (typeof clearCallSheetDropIndicators === "function") clearCallSheetDropIndicators();
    _csClearIndexBucketDropFeedback();
    target.classList.add(placeAfter ? "cs-index-bucket--drop-after" : "cs-index-bucket--drop-before");
  });
  grid.addEventListener("drop", (event) => {
    if (!_csIndexDraggingBucketId) return;
    const target = event.target.closest(".cs-index-card--editor .cs-index-bucket[data-cs-card-bucket]");
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = target.getBoundingClientRect();
    const moved = _csReorderIndexBuckets(_csIndexDraggingBucketId, target.dataset.csCardBucket, event.clientY > rect.top + rect.height / 2);
    _csIndexDraggingBucketId = "";
    _csClearIndexBucketDragFeedback();
    if (moved) showToast("Situation reordered", { type: "success", duration: 1200 });
  });
  grid.addEventListener("dragend", () => {
    _csIndexDraggingBucketId = "";
    _csClearIndexBucketDragFeedback();
  });
}

document.addEventListener("DOMContentLoaded", _csBindIndexBucketDragAndDrop);

function _csIndexEnsurePlayKeys(bucket) {
  if (!bucket) return [];
  if (!Array.isArray(bucket.playKeys)) {
    bucket.playKeys = _csBucketRows(bucket).map((row) => _csIndexIdentity(row.play)).filter(Boolean);
  }
  return bucket.playKeys;
}
function _csClearIndexPlayDragFeedback() {
  document.querySelectorAll(".cs-index-play--dragging, .cs-index-play--drop-before, .cs-index-play--drop-after, .cs-index-bucket--play-drop-end")
    .forEach((element) => element.classList.remove("cs-index-play--dragging", "cs-index-play--drop-before", "cs-index-play--drop-after", "cs-index-bucket--play-drop-end"));
}
function _csReorderIndexBucketPlay(bucketId, sourceKey, targetKey, placeAfter) {
  const bucket = _csIndexBucketFromArg(bucketId);
  if (!bucket || !sourceKey) return false;
  const keys = _csIndexEnsurePlayKeys(bucket);
  const sourceIndex = keys.indexOf(sourceKey);
  if (sourceIndex < 0) return false;
  keys.splice(sourceIndex, 1);
  let insertIndex = keys.length;
  if (targetKey) {
    const targetIndex = keys.indexOf(targetKey);
    if (targetIndex >= 0) insertIndex = placeAfter ? targetIndex + 1 : targetIndex;
  }
  keys.splice(insertIndex, 0, sourceKey);
  _csPersistCards();
  return true;
}
function _csBindIndexPlayDragAndDrop() {
  const grid = document.getElementById("callSheetGrid");
  if (!grid || grid.dataset.csIndexPlayDragBound === "true") return;
  grid.dataset.csIndexPlayDragBound = "true";
  grid.addEventListener("dragstart", (event) => {
    const grip = event.target.closest(".cs-index-play-grip[draggable=\"true\"]");
    const row = event.target.closest(".cs-index-card--editor .cs-index-play[data-cs-index-play-key]");
    if (!grip || !row || event.target.closest("button, input")) return;
    _csIndexDraggingPlay = { bucketId: row.dataset.csCardBucket || "", key: row.dataset.csIndexPlayKey || "" };
    if (!_csIndexDraggingPlay.bucketId || !_csIndexDraggingPlay.key) {
      _csIndexDraggingPlay = null;
      return;
    }
    event.stopPropagation();
    event.dataTransfer?.setData("text/plain", `cs-index-play:${_csIndexDraggingPlay.key}`);
    event.dataTransfer?.setData("application/x-bcoffense-index-play", JSON.stringify(_csIndexDraggingPlay));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    row.classList.add("cs-index-play--dragging");
  }, true);
  grid.addEventListener("dragover", (event) => {
    if (!_csIndexDraggingPlay) return;
    const bucket = event.target.closest(".cs-index-card--editor .cs-index-bucket[data-cs-card-bucket]");
    if (!bucket || bucket.dataset.csCardBucket !== _csIndexDraggingPlay.bucketId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    _csClearIndexPlayDragFeedback();
    const target = event.target.closest(".cs-index-play[data-cs-index-play-key]");
    if (!target || target.dataset.csIndexPlayKey === _csIndexDraggingPlay.key) {
      bucket.classList.add("cs-index-bucket--play-drop-end");
      return;
    }
    const bounds = target.getBoundingClientRect();
    target.classList.add(event.clientY > bounds.top + bounds.height / 2 ? "cs-index-play--drop-after" : "cs-index-play--drop-before");
  }, true);
  grid.addEventListener("drop", (event) => {
    if (!_csIndexDraggingPlay) return;
    const bucket = event.target.closest(".cs-index-card--editor .cs-index-bucket[data-cs-card-bucket]");
    if (!bucket || bucket.dataset.csCardBucket !== _csIndexDraggingPlay.bucketId) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.target.closest(".cs-index-play[data-cs-index-play-key]");
    const bounds = target?.getBoundingClientRect();
    const moved = _csReorderIndexBucketPlay(
      _csIndexDraggingPlay.bucketId,
      _csIndexDraggingPlay.key,
      target?.dataset.csIndexPlayKey || "",
      Boolean(bounds && event.clientY > bounds.top + bounds.height / 2),
    );
    _csIndexDraggingPlay = null;
    _csClearIndexPlayDragFeedback();
    if (moved) showToast("Play reordered", { type: "success", duration: 1200 });
  }, true);
  grid.addEventListener("dragend", () => {
    _csIndexDraggingPlay = null;
    _csClearIndexPlayDragFeedback();
  }, true);
}
document.addEventListener("DOMContentLoaded", _csBindIndexPlayDragAndDrop);
function moveCallSheetIndexCardPlay(arg) {
  const parts = String(arg || "").split("|");
  const bucketId = parts.shift();
  const direction = parts.pop();
  const key = parts.join("|");
  const bucket = _csIndexBucketFromArg(bucketId);
  const keys = _csIndexEnsurePlayKeys(bucket);
  const index = keys.indexOf(key);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= keys.length) return;
  [keys[index], keys[nextIndex]] = [keys[nextIndex], keys[index]];
  _csPersistCards();
}
function _csIndexPrintColumns(buckets) {
  const columns = [[], []];
  const weights = [0, 0];
  (Array.isArray(buckets) ? buckets : []).forEach((bucket) => {
    const placement = bucket?.printColumn === "right" ? 1 : bucket?.printColumn === "left" ? 0 : weights[0] <= weights[1] ? 0 : 1;
    columns[placement].push(bucket);
    weights[placement] += 1 + Math.min(12, _csBucketRows(bucket).length);
  });
  return columns.map((column) => {
    const natural = column.filter((bucket) => bucket?.printHeight !== "fill");
    const fill = column.filter((bucket) => bucket?.printHeight === "fill");
    return `<div class="cs-index-column">${[...natural, ...fill].map((bucket) => _csIndexBucketMarkup(bucket, false)).join("")}</div>`;
  }).join("");
}
function _csCardMarkup(card, side, editable = false, printFlow = false) {
  const buckets = card?.[side] || [];
  const title = String(card?.name || "Game Day Card");
  const header = card?.hideHeader ? "" : `<div class="cs-index-card-head">${editable
    ? `<input id="csIndexCardTitle" name="csIndexCardTitle" class="cs-index-card-title-input" value="${escapeAttr(title)}" data-onchange="setCallSheetIndexCardTitle" data-pass="value" aria-label="Index Card title">`
    : `<b>${escapeHtml(title)}</b>`}<span>${side === "front" ? "Front" : "Back"}</span></div>`;
  const grid = buckets.length ? (printFlow ? _csIndexPrintColumns(buckets) : buckets.map((bucket) => _csIndexBucketMarkup(bucket, editable)).join("")) : `<div class="cs-index-empty">Use + Add bucket to build this side.</div>`;
  return `<article class="cs-index-card${editable ? " cs-index-card--editor" : ""}${printFlow ? " cs-index-card--print-flow" : ""}${card?.hideHeader ? " cs-index-card--no-header" : ""}">${header}<div class="cs-index-grid">${grid}</div></article>`;
}

function _csUpdateIndexCardFitStatus() {
  const editorCard = document.querySelector("#callSheetGrid .cs-index-card");
  const status = document.getElementById("csIndexCardFitStatus");
  const activeCard = _csActiveCard();
  if (!editorCard || !status || !activeCard) return;
  // Measure the same non-editable card markup and physical dimensions used by
  // printing. The live editor includes Add, reorder, delete, and menu chrome,
  // which must never count against printable capacity.
  const probe = document.createElement("div");
  probe.className = "cs-index-capacity-probe";
  probe.setAttribute("aria-hidden", "true");
  probe.innerHTML = _csCardMarkup(activeCard, _csIndexSide, false, true);
  document.body.appendChild(probe);
  const grid = probe.querySelector(".cs-index-grid");
  if (!grid) { probe.remove(); return; }
  const usedPercent = Math.round((grid.scrollHeight / Math.max(grid.clientHeight, 1)) * 100);
  const overflowPixels = Math.max(0, grid.scrollHeight - grid.clientHeight);
  const lineHeight = Math.max(12, parseFloat(getComputedStyle(grid).fontSize || "12") * 1.35);
  const overflowLines = Math.max(1, Math.ceil(overflowPixels / lineHeight));
  const overflow = overflowPixels > 2;
  editorCard.classList.toggle("cs-index-card--overfull", overflow);
  editorCard.style.setProperty("--cs-index-fill", `${Math.min(usedPercent, 100)}%`);
  probe.remove();
  status.classList.toggle("is-overfull", overflow);
  status.innerHTML = overflow
    ? `<strong>⚠️ ${usedPercent}% full</strong><span>Over the 4 × 6 print area by about ${overflowLines} line${overflowLines === 1 ? "" : "s"}.</span>`
    : `<strong>✓ ${usedPercent}% full</strong><span>Fits inside the 4 × 6 print area.</span>`;
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
function openCallSheetIndexCardBucketPicker(id) {
  const bucket = _csIndexBucketFromArg(id);
  if (!bucket?.categoryId || typeof openCallSheetPlayPicker !== "function") return;
  _csIndexPickerBucketId = bucket.id;
  _csIndexPickerAddingKey = "";
  openCallSheetPlayPicker(bucket.categoryId, bucket.targetHash === "right" ? "right" : "left");
}
function resolveCallSheetIndexCardPickerPlay(play, categoryId, hash) {
  const bucket = _csIndexBucketFromArg(_csIndexPickerBucketId);
  if (!bucket || bucket.categoryId !== categoryId || (bucket.targetHash === "right" ? "right" : "left") !== hash) return null;
  const identity = _csIndexIdentity(play);
  return _csSafeList(callSheet?.[categoryId]?.[hash]).find((candidate) => _csIndexIdentity(candidate) === identity) || null;
}
function onCallSheetIndexCardPickerPlayAdded(play) {
  const bucket = _csIndexBucketFromArg(_csIndexPickerBucketId);
  if (!bucket) return;
  const identity = _csIndexIdentity(play);
  // A picker row is delegated through a few historical Call Sheet surfaces.
  // Claim the selected play here as a second guard so one click cannot add it
  // to the compact card more than once while the picker closes and rerenders.
  if (!identity || _csIndexPickerAddingKey === identity) return;
  _csIndexPickerAddingKey = identity;
  let changed = false;
  if (identity && Array.isArray(bucket.playKeys) && !bucket.playKeys.includes(identity)) { bucket.playKeys.push(identity); changed = true; }
  if (identity && Array.isArray(bucket.excludedPlayKeys)) {
    const nextExcluded = bucket.excludedPlayKeys.filter((key) => key !== identity);
    changed = changed || nextExcluded.length !== bucket.excludedPlayKeys.length;
    bucket.excludedPlayKeys = nextExcluded;
  }
  if (changed) saveCallSheetSettings();
  _csIndexPickerBucketId = "";
}
function onCallSheetIndexCardPickerClosed() { _csIndexPickerBucketId = ""; _csIndexPickerAddingKey = ""; }
function onCallSheetIndexCardDroppedPlay(play, bucketId) {
  const bucket = _csIndexBucketFromArg(bucketId);
  if (!bucket || !play) return;
  const identity = _csIndexIdentity(play);
  if (identity && Array.isArray(bucket.playKeys) && !bucket.playKeys.includes(identity)) {
    bucket.playKeys.push(identity);
    saveCallSheetSettings();
  }
}
function onCallSheetIndexCardMovedPlay(play, sourceBucketId, targetBucketId) {
  if (!sourceBucketId || sourceBucketId === targetBucketId || !play) return;
  const source = _csIndexBucketFromArg(sourceBucketId);
  const identity = _csIndexIdentity(play);
  if (!source || !identity) return;
  if (Array.isArray(source.playKeys)) source.playKeys = source.playKeys.filter((key) => key !== identity);
  else {
    const hidden = new Set(Array.isArray(source.excludedPlayKeys) ? source.excludedPlayKeys : []);
    hidden.add(identity);
    source.excludedPlayKeys = [...hidden];
  }
  saveCallSheetSettings();
}
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
function toggleCallSheetIndexSequenceNumbers(id) { const bucket = _csIndexBucketFromArg(id); if (!bucket) return; bucket.showSequenceNumbers = !bucket.showSequenceNumbers; _csPersistCards(); }
function removeCallSheetIndexPlay(arg) {
  const { bucket, row } = _csIndexRowFromArg(arg);
  if (!bucket || !row) return;
  const identity = _csIndexIdentity(row.play);
  if (!identity) return;
  if (Array.isArray(bucket.playKeys)) {
    bucket.playKeys = bucket.playKeys.filter((key) => key !== identity);
  } else {
    const hidden = new Set(Array.isArray(bucket.excludedPlayKeys) ? bucket.excludedPlayKeys : []);
    hidden.add(identity);
    bucket.excludedPlayKeys = [...hidden];
  }
  _csPersistCards();
}
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
      ${_csCardMarkup(card, side, false, true)}
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
        <p class="cs-print-hint">Index Cards are locked to <strong>portrait 4 × 6 in</strong>. For double-sided cards, select <strong>Flip on long edge</strong> in your printer dialog.</p>
        <div class="cs-print-preview-summary" id="csIndexPrintSummary" role="status" aria-live="polite"></div>
      </div></div>
      <div class="custom-modal-actions"><button type="button" class="btn custom-modal-btn custom-modal-cancel" data-index-print="cancel">Cancel</button><button type="button" class="btn btn-secondary custom-modal-btn" data-index-print="preview">Preview</button><button type="button" class="btn btn-primary custom-modal-btn" data-index-print="print">Print</button></div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
  if (typeof openLayer === "function") openLayer(overlay, { id: "cs-index-print-modal", exclusive: false, trapFocus: false });
  requestAnimationFrame(() => overlay.classList.add("visible"));
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
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 200);
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
  requestAnimationFrame(() => overlay.classList.add("visible"));
  const close = () => {
    if (typeof closeLayer === "function") closeLayer("cs-index-print-preview");
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.querySelector('[data-index-preview="back"]').addEventListener("click", close);
  overlay.querySelector('[data-index-preview="print"]').addEventListener("click", () => { close(); _runCallSheetIndexCardsPrint(job); });
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); close(); } });
}

function previewCurrentCallSheetIndexCard() {
  const card = _csActiveCard();
  if (!card) {
    showToast("Create an Index Card before previewing.", { type: "warning" });
    return;
  }
  // The toolbar Preview button is also the direct route to “Print this job”.
  // Always pair Front then Back here so that route remains a real duplex job,
  // rather than silently printing only whichever editing side is visible.
  // Coaches can still select one side explicitly in Print options.
  openCallSheetIndexCardPrintPreview({ cards: "current", sides: "both", copies: 1 });
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
  const restoreTitle = typeof setPrintTitle === "function" ? setPrintTitle("Call Sheet Index Cards") : () => {};
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("cs-index-printing");
    try { restoreTitle(); } catch (_) { /* title was already restored */ }
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 60000);
  // Let the isolated 4×6 root receive two paint frames before print opens.
  // This is especially important in Chromium after a modal has just closed.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { window.print(); } catch (error) {
      cleanup();
      console.error("Index Card print could not open:", error);
      showToast("Could not open the print dialog. Your Index Card is still saved.", { type: "error" });
    }
  }));
}

function printCallSheetIndexCards() { openCallSheetIndexCardPrintModal(); }

// The library holds card layouts only: bucket setup, order, color, and scoped
// call identities. It deliberately never copies the full Call Sheet or its
// plays, so loading an item cannot replace a coach's active sheet.
function _csIndexCardLibrary() {
  const library = storageManager.get(STORAGE_KEYS.CALLSHEET_INDEX_CARD_LIBRARY, []);
  return Array.isArray(library) ? library.filter((item) => item && typeof item === "object" && item.card && typeof item.card === "object") : [];
}
function _csNewIndexLibraryId() {
  return typeof createPlayId === "function"
    ? createPlayId("index-card-library")
    : `index-card-library-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
function _csSnapshotIndexCard(card, name = "") {
  const clone = safeDeepClone(card || {});
  clone.name = String(name || clone.name || "Game Day Call Card").trim() || "Game Day Call Card";
  // A library record is a reusable blueprint, not a second live Call Sheet
  // card. Keep the relationship on the working card only.
  delete clone.id;
  delete clone.libraryId;
  delete clone.libraryName;
  clone.front = _csSafeList(clone.front);
  clone.back = _csSafeList(clone.back);
  return clone;
}
function _csCloneIndexCard(card, name = "", libraryId = "") {
  const clone = _csSnapshotIndexCard(card, name);
  clone.id = _csNewCard("x").id;
  if (libraryId) {
    clone.libraryId = String(libraryId);
    clone.libraryName = clone.name;
  }
  return clone;
}
function _csSyncActiveIndexCardToLibrary() {
  const active = _csActiveCard();
  const libraryId = String(active?.libraryId || "");
  if (!active || !libraryId) return false;
  const library = _csIndexCardLibrary();
  const index = library.findIndex((item) => String(item.id) === libraryId);
  if (index < 0) {
    // A deleted library entry must not leave a misleading invisible link.
    delete active.libraryId;
    delete active.libraryName;
    return false;
  }
  const name = String(active.name || library[index].name || "Game Day Call Card").trim() || "Game Day Call Card";
  active.name = name;
  active.libraryName = name;
  library[index] = {
    ...library[index],
    id: libraryId,
    name,
    savedAt: new Date().toISOString(),
    card: _csSnapshotIndexCard(active, name),
  };
  storageManager.set(STORAGE_KEYS.CALLSHEET_INDEX_CARD_LIBRARY, library);
  return true;
}
function _csIndexLibrarySummary(item) {
  const card = item?.card || {};
  const buckets = _csSafeList(card.front).length + _csSafeList(card.back).length;
  const scopedCalls = [..._csSafeList(card.front), ..._csSafeList(card.back)]
    .reduce((count, bucket) => count + _csSafeList(bucket?.playKeys).length, 0);
  return `${buckets} situation${buckets === 1 ? "" : "s"} · ${scopedCalls} selected call${scopedCalls === 1 ? "" : "s"}`;
}
function closeCallSheetIndexCardLibrary() {
  const overlay = document.getElementById("csIndexCardLibraryOverlay");
  if (typeof closeLayer === "function") closeLayer("csIndexCardLibraryOverlay");
  overlay?.remove();
}
function openCallSheetIndexCardLibrary() {
  const active = _csActiveCard();
  const library = _csIndexCardLibrary();
  const items = library.length
    ? library.map((item) => {
      const saved = item.savedAt ? new Date(item.savedAt).toLocaleString() : "Saved earlier";
      return `<div class="cs-index-library-item"><div class="cs-index-library-item-copy"><strong>${escapeHtml(item.name || item.card?.name || "Untitled card")}</strong><span>${escapeHtml(_csIndexLibrarySummary(item))}</span><small>${escapeHtml(saved)}</small></div><div class="cs-index-library-item-actions"><button class="btn btn-sm btn-primary" data-action="loadCallSheetIndexCardFromLibrary" data-arg="${escapeAttr(item.id)}">Load & link</button><button class="btn btn-sm btn-danger" data-action="deleteCallSheetIndexCardLibraryItem" data-arg="${escapeAttr(item.id)}" aria-label="Delete ${escapeAttr(item.name || "Index Card")}">Delete</button></div></div>`;
    }).join("")
    : '<div class="empty-state cs-index-library-empty">No saved Index Cards yet. Save the current card here and it will be available on every Call Sheet.</div>';
  const overlay = document.createElement("div");
  overlay.id = "csIndexCardLibraryOverlay";
  overlay.className = "cs-sort-overlay";
  const linked = active && library.some((item) => String(item.id) === String(active.libraryId || ""));
  overlay.innerHTML = `<div class="cs-sort-modal cs-index-library-modal" role="dialog" aria-modal="true" aria-labelledby="csIndexLibraryTitle"><div class="cs-sort-header"><div><h3 id="csIndexLibraryTitle">🗃️ Index Card Library</h3><p>Loading adds a linked editable card to this Call Sheet. From then on, normal card edits automatically update that same saved card.</p></div><button class="cs-sort-close" data-action="closeCallSheetIndexCardLibrary" aria-label="Close Index Card Library">×</button></div><div class="cs-sort-body"><section class="cs-index-library-save"><h4>${linked ? "Linked card" : "Save current card"}</h4><p>${active ? (linked ? `“${escapeHtml(active.name || "Untitled card")}” is linked to the library and auto-saves as you edit.` : `Save “${escapeHtml(active.name || "Untitled card")}” once to link it for automatic updates.`) : "Create an Index Card before saving it to the library."}</p><div class="cs-template-save-row"><label class="sr-only" for="csIndexLibraryName">Index Card name</label><input id="csIndexLibraryName" name="indexCardLibraryName" type="text" value="${escapeAttr(active?.name || "")}" placeholder="Index Card name" ${active ? "" : "disabled"}><button class="btn btn-primary" data-action="saveCallSheetIndexCardToLibrary" ${active ? "" : "disabled"}>${linked ? "💾 Save now" : "💾 Save & link"}</button></div></section><section class="cs-index-library-list"><div class="cs-template-section-head"><div><h4>Saved cards</h4><p>${library.length} reusable card${library.length === 1 ? "" : "s"}. They travel with the team workspace.</p></div></div>${items}</section></div><div class="cs-sort-actions"><button class="btn btn-sm" data-action="closeCallSheetIndexCardLibrary">Close</button></div></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) closeCallSheetIndexCardLibrary(); });
  if (typeof openLayer === "function") openLayer(overlay, { id: "csIndexCardLibraryOverlay", scrollElement: overlay.querySelector(".cs-sort-modal") || overlay, blocking: true, onEscape: () => closeCallSheetIndexCardLibrary() });
  requestAnimationFrame(() => document.getElementById("csIndexLibraryName")?.focus());
}
async function saveCallSheetIndexCardToLibrary() {
  const active = _csActiveCard();
  const input = document.getElementById("csIndexLibraryName");
  const name = String(input?.value || active?.name || "").trim();
  if (!active || !name) { showToast("Give this Index Card a name before saving.", { type: "warning" }); return; }
  const library = _csIndexCardLibrary();
  const linked = library.find((item) => String(item.id) === String(active.libraryId || "")) || null;
  const sameName = linked ? [] : library.filter((item) => String(item.name || "").trim().toLowerCase() === name.toLowerCase());
  let replace = null;
  if (sameName.length) {
    const choice = await showChoice(`“${name}” is already in the Index Card Library.`, { title: "Save Index Card", icon: "🗃️", option1: "Update saved copy", option2: "Keep both" });
    if (!choice) return;
    replace = choice === "option1" ? sameName[0] : null;
  }
  const savedId = linked?.id || replace?.id || _csNewIndexLibraryId();
  active.name = name;
  active.libraryId = savedId;
  active.libraryName = name;
  const saved = { id: savedId, name, savedAt: new Date().toISOString(), card: _csSnapshotIndexCard(active, name) };
  const next = (linked || replace) ? library.map((item) => item.id === savedId ? saved : item) : [saved, ...library];
  storageManager.set(STORAGE_KEYS.CALLSHEET_INDEX_CARD_LIBRARY, next);
  _csPersistCards({ syncLibrary: false });
  closeCallSheetIndexCardLibrary();
  showToast(linked ? `💾 Updated linked card “${name}”.` : `💾 Saved and linked “${name}”.`);
}
function loadCallSheetIndexCardFromLibrary(id) {
  const item = _csIndexCardLibrary().find((entry) => String(entry.id) === String(id));
  if (!item) { showToast("That saved Index Card is no longer available.", { type: "warning" }); return; }
  const card = _csCloneIndexCard(item.card, item.name || item.card?.name, item.id);
  callSheetSettings.indexCards = [..._csCards(), card];
  _csIndexCardId = card.id;
  _csIndexSide = "front";
  _csPersistCards({ syncLibrary: false });
  closeCallSheetIndexCardLibrary();
  showToast(`🗂️ Loaded and linked “${card.name}”. Future edits auto-save to this library card.`);
}
async function deleteCallSheetIndexCardLibraryItem(id) {
  const library = _csIndexCardLibrary();
  const item = library.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  const confirmed = await showConfirm(`Delete “${item.name || "this saved card"}” from the Index Card Library? Existing Call Sheets and cards will not change.`, { title: "Delete saved card", icon: "🗑️", confirmText: "Delete" });
  if (!confirmed) return;
  storageManager.set(STORAGE_KEYS.CALLSHEET_INDEX_CARD_LIBRARY, library.filter((entry) => entry.id !== item.id));
  _csCards().forEach((card) => {
    if (String(card?.libraryId || "") === String(item.id)) {
      delete card.libraryId;
      delete card.libraryName;
    }
  });
  saveCallSheetSettings();
  closeCallSheetIndexCardLibrary();
  openCallSheetIndexCardLibrary();
}

function renderCallSheetIndexToolbarContext() {
  const cards = _csCards(); const card = _csActiveCard();
  if (!card) return "";
  const saveLabel = card.libraryId ? "💾 Save linked card now" : "💾 Save & link to card library";
  return `<div class="cs-index-main-tabs" aria-label="Index cards">${cards.map((item, index) => `<button class="btn btn-sm ${item.id === card.id ? "btn-primary" : "btn-outline"}" data-action="selectCallSheetIndexCard" data-arg="${escapeAttr(item.id)}" title="${escapeAttr(item.name || `Card ${index + 1}`)}">${escapeHtml(item.name || `Card ${index + 1}`)}</button>`).join("")}</div><div class="cs-index-main-sides" aria-label="Card side"><span class="cs-index-side-label">Side</span><button class="btn btn-sm ${_csIndexSide === "front" ? "btn-primary" : "btn-outline"}" data-action="setCallSheetIndexCardSide" data-arg="front">Front</button><button class="btn btn-sm ${_csIndexSide === "back" ? "btn-primary" : "btn-outline"}" data-action="setCallSheetIndexCardSide" data-arg="back">Back</button><details class="cs-index-main-more"><summary title="More card actions">⋯</summary><div class="cs-index-main-more-menu"><button class="btn btn-sm btn-outline" data-action="saveCallSheetIndexCardToLibrary">${saveLabel}</button><button class="btn btn-sm btn-outline" data-action="openCallSheetIndexCardLibrary">🗃️ Open card library</button><button class="btn btn-sm btn-outline" data-action="renameCallSheetIndexCard">✏️ Rename card</button><button class="btn btn-sm btn-outline" data-action="recoverCallSheetIndexCard">☁️ Recover from cloud history</button><button class="btn btn-sm btn-outline" data-action="toggleCallSheetIndexCardHeader">${card.hideHeader ? "Show title band" : "Hide title band"}</button><button class="btn btn-sm btn-outline" data-action="removeEmptyCallSheetIndexBuckets">Remove empty</button><button class="btn btn-sm btn-outline cs-index-delete-card" data-action="deleteCallSheetIndexCard">🗑️ Delete card</button></div></details></div>`;
}

function renderCallSheetIndexCardPage() {
  const cards = _csCards(); const card = _csActiveCard();
  if (!card) return `<section class="cs-index-main-empty"><h3>🗂️ Call Sheet Index Cards</h3><p>Build a compact, printable view from the same situations and calls already on your Call Sheet.</p><button class="btn btn-primary" data-action="newCallSheetIndexCard">＋ Create first card</button></section>`;
  requestAnimationFrame(() => {
    _csBindIndexBucketDragAndDrop();
    _csBindIndexPlayDragAndDrop();
    _csUpdateIndexCardFitStatus();
  });
  return `<section class="cs-index-main"><div id="csIndexCardFitStatus" class="cs-index-fit-status" role="status" aria-live="polite">4 × 6 print area</div><div class="cs-index-editor-stage">${_csCardMarkup(card, _csIndexSide, true)}<button class="btn btn-outline cs-index-add" data-action="addCallSheetIndexCardBucket">＋ Add situation</button></div></section>`;
}
function selectCallSheetIndexCard(id) { _csIndexCardId = String(id || ""); renderCallSheet(); }
function setCallSheetIndexCardSide(side) { _csIndexSide = side === "back" ? "back" : "front"; renderCallSheet(); }
function setCallSheetIndexCardTitle(name) { const card = _csActiveCard(); if (!card) return; card.name = String(name || "").trim() || "Game Day Call Card"; _csPersistCards(); }
function toggleCallSheetIndexCardHeader() { const card = _csActiveCard(); if (!card) return; card.hideHeader = !card.hideHeader; _csPersistCards(); }
function addCallSheetIndexCardBucket() { return _csAddBucket(); }
function changeCallSheetIndexCardSource(id) { return _csChangeSource(id); }
function removeCallSheetIndexCardBucket(id) { const card = _csActiveCard(); if (!card) return; card[_csIndexSide] = card[_csIndexSide].filter((item) => item.id !== id); _csPersistCards(); }
async function newCallSheetIndexCard() { const name = await showPrompt("Card name:", `Game Day Call Card ${_csCards().length + 1}`, { title: "New index card", icon: "🗂️" }); if (!name?.trim()) return; const card = _csNewCard(name.trim()); callSheetSettings.indexCards.push(card); _csIndexCardId = card.id; _csPersistCards(); }
async function renameCallSheetIndexCard() {
  const card = _csActiveCard();
  if (!card) return;
  const name = await showPrompt("Card name:", card.name || "Game Day Call Card", { title: "Rename index card", icon: "✏️" });
  if (!name?.trim()) return;
  card.name = name.trim();
  _csPersistCards();
}
async function deleteCallSheetIndexCard() {
  const card = _csActiveCard();
  if (!card) return;
  const ok = await showConfirm(`Delete “${card.name || "this Index Card"}”? Its Call Sheet plays will stay untouched.`, { title: "Delete index card", icon: "🗑️", confirmText: "Delete" });
  if (!ok) return;
  callSheetSettings.indexCards = _csCards().filter((item) => item.id !== card.id);
  _csIndexCardId = callSheetSettings.indexCards[0]?.id || "";
  _csIndexSide = "front";
  _csPersistCards({ syncLibrary: false });
}
async function recoverCallSheetIndexCard() {
  const card = _csActiveCard();
  if (!card || _csIndexRecoverySearchInFlight) return;
  _csIndexRecoverySearchInFlight = true;
  try {
    let response;
    // Cloud history is a recovery tool, not a destructive action. A short
    // retry handles an occasional waking 503 without ever retrying the POST
    // that actually restores a card.
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(`/admin/callsheet-index-card-recovery?cardId=${encodeURIComponent(card.id)}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (response.status !== 503 || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) throw new Error(result?.error || "Cloud history could not be searched.");
    const candidates = (result.candidates || []).filter((item) => Number(item.backBuckets || 0) > 0);
    if (!candidates.length) { showToast("No older cloud copy with Back-side buckets was found.", { type: "info" }); return; }
    const selected = await showListPicker("Choose the saved card version to restore. Only this card will change; the rest of the workspace stays current.", candidates.map((item) => ({ value: item.sourceRevision, label: `${new Date(Number(item.historicalRevisionAt || 0) * 1000).toLocaleString()} — Front ${item.frontBuckets}, Back ${item.backBuckets}` })), { title: "Cloud Index Card History", icon: "☁️" });
    if (!selected) return;
    const confirmed = await showConfirm("Restore this Index Card's saved Front and Back configuration? Current Call Sheet plays and every other workspace record will remain untouched.", { title: "Restore this card only?", icon: "🛟", confirmText: "Restore card" });
    if (!confirmed) return;
    const restoreResponse = await fetch("/admin/callsheet-index-card-recovery", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ sourceRevision: selected, cardId: card.id }) });
    const restored = await restoreResponse.json().catch(() => ({}));
    if (!restoreResponse.ok || !restored?.ok) throw new Error(restored?.error || "The Index Card could not be restored.");
    const restoredCard = restored?.restoredCard;
    if (!restoredCard || typeof restoredCard !== "object" || String(restoredCard.id || "") !== String(card.id)) {
      throw new Error("The cloud restored the card, but this device did not receive its updated copy. Please retry safely.");
    }
    const cards = _csCards();
    const targetIndex = cards.findIndex((item) => String(item?.id || "") === String(card.id));
    if (targetIndex >= 0) cards[targetIndex] = restoredCard;
    else cards.push(restoredCard);
    callSheetSettings.indexCards = cards;
    _csIndexCardId = restoredCard.id;
    _csIndexSide = "front";
    _csPersistCards();
    showToast("Index Card recovered from cloud history — Front and Back are now restored on this device.", { type: "success", duration: 4500 });
  } catch (err) {
    showToast(err?.message || "The Index Card could not be restored.", { type: "error", duration: 6000 });
  } finally {
    _csIndexRecoverySearchInFlight = false;
  }
}
function moveCallSheetIndexBucket(arg) {
  const [id, rawDirection] = String(arg || "").split("|");
  const items = _csActiveCard()?.[_csIndexSide];
  const index = Array.isArray(items) ? items.findIndex((item) => item.id === id) : -1;
  const next = index + Number(rawDirection);
  if (index < 0 || !Number.isInteger(next) || next < 0 || next >= items.length) return;
  [items[index], items[next]] = [items[next], items[index]];
  _csPersistCards();
}
function copyCallSheetIndexBucketToOtherSide(id) {
  const card = _csActiveCard();
  const bucket = _csIndexBucketFromArg(id);
  if (!card || !bucket) return;
  const otherSide = _csIndexSide === "front" ? "back" : "front";
  card[otherSide].push({ ...JSON.parse(JSON.stringify(bucket)), id: `bucket-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` });
  _csPersistCards();
}
function clearCallSheetIndexCardBucket(id) {
  const bucket = _csIndexBucketFromArg(id);
  if (!bucket) return;
  bucket.playKeys = [];
  bucket.excludedPlayKeys = [];
  bucket.family = {};
  _csPersistCards();
}
function removeEmptyCallSheetIndexBuckets() {
  const card = _csActiveCard();
  if (!card) return;
  const before = card[_csIndexSide].length;
  card[_csIndexSide] = card[_csIndexSide].filter((bucket) => _csBucketRows(bucket).length > 0);
  if (card[_csIndexSide].length !== before) _csPersistCards();
  else showToast("There are no empty situations on this side.", { type: "info" });
}
async function setCallSheetIndexBucketColor(id) {
  const bucket = _csIndexBucketFromArg(id);
  if (!bucket) return;
  const palette = [
    ["", "Auto — linked Call Sheet category"],
    ["#173768", "Navy"], ["#4b5563", "Slate"], ["#6c757d", "Gray"],
    ["#dc3545", "Call Sheet Red"], ["#ffc107", "Call Sheet Yellow"], ["#fd7e14", "Call Sheet Orange"],
    ["#28a745", "Call Sheet Green"], ["#007bff", "Call Sheet Blue"], ["#6f42c1", "Call Sheet Purple"], ["#17a2b8", "Call Sheet Teal"],
    ["#c92e62", "Magenta"], ["#176eaa", "Royal Blue"], ["#168a52", "Deep Green"],
    ["#d39b18", "Gold"], ["#dc6114", "Burnt Orange"], ["#6a3db2", "Violet"],
    ["#7c3aed", "Game Plan Quick"], ["#db2777", "Game Plan Play Action"],
    ["#16a34a", "Game Plan RPO"], ["#65a30d", "Game Plan Run Option"],
    ["#0891b2", "Game Plan Screen"], ["#9333ea", "Game Plan Movement"],
    ["#2563eb", "Game Plan Pass"], ["#d97706", "Game Plan Run"],
  ];
  const color = await showListPicker("Choose the situation header color for this Index Card only.", palette.map(([value, label]) => ({ value, label })), { title: "Situation color", icon: "🎨" });
  if (color === null) return;
  if (color) bucket.color = color;
  else delete bucket.color;
  _csPersistCards();
}
async function manageCallSheetIndexCardBucket(id) {
  const bucket = _csIndexBucketFromArg(id);
  const card = _csActiveCard();
  if (!bucket || !card) return;
  const action = await showChoice(`Manage <strong>${escapeHtml(bucket.label)}</strong>. Calls remain linked to the live Call Sheet.`, {
    title: "Manage situation", icon: "🗂️", choices: [
      { value: "rename", label: "Rename situation", icon: "✏️" },
      { value: "source", label: "Change Call Sheet source", icon: "↻" },
      { value: "color", label: "Change header color", icon: "🎨" },
      { value: "sequence", label: bucket.showSequenceNumbers ? "Turn sequence numbers off" : "Turn sequence numbers on", icon: "#" },
      { value: "balance", label: "Place in shortest column automatically", icon: "↕" },
      { value: "left-column", label: "Place in left column", icon: "←" },
      { value: "right-column", label: "Place in right column", icon: "→" },
      { value: "expand-row", label: "Expand into the next row", icon: "↕" },
      { value: "fill-column", label: "Fill remaining column height", icon: "⇳" },
      { value: "natural-height", label: "Use natural bucket height", icon: "↥" },
      { value: "other-side", label: `Move to ${_csIndexSide === "front" ? "Back" : "Front"}`, icon: "↔" },
      { value: "copy-other-side", label: `Copy to ${_csIndexSide === "front" ? "Back" : "Front"}`, icon: "⧉" },
      { value: "clear", label: "Clear calls from this card bucket", icon: "⌫" },
      { value: "delete", label: "Remove from card", icon: "🗑️" },
      { value: "cancel", label: "Cancel" },
    ],
  });
  if (action === "rename") {
    const name = await showPrompt("Situation label:", bucket.label || _csName(bucket.categoryId), { title: "Rename situation", icon: "✏️" });
    if (name?.trim()) { bucket.label = name.trim(); _csPersistCards(); }
  } else if (action === "source") {
    await _csChangeSource(id);
  } else if (action === "color") {
    await setCallSheetIndexBucketColor(id);
  } else if (action === "sequence") {
    toggleCallSheetIndexSequenceNumbers(id);
  } else if (action === "balance") {
    delete bucket.printColumn;
    _csPersistCards();
  } else if (action === "left-column" || action === "right-column") {
    bucket.printColumn = action === "left-column" ? "left" : "right";
    _csPersistCards();
  } else if (action === "expand-row") {
    bucket.printHeight = "row";
    _csPersistCards();
  } else if (action === "fill-column") {
    bucket.printHeight = "fill";
    _csPersistCards();
  } else if (action === "natural-height") {
    delete bucket.printHeight;
    _csPersistCards();
  } else if (action === "other-side") {
    card[_csIndexSide] = card[_csIndexSide].filter((item) => item.id !== id);
    const otherSide = _csIndexSide === "front" ? "back" : "front";
    card[otherSide].push(bucket);
    _csPersistCards();
  } else if (action === "copy-other-side") {
    copyCallSheetIndexBucketToOtherSide(id);
  } else if (action === "clear") {
    clearCallSheetIndexCardBucket(id);
  } else if (action === "delete") {
    removeCallSheetIndexCardBucket(id);
  }
}
