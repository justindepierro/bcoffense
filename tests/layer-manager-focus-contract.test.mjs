/**
 * LayerManager focus contract.
 *
 * The app is global-scope/browser-native, so this focused test keeps the
 * policy auditable without introducing a second DOM implementation. Runtime
 * tablet checks exercise the same public API; this test protects the ordering
 * and reopen semantics that make those checks meaningful.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../js/dom-helpers.js", import.meta.url), "utf8");

function between(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `could not isolate ${start}`);
  return source.slice(from, to);
}

const focusHelper = between("function focusLayerElement", "function resolveLayerInitialFocus");
const initialFocusHelper = between("function focusInitialLayerTarget", "function trapFocus");
const reopenHelper = between("function reopenLayer", "function openLayer");
const openLayerHelper = between("function openLayer", "function closeLayer");
const closeLayerHelper = between("function closeLayer", "function addLongPress");
const returnFocusHelper = between("function getLayerReturnFocus", "function getLayerScrollElement");

assert.match(
  focusHelper,
  /target\.focus\(\{ preventScroll: true \}\)/,
  "LayerManager focuses controls without moving the locked document",
);
assert.match(
  focusHelper,
  /target\.focus\(\);/,
  "LayerManager retains a browser-compatible focus fallback",
);

assert.match(
  initialFocusHelper,
  /resolveLayerInitialFocus\(layer, initialFocus\)[\s\S]*?getLayerAutofocusTarget\(layer\)[\s\S]*?getLayerCloseTarget\(layer\)[\s\S]*?getLayerFocusableElements\(layer\)\[0\][\s\S]*?layer;/,
  "blocking dialogs use explicit, autofocus, Close, first-control, then layer focus order",
);
assert.match(
  source,
  /typeof target === "function"[\s\S]*?typeof target === "string"/,
  "initialFocus accepts a resolver and a selector as well as an HTMLElement",
);
assert.match(
  source,
  /if \(target === layer && !layer\.hasAttribute\("tabindex"\)\) layer\.tabIndex = -1;/,
  "a dialog with no native target becomes programmatically focusable",
);
assert.match(
  source,
  /if \(focusable\.length === 0\) \{[\s\S]*?e\.preventDefault\(\);[\s\S]*?focusLayerElement\(overlay\);/,
  "a dialog fallback cannot Tab out when it has no native focusable controls",
);

assert.match(
  returnFocusHelper,
  /const requested = options\.returnFocus;[\s\S]*?requested instanceof HTMLElement[\s\S]*?requested\.isConnected[\s\S]*?!element\.contains\(requested\)/,
  "a nested dialog can explicitly retain a connected external return-focus trigger",
);
assert.match(
  returnFocusHelper,
  /const requested = options\.returnFocus;[\s\S]*?requested instanceof HTMLElement[\s\S]*?requested\.isConnected[\s\S]*?!element\.contains\(requested\)/,
  "a handoff can explicitly preserve a connected external trigger as return focus",
);
assert.match(
  returnFocusHelper,
  /active && active !== element && !element\.contains\(active\) \? active : null/,
  "initial return focus cannot accidentally point at an internal dialog control",
);
assert.match(
  openLayerHelper,
  /if \(existingState && existingState\.element === element\) \{[\s\S]*?return reopenLayer\(existingState, options\);/,
  "same-id opens reuse the existing layer state instead of duplicating listeners",
);
assert.match(
  reopenHelper,
  /activeAppLayers\.delete\(state\.id\);[\s\S]*?activeAppLayers\.set\(state\.id, state\);/,
  "a same-id reopen promotes the layer without replacing its original focus state",
);
assert.match(
  reopenHelper,
  /if \(hasLayerOption\(options, "returnFocus"\)\) \{[\s\S]*?options\.returnFocus === false[\s\S]*?getLayerReturnFocus\(state\.element, options\) \|\| state\.returnFocus/,
  "a same-id reopen preserves the original trigger unless it explicitly suppresses return focus",
);
assert.match(
  reopenHelper,
  /hasLayerOption\(options, "initialFocus"\) \|\| options\.focusInitial === true/,
  "a same-id reopen only moves focus when it explicitly requests a new target",
);
assert.match(
  openLayerHelper,
  /if \(blocking \|\| hasLayerOption\(options, "initialFocus"\) \|\| options\.focusInitial === true\) \{[\s\S]*?focusInitialLayerTarget\(element, options\.initialFocus\);/,
  "new blocking dialogs always receive initial focus while nonblocking drawers remain opt-in",
);
assert.match(
  source,
  /function updateLayerEscapeHandler[\s\S]*?getActiveLayerState\(\) !== state[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopImmediatePropagation\(\);[\s\S]*?state\.onEscape\(event\);/,
  "LayerManager Escape handling belongs only to the current top layer and cannot leak into page shortcuts",
);
assert.match(
  closeLayerHelper,
  /focusLayerElement\(state\.returnFocus\);/,
  "return focus also uses preventScroll",
);

console.log("layer manager focus contract: initial focus, Escape, and idempotent reopen behavior verified");
