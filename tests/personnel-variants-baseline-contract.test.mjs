import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const fixture = JSON.parse(await read("tests/fixtures/personnel-variants-baseline.json"));
const [utils, scriptShared, wristbandPopup, callSheetExport, gamePlanIntegrations] = await Promise.all([
  read("js/utils.js"),
  read("js/script-shared.js"),
  read("js/wristband-cell-popup.js"),
  read("js/callsheet-export.js"),
  read("js/gameplan-integrations.js"),
]);

const base = fixture.basePlay;
assert.ok(base.id, "baseline play has a stable identity");
assert.ok(base.personnel, "baseline play has primary personnel");
assert.equal(base.personnelVariants, undefined, "legacy base-only plays have no variants field");

[fixture.scriptEntry, fixture.wristbandCell, fixture.callSheetEntry, fixture.gamePlanEntry]
  .forEach((entry) => {
    assert.equal(entry.id, base.id, "saved workflow entries retain the source play identity");
    assert.equal(entry.personnel, base.personnel, "saved workflow entries retain primary personnel");
  });

assert.match(utils, /function playSignature\(play\)[\s\S]*?if \(play && play\.id\) return play\.id;/,
  "play signatures remain tied to stable IDs, not personnel labels");
assert.match(scriptShared, /scriptPersonnelOverride/,
  "the current script-only override remains readable during the migration");
assert.match(wristbandPopup, /extraPersonnel/,
  "existing wristband extra-personnel text remains readable during the migration");
assert.match(callSheetExport, /esc\(p\.personnel\)/,
  "call-sheet export continues to use primary personnel until variant export is explicitly added");
assert.match(gamePlanIntegrations, /copyPlayForCallSheet\(play, \{ wristbandNumber: wb \}\)/,
  "Game Plan continues to copy the original play identity into Call Sheet entries");

console.log("personnel variants baseline contract: legacy data paths are preserved");
