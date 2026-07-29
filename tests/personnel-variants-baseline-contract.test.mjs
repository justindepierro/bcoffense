import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const fixture = JSON.parse(await read("tests/fixtures/personnel-variants-baseline.json"));
const [utils, scriptShared, wristband, wristbandPopup, wristbandExport, callSheet, callSheetRender, callSheetPrint, callSheetExport, gamePlan, gamePlanRender, gamePlanIntegrations, editor] = await Promise.all([
  read("js/utils.js"),
  read("js/script-shared.js"),
  read("js/wristband.js"),
  read("js/wristband-cell-popup.js"),
  read("js/wristband-export.js"),
  read("js/callsheet.js"),
  read("js/callsheet-render.js"),
  read("js/callsheet-print.js"),
  read("js/callsheet-export.js"),
  read("js/gameplan.js"),
  read("js/gameplan-render.js"),
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
  getPlayFilterVariants,
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
assert.deepEqual(helpers.getPlayFilterVariants(variantPlay).map((play) => play.personnel), ["Blue", "Gold", "Irish"],
  "playbook filtering can inspect every approved personnel version without cloning a play");
assert.deepEqual(helpers.getPlayFilterVariants({ personnel: "Blue", approvedPersonnel: ["Blue", "Gold"] }).map((play) => play.personnel), ["Blue", "Gold"],
  "player-safe approved personnel labels participate in filtering without exposing a variant object");
assert.deepEqual(
  helpers.getPlayFilterVariants({
    personnel: "Blue",
    formation: "Base",
    approvedFilterVariants: [{ personnel: "Gold", formation: "Gold Rt", motion: "Orbit" }],
  }).map((play) => [play.personnel, play.formation, play.motion]),
  [["Blue", "Base", undefined], ["Gold", "Gold Rt", "Orbit"]],
  "player-safe variant metadata participates in formation and motion filtering",
);

assert.match(editor, /Personnel variants[\s\S]*?Add personnel/,
  "Edit Play exposes an approved-personnel authoring surface");
assert.match(editor, /_pendingPlayEditorPersonnelVariants[\s\S]*?closePlayEditor[\s\S]*?_pendingPlayEditorPersonnelVariants = null/,
  "personnel changes stay staged and are discarded when the editor closes");
assert.match(editor, /Editing base play[\s\S]*?Editing \$\{escapeHtml\(selected\?\.personnel/,
  "the editor gives distinct base and variant editing feedback");
assert.match(editor, /existing\.personnelVariants = stagedSource\.personnelVariants/,
  "saving a variant writes only the canonical base play's variant collection");
assert.match(editor, /function choosePlayPersonnelVariant\(play\)/,
  "adding a personnel variant begins with a team-package picker");
assert.match(editor, /custom-modal-overlay visible pb-personnel-picker-overlay/,
  "the personnel picker uses the shared modal system's visible state");
assert.doesNotMatch(editor, /custom-modal-overlay show pb-personnel-picker-overlay/,
  "the personnel picker cannot regress to the legacy hidden show state");
assert.match(editor, /getTeamPersonnelPackages\(\)/,
  "the personnel variant picker reuses the team's configured personnel vocabulary");
assert.match(editor, /Add custom/,
  "the personnel variant picker retains a deliberate custom-label fallback");
assert.match(editor, /ensureTeamPersonnelPackage\(personnel\)/,
  "a newly approved personnel variant is registered for team-wide reuse");
assert.match(await read("js/team-settings.js"), /function ensureTeamPersonnelPackage\(personnel\)/,
  "Team Settings owns durable registration of reusable personnel packages");
assert.match(await read("js/team-settings.js"), /getPlayPersonnelOptions\(play\)\.map\(\(option\) => option\.personnel\)/,
  "existing personnel variants also appear in the team personnel vocabulary");
assert.match(editor, /const variantActions = \{[\s\S]*?addPlayPersonnelVariant/,
  "personnel editor actions are wired locally after each modal render");
assert.match(scriptShared, /scriptPersonnelVariantId/,
  "Script rows preserve a stable personnel variant reference during source refreshes");
assert.match(scriptShared, /getEffectivePlayVariant\(play, variantId\)/,
  "Script call rendering resolves selected personnel variant metadata");
assert.match(scriptShared, /setScriptPersonnelVariant\(index, variantId\)/,
  "Script personnel controls select an approved variant rather than cloning a play");
assert.match(wristband, /getEffectivePlayVariant\(play, selectedVariantId\)/,
  "Wristband cells resolve an approved active personnel selection without cloning the source play");
assert.match(wristband, /personnelDisplayVariantIds/,
  "Wristband cells can display additional approved personnel alongside legacy write-in personnel");
assert.match(wristbandPopup, /renderWbPersonnelVariantControls/,
  "Wristband editing presents approved personnel choices only when the source play has them");
assert.match(wristbandPopup, /personnelVariantId: existing\.personnelVariantId/,
  "Wristband component-order actions preserve an existing personnel selection");
assert.match(wristbandExport, /personnelVariantId: custom\?\.personnelVariantId/,
  "Wristband print caching distinguishes cells using different approved personnel selections");
assert.match(callSheetRender, /function getCallSheetEffectivePlay\(play\)/,
  "Call Sheet keeps a display-time effective personnel resolver instead of cloning plays");
assert.match(callSheet, /Approved Personnel[\s\S]*?source play stays unchanged/,
  "Call Sheet cell controls explain that personnel selection is local to the sheet");
assert.match(callSheet, /"cellFormationTags", "cellBackTags", "personnelVariantId"/,
  "Call Sheet refresh preserves an approved personnel selection");
assert.match(callSheetPrint, /getCallSheetEffectivePlay\(play\)/,
  "Call Sheet printing resolves the same selected personnel as the editor");
assert.match(callSheetRender, /function getCallSheetAdditionalPersonnel\(play\)/,
  "Call Sheet can show additional approved personnel without changing the active call");
assert.match(callSheet, /data-cs-display-variant/,
  "Call Sheet cells expose an opt-in multi-personnel display control");
assert.match(gamePlan, /function _gpPersonnelChoicesForPlay\(play\)/,
  "Game Plan derives filter choices from every approved personnel option");
assert.match(gamePlan, /_gpPersonnelFilterMatches\(p, _gpFilters\.personnel\)/,
  "Game Plan personnel filtering matches approved variants without rewriting primary personnel");
assert.match(gamePlanRender, /_gpPersonnelChoicesForPlay\(play\)/,
  "Game Plan shows approved personnel values in its existing filter menu");
assert.match(utils, /function getPlayFilterVariants\(play\)/,
  "shared filtering resolves coherent effective personnel variants");
assert.match(utils, /filterVariants \};/,
  "the runtime index retains effective variants for fast repeated filtering");
assert.match(await read("js/playbook-filters.js"), /const matchesVariantFilters = filterVariants\.some/,
  "Playbook filtering evaluates a full filter query against each approved variant");

console.log("personnel variants baseline contract: legacy data paths are preserved");
