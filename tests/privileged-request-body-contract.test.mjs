/** Focused runtime and route contracts for bounded privileged request bodies. */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  RequestBodyError,
  readBoundedFormObject,
  readBoundedJsonObject,
  readBoundedJsonOrFormObject,
} from "../functions/_lib/request-body.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFile(new URL(path, `file://${root}/`), "utf8");

const parsed = await readBoundedJsonObject(
  new Request("https://bcoffense.example/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "team_update", title: "Ready" }),
  }),
  { maxBytes: 1024 },
);
assert.deepEqual(parsed, { type: "team_update", title: "Ready" }, "small JSON object is accepted");

await assert.rejects(
  () => readBoundedJsonObject(
    new Request("https://bcoffense.example/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(["not", "an", "object"]),
    }),
    { maxBytes: 1024 },
  ),
  (error) => error instanceof RequestBodyError && error.status === 400 && error.code === "invalid_object",
  "JSON primitives and arrays cannot masquerade as privileged request objects",
);

const oversizedStream = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('{"field":"'));
    controller.enqueue(new TextEncoder().encode("x".repeat(128)));
    controller.enqueue(new TextEncoder().encode('"}'));
    controller.close();
  },
});
await assert.rejects(
  () => readBoundedJsonObject(
    new Request("https://bcoffense.example/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: oversizedStream,
      duplex: "half",
    }),
    { maxBytes: 64 },
  ),
  (error) => error instanceof RequestBodyError && error.status === 413 && error.code === "body_too_large",
  "an oversized chunked body is rejected even without Content-Length",
);

const formRequest = new Request("https://bcoffense.example/test", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "email=coach%40example.com&displayName=Coach+Example",
});
const form = await readBoundedFormObject(formRequest, { maxBytes: 1024 });
assert.equal(form.email, "coach@example.com", "bounded form parsing preserves text values");
assert.equal(form.displayName, "Coach Example", "bounded form parsing supports the bootstrap field shape");

const jsonOrForm = await readBoundedJsonOrFormObject(
  new Request("https://bcoffense.example/test", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ sourceRevision: "a".repeat(64), scriptId: "script-1" }),
  }),
  { maxBytes: 1024 },
);
assert.equal(jsonOrForm.scriptId, "script-1", "content type selects the bounded JSON path");

const [broadcast, bootstrap, recovery] = await Promise.all([
  source("functions/api/notifications/broadcast.js"),
  source("functions/auth/admin-bootstrap.js"),
  source("functions/admin/script-recovery.js"),
]);
assert.match(broadcast, /readBoundedJsonObject\(request, \{ maxBytes: MAX_BROADCAST_BODY_BYTES \}\)/, "broadcast reads a bounded JSON object");
assert.match(broadcast, /MAX_BROADCAST_BODY_BYTES = 8 \* 1024/, "broadcast has a small request ceiling");
assert.match(bootstrap, /readBoundedJsonOrFormObject\(request, \{ maxBytes: MAX_ADMIN_BOOTSTRAP_BODY_BYTES \}\)/, "admin bootstrap bounds JSON and form requests");
assert.match(bootstrap, /typeof value !== "string"/, "admin bootstrap rejects non-text account fields");
assert.match(recovery, /readBoundedJsonObject\(context\.request, \{ maxBytes: MAX_SCRIPT_RECOVERY_BODY_BYTES \}\)/, "script recovery reads a bounded JSON object");
assert.match(recovery, /typeof input\.sourceRevision === "string"/, "script recovery requires text revision identifiers");

console.log("privileged request body contract: 12 assertions passed");
