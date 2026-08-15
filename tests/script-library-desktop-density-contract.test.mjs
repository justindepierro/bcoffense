import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const css = await readFile(new URL("css/script.css", `file://${root}/`), "utf8");

const desktopStart = css.indexOf("/* Desktop Script library: filters are reference controls");
const desktopEnd = css.indexOf("/* Density + scroll polish", desktopStart);
assert.ok(desktopStart >= 0 && desktopEnd > desktopStart, "Script defines a dedicated desktop library-density block");
const block = css.slice(desktopStart, desktopEnd);

assert.match(block, /body:not\(\.is-mobile-screen\):not\(\[data-auth-role="player"\]\)[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/, "desktop advanced filters use a compact two-column matrix");
assert.match(block, /\.checkbox-filters-title\s*\{[\s\S]*?min-height:\s*28px/, "desktop filter disclosures do not retain touch-sized rows");
assert.match(block, /\.filters\.filters-compact[\s\S]*?select\s*\{[\s\S]*?height:\s*32px/, "desktop formation and base-play selects have compact deliberate height");
assert.doesNotMatch(block, /is-mobile-screen\)\s*#script/, "desktop density rules do not target the mobile shell");

console.log("script library desktop density contract: 4 assertions passed");
