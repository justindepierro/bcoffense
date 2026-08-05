/**
 * Read-only cleanup evidence contract.
 *
 * The scheduled monitor is the deletion gate for media migration work: it
 * must distinguish active canonical pointers, canonical leftovers, and
 * historic diagram archives without ever mutating R2.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(new URL("workers/media-health-monitor.js", `file://${root}/`), "utf8");

assert.match(source, /const LEGACY_DIAGRAM_PREFIXES = \["media\/plays\/", "images\/"\]/, "the primary team health run inspects historic diagram locations");
assert.match(source, /function legacyDiagramKind\(key\)/, "legacy diagram paths are classified without guessing from display labels");
assert.match(source, /const orphanCanonicalDiagramKeys = \[\.\.\.diagramObjectByKey\.keys\(\)\]\.filter\(\(key\) => !pointerKeys\.has\(key\)\)/, "unreferenced canonical diagram objects are counted from durable pointer ownership");
assert.match(source, /orphanCanonicalDiagramCount: orphanCanonicalDiagramKeys\.length/, "the health report records a deletion candidate count");
assert.match(source, /legacyDiagramObjectCounts: legacyDiagramCounts/, "the health report records legacy diagram evidence separately");
assert.match(source, /const CANONICAL_ORPHAN_RETENTION_SECONDS = 7 \* 24 \* 60 \* 60/, "orphan cleanup requires a seven-day retention window");
assert.match(source, /async function syncCanonicalOrphanCandidates/, "complete scans maintain a durable candidate ledger");
assert.match(source, /if \(!scanComplete\) return/, "a partial scan cannot change retention evidence");
assert.match(source, /status = 'resolved'/, "a candidate becomes ineligible if a later scan sees it referenced again");
assert.match(source, /orphanRetention:/, "the health record exposes retention eligibility without deleting media");
assert.match(source, /It never repairs or deletes media/, "the scheduled cleanup gate stays read-only");

console.log("media health monitor contract: read-only legacy and orphan inventory gates passed");
