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

const shared = await readFile(new URL("js/script-shared.js", `file://${root}/`), "utf8");
assert.match(shared, /function toggleScriptPlayRail\(\)[\s\S]*?const openingLibrary = scriptPlayRailCollapsed;[\s\S]*?filtersCollapsed = true;[\s\S]*?applyScriptFiltersCollapsedState\(\)/, "every reopened library returns to the results-first collapsed-filter state");

const timeline = await readFile(new URL("js/script-timeline.js", `file://${root}/`), "utf8");
assert.match(timeline, /function renderScriptTimelineActions\(period\)[\s\S]*?Manage in period/, "timeline cards are navigation summaries rather than a duplicate period command strip");

const render = await readFile(new URL("js/script-render.js", `file://${root}/`), "utf8");
assert.match(render, /function renderPeriodHeaderMoreMenu[\s\S]*?data-action="duplicatePeriod"[\s\S]*?data-action="printPeriod"/, "period utilities are available from one explicit More menu");
assert.match(render, /function renderScriptPlayControls[\s\S]*?data-action="openScriptPresentation"[\s\S]*?<details class="script-row-actions">[\s\S]*?data-action="removeFromScript"/, "row study remains direct while secondary row utilities use progressive disclosure");
assert.match(render, /scriptStatsSummaryText[\s\S]*?statsDetails\.open = false/, "desktop Script statistics collapse to a concise live summary after render");

const index = await readFile(new URL("index.html", `file://${root}/`), "utf8");
assert.match(index, /<details id="scriptStatsDetails" class="script-stats-details" open>/, "Script totals have an explicit detail disclosure");
assert.match(index, /<details class="script-command-more">[\s\S]*?id="scriptSortField"[\s\S]*?id="jumpToPeriod"/, "secondary Script commands stay available from one Tools disclosure");

const finalHierarchyStart = css.lastIndexOf("/* Script command hierarchy:");
assert.ok(finalHierarchyStart >= 0, "Script declares final command-hierarchy rules");
const finalHierarchy = css.slice(finalHierarchyStart);
assert.match(finalHierarchy, /\.script-command-more-panel[\s\S]*?position:\s*absolute/, "desktop secondary command tools overlay instead of taking permanent workbench space");
assert.match(finalHierarchy, /\.script-stats-details\[open\] \.script-stats-bar[\s\S]*?position:\s*absolute/, "expanded statistics overlay instead of adding a permanent toolbar row");

console.log("script library desktop density contract: 19 assertions passed");
