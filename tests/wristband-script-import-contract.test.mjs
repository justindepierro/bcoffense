import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(
  new URL("js/script-export.js", `file://${root}/`),
  "utf8",
);

assert.match(
  source,
  /const cellsPerCard = getWristbandRecordCellCount\(wristband\);/,
  "script import honors the saved wristband's active cell count",
);
assert.match(
  source,
  /const cellData = Array\.isArray\(card\?\.data\) \? card\.data : card;/,
  "script import accepts legacy array-shaped cards",
);
assert.match(
  source,
  /cellData\.slice\(0, cellsPerCard\)\.forEach\(\(play\) => \{/,
  "script import never includes inactive player-card rows",
);
assert.match(
  source,
  /if \(!play \|\| typeof play !== "object"\) return;/,
  "script import ignores empty or malformed cells",
);
assert.match(
  source,
  /saveScriptState\(\);[\s\S]*?playsToAdd = \[\];/,
  "script state is captured before imported plays mutate the script",
);

console.log("wristband script import contract: 5 assertions passed");
