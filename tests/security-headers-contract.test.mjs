import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const auth = await readFile(new URL("functions/_lib/auth.js", `file://${root}/`), "utf8");

assert.match(
  auth,
  /script-src 'self' 'unsafe-inline' https:\/\/static\.cloudflareinsights\.com/,
  "the integrity-protected Cloudflare Web Analytics beacon is explicitly allowed",
);
assert.match(
  auth,
  /connect-src 'self'/,
  "automatic Cloudflare beacon delivery remains constrained to the app origin",
);
assert.doesNotMatch(
  auth,
  /script-src[^\n]*\*/,
  "the script policy does not broaden to a wildcard source",
);

console.log("security headers contract: Cloudflare beacon allowlist is narrow");
