import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [route, cards] = await Promise.all([
  readFile(new URL("functions/admin/callsheet-index-card-recovery.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/callsheet-index-cards.js", `file://${root}/`), "utf8"),
]);

assert.match(route, /Admin-only, record-scoped Index Card recovery/, "cloud recovery is explicitly record scoped");
assert.match(route, /session\.role !== "admin"/, "only an admin can access Index Card recovery");
assert.match(route, /readWorkspaceRevision/, "recovery reads immutable cloud history");
assert.match(route, /cards\[targetIndex\] = nextCard; else cards\.push\(nextCard\)/, "recovery replaces or restores only the requested card");
assert.match(route, /workspace\.callSheetSettings =/, "recovery changes the Call Sheet settings record rather than replacing the whole workspace");
assert.match(route, /expectedWorkspaceRevision: current\.pointer\.workspaceRevision/, "recovery uses compare-and-swap protection against concurrent workspace edits");
assert.match(route, /restoredCard: nextCard/, "recovery returns the restored card so the active device can replace its stale local copy");
assert.match(cards, /data-action="recoverCallSheetIndexCard"/, "the active card exposes a deliberate cloud-history action");
assert.match(cards, /Only this card will change; the rest of the workspace stays current/, "the recovery UI explains its narrow scope");
assert.match(cards, /confirmText: "Restore card"/, "restoring a historical card requires an explicit confirmation");
assert.match(cards, /callSheetSettings\.indexCards = cards;/, "the recovery UI replaces the active device's local card immediately");
assert.match(cards, /response\.status !== 503 \|\| attempt === 2/, "cloud history search tolerates transient wake-up responses without retrying a restore write");

console.log("call sheet index-card recovery contract: passed");
