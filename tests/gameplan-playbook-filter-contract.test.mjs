import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const gamePlan = await readFile(new URL("js/gameplan.js", `file://${root}/`), "utf8");
const filters = await readFile(new URL("js/playbook-filters.js", `file://${root}/`), "utf8");

assert.match(
  gamePlan,
  /function getGamePlanBoardMembership\(\)[\s\S]*?const signatures = new Set\(\);[\s\S]*?const sourceIds = new Set\(\);[\s\S]*?return \{ signatures, sourceIds \};/,
  "game-plan board membership exposes both legacy signatures and stable source IDs",
);
assert.match(
  filters,
  /const boardGamePlanMembership[\s\S]*?getGamePlanBoardMembership\(\)/,
  "the playbook filter reads canonical board membership",
);
assert.match(
  filters,
  /const onBoard = boardGamePlanMembership\.signatures\.has\(gpSig\)[\s\S]*?boardGamePlanMembership\.sourceIds\.has\(sourceId\)[\s\S]*?if \(!onBoard && !taggedForOpponent\.has\(tagSig\)\) return false;/,
  "the game-plan filter keeps the union of board cards and opponent tags",
);

console.log("game plan playbook filter contract: board/tag union passed");
