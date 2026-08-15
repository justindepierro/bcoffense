/**
 * Coach Inbox iPad layer contract.
 *
 * The existing Player Inbox remains the coach's triage surface, but it must
 * behave like a managed blocking dialog rather than a free-floating drawer.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const [markup, inbox, events, css, inventory] = await Promise.all([
  read("index.html"),
  read("js/dashboard-questions.js"),
  read("js/app-events.js"),
  read("css/dashboard.css"),
  read("tests/ui-surface-inventory-contract.test.mjs"),
]);

assert.match(
  markup,
  /id="qInboxOverlay"[\s\S]*?aria-hidden="true" inert hidden/,
  "the reusable Inbox is inert while closed",
);
assert.match(
  events,
  /"openQuestionInbox"/,
  "Inbox triggers pass their real element through delegated action routing",
);
assert.match(
  inbox,
  /function openQuestionInbox\(state, trigger\) \{[\s\S]*?overlay\.removeAttribute\("inert"\);[\s\S]*?openLayer\(overlay, \{[\s\S]*?id: "qInboxOverlay",[\s\S]*?blocking: true,[\s\S]*?safeArea: true,[\s\S]*?scrollElement: bodyEl \|\| overlay,[\s\S]*?initialFocus: closeButton \|\| overlay,[\s\S]*?onEscape: \(\) => closeQuestionInbox\(\),[\s\S]*?returnFocus: trigger instanceof HTMLElement \? trigger : undefined,/,
  "opening Inbox declares its exact blocking, focus, Escape, and scroll lifecycle",
);
assert.match(
  inbox,
  /function closeQuestionInbox\(options = \{\}\) \{[\s\S]*?closeLayer\("qInboxOverlay", \{ returnFocus: options\.returnFocus !== false \}\);[\s\S]*?overlay\.setAttribute\("inert", ""\);[\s\S]*?overlay\.hidden = true/,
  "closing Inbox releases the layer before it becomes inert and restores its trigger by default",
);
assert.match(
  inbox,
  /function qInboxOpenPlay\(arg\) \{[\s\S]*?closeQuestionInbox\(\{ returnFocus: false \}\)/,
  "opening a discussion from Inbox does not bounce focus back to the dismissed triage trigger",
);
assert.match(
  css,
  /\.q-inbox-overlay\.app-layer-active \{[\s\S]*?height: var\(--app-visual-viewport-height\);[\s\S]*?overflow: hidden;/,
  "the active Inbox follows the visual viewport without becoming a second scroller",
);
assert.match(
  css,
  /\.q-inbox-overlay\.app-layer-active \.q-inbox-panel \{[\s\S]*?max-height: var\(--app-layer-usable-height\);[\s\S]*?overflow: hidden;/,
  "the drawer panel fits the safe usable height",
);
assert.match(
  css,
  /body\.shell-tablet\.is-mobile-screen\.is-staff-mobile-shell \.q-inbox-select \{[\s\S]*?min-height: var\(--tap-min\);[\s\S]*?height: var\(--tap-min\);/,
  "staff iPad triage filters retain 44px targets",
);
assert.match(
  inventory,
  /qInboxOverlay: \{ owner: "index\.html", pattern: "blocking-layer", scrollOwner: "layer" \}/,
  "surface inventory remains explicit about Inbox layer ownership",
);

console.log("coach inbox layer contract: managed iPad triage surface passed");
