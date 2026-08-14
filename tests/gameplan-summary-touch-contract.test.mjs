/**
 * T-009 P1 Game Plan touch-disclosure contract.
 *
 * Coverage and Touch Tracker are native details/summary controls. Keep their
 * small tablet-safe hit-area adjustment local to those two screen surfaces;
 * Media, bulk sheets, dialogs, desktop density, and print are deliberately
 * outside this tranche.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [render, health, css] = await Promise.all([
  source("js/gameplan-render.js"),
  source("js/gameplan-health.js"),
  source("css/gameplan.css"),
]);

assert.match(
  render,
  /function _gpRenderScoreboard\(board, draftedPlays\) \{[\s\S]*?<details class="gp-scoreboard"[\s\S]*?<summary>📋 Coverage<\/summary>[\s\S]*?<\/details>/,
  "Coverage remains a native Game Plan details/summary disclosure",
);
assert.match(
  health,
  /function _gpRenderTouchTracker\(board, draftedPlays\) \{[\s\S]*?<details class="gp-touch-tracker">[\s\S]*?<summary>👥 Touch Tracker [\s\S]*?<\/summary>[\s\S]*?<\/details>/,
  "Touch Tracker remains a native Game Plan details/summary disclosure",
);

const touchBlockStart = css.indexOf("/* T-009 P1: Coverage and Touch Tracker remain native disclosures.");
const touchBlockEnd = css.indexOf(".gp-touch-grid", touchBlockStart);
const touchBlock = css.slice(touchBlockStart, touchBlockEnd);
assert.ok(touchBlockStart >= 0 && touchBlockEnd > touchBlockStart, "Game Plan defines a dedicated touch-disclosure block");
assert.match(
  touchBlock,
  /@media screen and \(pointer: coarse\) \{[\s\S]*?body\.is-mobile-screen #gameplan \.gp-scoreboard:not\(\.gp-media-scoreboard\) > summary,[\s\S]*?body\.is-mobile-screen #gameplan \.gp-touch-tracker > summary \{[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?min-height: var\(--tap-min\);[\s\S]*?touch-action: manipulation;/,
  "only the two tablet Game Plan summaries become 44px coarse-pointer targets",
);
assert.match(
  touchBlock,
  /\.gp-scoreboard:not\(\.gp-media-scoreboard\)/,
  "Coverage sizing excludes the separate Media scoreboard disclosure",
);
assert.doesNotMatch(
  touchBlock,
  /@media print|gp-library-bulk|gp-modal|gp-library-rail|gp-index|gp-print-modal/,
  "the disclosure rule does not widen into print, sheets, dialogs, rails, or index cards",
);

console.log("Game Plan summary touch contract: native Coverage and Touch Tracker targets passed");
