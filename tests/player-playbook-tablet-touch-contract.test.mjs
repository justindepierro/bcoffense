/**
 * T-009 P1 Player Playbook summary touch contract.
 *
 * Player and managed-coach study shells retain compact phone controls, while
 * a real tablet shell gives every independently tappable summary action and
 * quick filter its full 44px target. Keep that boundary out of staff authoring
 * surfaces, editor/report layers, and print.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [render, css] = await Promise.all([
  source("js/playbook-render.js"),
  source("css/playbook.css"),
]);

assert.match(
  render,
  /function renderPlayerPlaybookSummary\([\s\S]*?class="pb-player-summary__actions"[\s\S]*?\$\{playbookFilterAction\}[\s\S]*?\$\{playbookPresentAction\}[\s\S]*?class="pb-player-summary__filters"/,
  "the player summary keeps its real study actions ahead of its quick-filter strip",
);
assert.match(
  render,
  /class="pb-player-summary__filter-pill[\s\S]*?data-action="applyPlayerPlaybookFilter" data-arg="gamePlan:current">Game Plan<\/button>[\s\S]*?class="pb-player-summary__filter-pill" data-action="openPlayerPlaybookFilters" data-arg="personnel">Personnel<\/button>/,
  "the player summary retains both immediate and full-sheet quick-filter actions",
);

const touchBlockStart = css.indexOf("/* T-009 P1 — Player Playbook summary touch targets.");
const touchBlockEnd = css.indexOf("/* End T-009 P1 Player Playbook summary touch targets. */", touchBlockStart);
const touchBlock = css.slice(touchBlockStart, touchBlockEnd);
assert.ok(touchBlockStart >= 0 && touchBlockEnd > touchBlockStart, "Player Playbook defines a dedicated tablet touch block");
assert.match(
  touchBlock,
  /@media screen and \(pointer: coarse\) \{[\s\S]*?body\.shell-tablet\.is-mobile-screen\.is-player-mobile-shell[\s\S]*?#playerPlaybookSummary[\s\S]*?\.pb-player-summary__actions[\s\S]*?\.btn,[\s\S]*?body\.shell-tablet\.is-mobile-screen\.is-player-mobile-shell[\s\S]*?#playerPlaybookSummary[\s\S]*?\.pb-player-summary__filter-pill \{[\s\S]*?min-width: var\(--tap-min\);[\s\S]*?min-height: var\(--tap-min\);[\s\S]*?touch-action: manipulation;/,
  "only Player Playbook actions and quick-filter pills become 44px coarse-pointer tablet targets",
);
assert.match(
  css,
  /@media \(max-width: 640px\),[\s\S]*?\.pb-player-summary__actions \.btn \{[\s\S]*?min-height: 36px;/,
  "the existing compact player-phone action treatment remains available",
);
assert.doesNotMatch(
  touchBlock,
  /@media print|shell-phone|pb-editor|playbookBalanceOverlay|playbookDataHealthOverlay/,
  "the scoped adjustment does not widen phone, print, editor, or report surfaces",
);

console.log("Player Playbook tablet touch contract passed");
