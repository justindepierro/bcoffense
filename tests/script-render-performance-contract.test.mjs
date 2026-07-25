import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(new URL("js/script-render.js", `file://${root}/`), "utf8");
assert.match(
  source,
  /function renderScriptContent\(container, renderContext, profile = null\)[\s\S]*?const markupStartedAt = profile \? performance\.now\(\) : 0;[\s\S]*?profile\.contentMarkupMs = performance\.now\(\) - markupStartedAt;[\s\S]*?const domStartedAt = profile \? performance\.now\(\) : 0;[\s\S]*?profile\.contentDomMs = performance\.now\(\) - domStartedAt;/,
  "the Script profiler separates markup construction from DOM insertion",
);
assert.match(
  source,
  /"contentMs",[\s\S]*?"contentMarkupMs",[\s\S]*?"contentDomMs"/,
  "Script profiler summaries retain both content sub-stage measurements",
);
assert.match(
  source,
  /function renderScriptRows\(renderContext, profile = null\)[\s\S]*?profile\.periodHeaderMarkupMs \+= performance\.now\(\) - headerStartedAt;[\s\S]*?profile\.playRowMarkupMs \+= performance\.now\(\) - rowStartedAt/,
  "the Script profiler isolates row and period-header markup work",
);
assert.match(
  source,
  /profile\.playerAssignmentMarkupMs \+= performance\.now\(\) - playerAssignmentStartedAt;[\s\S]*?profile\.readinessMarkupMs \+= performance\.now\(\) - readinessStartedAt/,
  "the Script profiler distinguishes lineup and readiness markup from the rest of each row",
);

const playerSource = await readFile(new URL("js/script-players.js", `file://${root}/`), "utf8");
assert.match(
  source,
  /const scriptPlayerRenderCache = \{[\s\S]*?playerOptionMarkupBySelectedId: new Map\(\),[\s\S]*?playerDisplayById: new Map\(\),/,
  "a Script render owns fresh roster-markup caches",
);
assert.match(
  source,
  /buildScriptPlayerAssignmentGrid\(play, index, playLabel, opts, scriptPlayerRenderCache\)/,
  "a Script render passes its roster-markup cache to every lineup grid",
);
assert.match(
  playerSource,
  /function buildScriptPlayerAssignmentGrid\(play, index, playLabel, opts = \{\}, renderCache = null\)[\s\S]*?playerOptionMarkupBySelectedId[\s\S]*?playerDisplayById[\s\S]*?getPlayerOptionMarkup\(assignments\[slot\.key\] \|\| ""\)/,
  "lineup rendering reuses roster option and player-label markup only within the current render",
);

console.log("Script render profiling contract passed");
