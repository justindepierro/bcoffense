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
assert.match(source, /It never repairs or deletes media/, "the scheduled cleanup gate stays read-only");

console.log("media health monitor contract: read-only legacy and orphan inventory gates passed");
