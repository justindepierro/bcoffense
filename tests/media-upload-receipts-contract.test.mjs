import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [migration, receiptsRoute, outbox, healthWorker, healthRoute, inventory] = await Promise.all([
  readFile(new URL("migrations/0024_media_upload_receipts.sql", `file://${root}/`), "utf8"),
  readFile(new URL("functions/media/receipts.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/media-upload-outbox.js", `file://${root}/`), "utf8"),
  readFile(new URL("workers/media-health-monitor.js", `file://${root}/`), "utf8"),
  readFile(new URL("functions/media/health.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/media-inventory.js", `file://${root}/`), "utf8"),
]);

assert.match(migration, /CREATE TABLE IF NOT EXISTS team_media_upload_receipts/, "migration creates a team-scoped upload receipt table");
assert.match(migration, /pending_upload_count/, "migration stores pending-upload health counts");
assert.match(migration, /stuck_upload_count/, "migration stores stuck-upload health counts");
assert.match(receiptsRoute, /getSessionFromRequest/, "receipt writes are authenticated");
assert.match(receiptsRoute, /resolveSessionTeamId/, "receipt writes are team scoped");
assert.match(receiptsRoute, /STAFF_ROLES/, "only staff can record a media receipt");
assert.match(receiptsRoute, /existing\?\.state === "completed"/, "late retry beacons cannot regress a completed upload");
assert.match(outbox, /function _reportRemoteReceipt/, "durable outbox reports lifecycle receipts without coupling them to upload success");
assert.match(outbox, /_reportRemoteReceipt\(job, "queued"\)/, "new durable uploads create a server receipt");
assert.match(outbox, /_reportRemoteReceipt\(completed, "completed"\)/, "completed uploads close the server receipt");
assert.match(healthWorker, /team_media_upload_receipts/, "scheduled worker audits open upload receipts");
assert.match(healthWorker, /STUCK_UPLOAD_SECONDS/, "scheduled worker distinguishes a stale reachable retry from normal queued work");
assert.match(healthWorker, /pendingUploads/, "health result includes pending uploads");
assert.match(healthRoute, /pendingUploadCount/, "staff health API exposes pending upload count");
assert.match(inventory, /Server-tracked uploads/, "media inventory surfaces receipt health");
assert.match(inventory, /Stuck uploads/, "media inventory surfaces actionable stalled uploads");

console.log("media upload receipt contract: 16 assertions passed");
