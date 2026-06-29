import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const require = createRequire(import.meta.url);
const pwRoot = process.env.MOBILE_DEBUG_PLAYWRIGHT_ROOT || `${process.env.HOME}/.codex/tools/mobile-debug`;
const { chromium } = require(path.join(pwRoot, "node_modules/playwright"));
const MIME = new Map([[".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"], [".png", "image/png"]]);
function serve(port) {
  const server = createServer((req, res) => {
    const parsed = new URL(req.url || "/", "http://localhost");
    if (parsed.pathname === "/auth/me") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ user: { username: "admin", role: "admin", label: "Admin" } })); }
    if (parsed.pathname.startsWith("/sync/")) { res.writeHead(204); return res.end(); }
    let p = decodeURIComponent(parsed.pathname); if (p === "/") p = "/index.html";
    const r = path.resolve(root, `.${p}`);
    if (!r.startsWith(root) || !existsSync(r) || !statSync(r).isFile()) { res.writeHead(404); return res.end("nf"); }
    res.writeHead(200, { "Content-Type": MIME.get(path.extname(r)) || "application/octet-stream", "Cache-Control": "no-store" });
    createReadStream(r).pipe(res);
  });
  return new Promise((rs) => server.listen(port, "127.0.0.1", () => rs({ server, url: `http://127.0.0.1:${port}/index.html` })));
}
const { server, url } = await serve(4198);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

const first = await page.evaluate(async () => {
  const items = Array.from({ length: 4 }, (_, i) => ({ play: { formation: "Trips Right", protection: "Slide", play: "Mesh " + i, type: "Pass" }, context: "Period " + i }));
  window.openPlayPresentation(items, 0, "playbook");
  await new Promise((r) => setTimeout(r, 250));
  const hint = document.getElementById("playPresentationRotateHint");
  const open = document.getElementById("playPresentationOverlay").classList.contains("is-open");
  const shownNoOverflow = !hint.hidden;
  const body = document.getElementById("playPresentationBody");
  body.insertAdjacentHTML("beforeend", '<div style="height:2000px"></div>');
  window.updatePlayPresentationRotateHint();
  await new Promise((r) => setTimeout(r, 30));
  return { open, shownNoOverflow, shownOnOverflow: !hint.hidden };
});

await page.setViewportSize({ width: 844, height: 390 });
const landscape = await page.evaluate(async () => {
  window.dispatchEvent(new Event("resize"));
  await new Promise((r) => setTimeout(r, 60));
  window.updatePlayPresentationRotateHint();
  return { hiddenLandscape: document.getElementById("playPresentationRotateHint").hidden };
});

await page.setViewportSize({ width: 390, height: 844 });
const tail = await page.evaluate(async () => {
  window.dispatchEvent(new Event("resize"));
  await new Promise((r) => setTimeout(r, 40));
  const hint = document.getElementById("playPresentationRotateHint");
  const reshown = !hint.hidden;
  window.dismissPlayPresentationRotateHint();
  const afterDismiss = hint.hidden;
  window.updatePlayPresentationRotateHint();
  const staysDismissed = hint.hidden;
  window.closePlayPresentation();
  await new Promise((r) => setTimeout(r, 80));
  return { reshown, afterDismiss, staysDismissed, closedHidden: hint.hidden };
});

console.log("RESULT", JSON.stringify({ ...first, ...landscape, ...tail }, null, 2));
console.log("PAGE ERRORS:", errors.length ? errors : "none");
await browser.close();
server.close();
