import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(new URL(path, `file://${root}/`), "utf8");
const [storage, cloudSync, csvExport, csvImport, fixtureText] = await Promise.all([
  read("js/storage.js"),
  read("js/cloud-sync.js"),
  read("js/playbook-export.js"),
  read("js/playbook-import.js"),
  read("tests/fixtures/personnel-variants-baseline.json"),
]);
const fixture = JSON.parse(fixtureText);

const variantPlay = {
  ...fixture.basePlay,
  personnelVariants: [{
    id: "pv_playbluezorrowolf_gold",
    personnel: "Gold",
    overrides: {
      formation: "Gold Rt",
      motion: "Orbit",
      notes: "Coach-only Gold install note",
    },
  }],
};

// Browser backup and the canonical cloud workspace carry portable JSON. This
// is the actual data representation used at both boundaries.
const portableBackup = {
  app: "BCOffense",
  version: 1,
  playbook: JSON.stringify([variantPlay]),
};
const restored = JSON.parse(portableBackup.playbook);
assert.deepEqual(restored, [variantPlay],
  "portable backup JSON retains every personnel variant field exactly");

const canonicalWorkspace = JSON.parse(JSON.stringify({
  app: "BCOffense",
  playbook: portableBackup.playbook,
  teamPersonnelPackages: JSON.stringify([{ personnel: "Gold", assignments: {} }]),
}));
assert.equal(canonicalWorkspace.playbook, portableBackup.playbook,
  "the canonical workspace keeps the complete serialized playbook intact");
assert.deepEqual(JSON.parse(canonicalWorkspace.playbook)[0].personnelVariants, variantPlay.personnelVariants,
  "a cloud-shaped workspace retains the approved variant record unchanged");

assert.match(storage, /data\[STORAGE_KEYS\.PLAYBOOK\] = JSON\.stringify\(pb\)/,
  "browser backup serializes the full IndexedDB playbook rather than a CSV projection");
assert.match(storage, /normalizeBackupValueForRestore\(\s*STORAGE_KEYS\.PLAYBOOK,[\s\S]*?_idbSetPlaybook\(normalized\.value\)/,
  "restore validates then writes the full playbook collection back to IndexedDB");
assert.match(cloudSync, /STORAGE_KEYS\.PLAYBOOK[\s\S]*?STORAGE_KEYS\.TEAM_PERSONNEL_PACKAGES/,
  "the canonical Cloudflare workspace includes both play variants and their reusable team packages");
assert.match(cloudSync, /function buildCanonicalTeamWorkspace\(backup\)[\s\S]*?workspace\[key\] = source\[key\]/,
  "workspace projection copies allowed portable fields without rewriting their contents");

assert.match(csvExport, /"personnel"/,
  "CSV export deliberately continues to emit the base primary personnel column");
assert.doesNotMatch(csvExport, /personnelVariants/,
  "CSV remains a flat import/export format and never pretends to preserve variant patches");
assert.match(csvImport, /const play = \{\};[\s\S]*?result\.push\(play\);/,
  "CSV import constructs a new base play instead of mutating existing variant data");

console.log("personnel variants round-trip contract: backups and canonical workspace preserve variants; CSV stays base-only");
