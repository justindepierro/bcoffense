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

const displayOptions = await readFile(new URL("js/script-display-options.js", `file://${root}/`), "utf8");
assert.match(displayOptions, /coachGridLibraryVersion\s*=\s*2/, "existing desktop layouts migrate once to the play-first library default");
assert.match(displayOptions, /needsCoachGridLibraryDefault\s*\?\s*true/, "the migrated default starts with advanced filters collapsed");

const playFirstStart = css.indexOf("/* Desktop Script library: get coaches to live plays first.");
const playFirstEnd = css.indexOf("/* The Script header used a five-column desktop grid", playFirstStart);
assert.ok(playFirstStart >= 0 && playFirstEnd > playFirstStart, "Script defines a dedicated play-first desktop library block");
const playFirst = css.slice(playFirstStart, playFirstEnd);
assert.match(playFirst, /\.script-library-search-hint\s*\{\s*display:\s*none/, "desktop library removes the explanatory paragraph from the result runway");
assert.match(playFirst, /\.available-plays-container\s*\{[\s\S]*?flex:\s*1 1 auto[\s\S]*?overflow-y:\s*auto/, "available plays own the remaining rail height");

const toolbarStart = css.indexOf("/* The Script header used a five-column desktop grid");
assert.ok(toolbarStart >= 0, "Script defines a dedicated desktop command-row repair");
const toolbar = css.slice(toolbarStart);
assert.match(toolbar, /\.script-toolbar\s*\{[\s\S]*?order:\s*10[\s\S]*?flex:\s*1 0 100%/, "search and sort move to a full-width desktop command row");
assert.match(toolbar, /grid-template-columns:\s*max-content minmax\(280px, 1fr\) minmax\(240px, 1fr\)/, "desktop command row reserves explicit sort and search space");

console.log("script library desktop density contract: 10 assertions passed");
