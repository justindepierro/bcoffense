import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(new URL("functions/workspace/revision.js", `file://${root}/`), "utf8");

assert.match(source, /function workspaceJson\(context, data, init = \{\}\)/, "workspace route owns its large-response transport helper");
assert.match(source, /byteLength\(text\) < 512 \* 1024/, "small workspace responses keep the ordinary JSON path");
assert.match(source, /Accept-Encoding/, "compression is negotiated with the browser");
assert.match(source, /new CompressionStream\("gzip"\)/, "large workspace responses stream as gzip");
assert.match(source, /headers\.set\("Content-Encoding", "gzip"\)/, "compressed response is explicitly labeled for transparent fetch decoding");
assert.match(source, /return workspaceJson\(context, \{[\s\S]*?workspace,/, "workspace GET uses the compressed transport for full workspace bodies");

console.log("workspace revision compression contract: 6 assertions passed");
