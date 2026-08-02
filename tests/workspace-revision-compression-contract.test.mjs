import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [source, client] = await Promise.all([
  readFile(new URL("functions/workspace/revision.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/cloud-sync.js", `file://${root}/`), "utf8"),
]);

assert.match(source, /async function workspaceJson\(context, data, init = \{\}\)/, "workspace route owns its large-response transport helper");
assert.match(source, /byteLength\(workspaceText\) < 512 \* 1024/, "small workspace responses keep the ordinary JSON path");
assert.match(source, /X-BC-Workspace-Transport/, "compression requires an explicit client transport opt-in");
assert.match(source, /new CompressionStream\("gzip"\)/, "large workspace responses stream as gzip");
assert.match(source, /workspaceTransport: "gzip-base64-json-v1"/, "compact responses declare their versioned envelope");
assert.match(source, /workspaceCompressed/, "compact responses carry only compressed workspace bytes");
assert.match(source, /return await workspaceJson\(context, \{[\s\S]*?workspace,/, "workspace GET uses the compressed transport for full workspace bodies");
assert.match(client, /"X-BC-Workspace-Transport": "gzip-base64-json-v1"/, "new clients opt into the compact workspace response");
assert.match(client, /data\.workspaceTransport === "gzip-base64-json-v1"[\s\S]*?new DecompressionStream\("gzip"\)/, "new clients decode the compact workspace response before validation");

console.log("workspace revision compression contract: 9 assertions passed");
