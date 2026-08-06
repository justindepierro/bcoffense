import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const actions = await readFile(new URL("js/gameplan-actions.js", `file://${root}/`), "utf8");

const contextMenu = actions.match(/function _gpOpenPlayContextMenu\([\s\S]*?\n}\n\/\* -------------------------------------------------------------------------\n   Box Reorder/);
assert.ok(contextMenu, "Game Plan box-play context menu is available");
assert.match(
  contextMenu[0],
  /Change personnel \/ Game Plan-only override…[\s\S]*?openGamePlanPersonnelVariant\(playArg\)/,
  "the context menu exposes the approved-personnel picker and Game Plan-only override",
);
assert.match(
  contextMenu[0],
  /getPlayPersonnelOptions\(source\)[\s\S]*?personnelOptions\.length > 1[\s\S]*?Add approved personnel version…[\s\S]*?openGamePlanPersonnelVariantsPicker\(playArg\)/,
  "the context menu exposes adding unused approved personnel versions when available",
);

console.log("game plan personnel context menu contract: passed");
