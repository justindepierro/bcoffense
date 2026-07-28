import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const fixture = JSON.parse(await read("tests/fixtures/personnel-variants-baseline.json"));
const [utils, scriptShared, wristbandPopup, callSheetExport, gamePlanIntegrations, editor] = await Promise.all([
  read("js/utils.js"),
  read("js/script-shared.js"),
  read("js/wristband-cell-popup.js"),
  read("js/callsheet-export.js"),
  read("js/gameplan-integrations.js"),
  read("js/playbook-editor.js"),
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

const helpers = new Function(`${utils}
return {
  normalizePlayPersonnelVariants,
  getPlayPersonnelOptions,
  getEffectivePlayVariant,
};`)();

const legacy = { ...base };
assert.equal(helpers.normalizePlayPersonnelVariants(legacy), false,
  "a legacy play without variants is not mutated on read");
assert.equal(legacy.personnelVariants, undefined,
  "legacy play shape remains unchanged on read");

const variantPlay = {
  ...base,
  personnelVariants: [
    { personnel: "Gold", overrides: { notes: "Gold note", ignored: "drop me" } },
    { id: "duplicate-gold", personnel: "gold" },
    { id: "Irish variant!", personnel: "Irish", overrides: { motion: "Jet" } },
    null,
  ],
};
assert.equal(helpers.normalizePlayPersonnelVariants(variantPlay), true,
  "variant records are normalized at a write boundary");
assert.deepEqual(variantPlay.personnelVariants, [
  { id: "pv_playbluezorrowolf_gold", personnel: "Gold", overrides: { notes: "Gold note" } },
  { id: "Irish_variant_", personnel: "Irish", overrides: { motion: "Jet" } },
], "normalization creates stable IDs, removes duplicates, and keeps only approved overrides");

const options = helpers.getPlayPersonnelOptions(variantPlay);
assert.deepEqual(options.map((option) => option.personnel), ["Blue", "Gold", "Irish"],
  "primary personnel is first and approved variants follow");
const gold = helpers.getEffectivePlayVariant(variantPlay, "pv_playbluezorrowolf_gold");
assert.equal(gold.id, base.id, "effective variants preserve the source play identity");
assert.equal(gold.personnel, "Gold", "effective variants select their approved personnel");
assert.equal(gold.play, base.play, "effective variants inherit the base call");
assert.equal(gold.notes, "Gold note", "effective variants apply explicit overrides only");
assert.equal(gold.personnelVariantId, "pv_playbluezorrowolf_gold", "effective variant identifies its stable selection");

assert.match(editor, /Personnel variants[\s\S]*?Add personnel/,
  "Edit Play exposes an approved-personnel authoring surface");
assert.match(editor, /_pendingPlayEditorPersonnelVariants[\s\S]*?closePlayEditor[\s\S]*?_pendingPlayEditorPersonnelVariants = null/,
  "personnel changes stay staged and are discarded when the editor closes");
assert.match(editor, /Editing base play[\s\S]*?Editing \$\{escapeHtml\(selected\?\.personnel/,
  "the editor gives distinct base and variant editing feedback");
assert.match(editor, /existing\.personnelVariants = stagedSource\.personnelVariants/,
  "saving a variant writes only the canonical base play's variant collection");

console.log("personnel variants baseline contract: legacy data paths are preserved");
