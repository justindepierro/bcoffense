import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [editor, images, gamePlan, callSheet, scriptAdd, scriptShared, gamePlanIntegrations, clips, quizFoundation, quiz] = await Promise.all([
  source("js/playbook-editor.js"),
  source("js/play-images.js"),
  source("js/gameplan.js"),
  source("js/callsheet.js"),
  source("js/script-add.js"),
  source("js/script-shared.js"),
  source("js/gameplan-integrations.js"),
  source("js/play-clips.js"),
  source("js/script-quiz-foundation.js"),
  source("js/script-quiz.js"),
]);

assert.match(
  editor,
  /function _resolvePlayEditorMasterIndex\(play\)[\s\S]*?getStablePlaySourceId\(play\)[\s\S]*?String\(candidate\?\.id \|\| ""\)\.trim\(\) === sourceId/,
  "a script row resolves its canonical source by stable ID before legacy content matching",
);
assert.match(
  editor,
  /_editingMasterIdx = _resolvePlayEditorMasterIndex\(play\);[\s\S]*?const canonicalPlay = _editingMasterIdx >= 0 \? plays\[_editingMasterIdx\] : null;/,
  "the script editor populates from the canonical source play when it exists",
);
assert.match(
  editor,
  /pushRemote\(play, blob, \{ fresh: true \}\)/,
  "an explicit editor diagram replacement requests a fresh remote media version",
);
assert.match(
  images,
  /async function checkRemoteForPlay\(play, options = \{\}\)[\s\S]*?if \(options\.fresh === true\) _remoteManifestCache\.delete\(identityKey\);/,
  "fresh media checks bypass a stale manifest cache without changing normal page caching",
);
assert.match(
  images,
  /function displaySignaturesForPlay\(play\)[\s\S]*?const mediaId = typeof getPlayMediaId[\s\S]*?const exactCandidates = \[[\s\S]*?mediaId,/,
  "display lookups include the canonical cloud media ID after a successful R2 download",
);
assert.match(
  images,
  /function signaturesForPlay\(play\)[\s\S]*?const mediaId = typeof getPlayMediaId[\s\S]*?const candidates = \[[\s\S]*?mediaId,/,
  "shared image operations retain the canonical cloud media ID alongside legacy identifiers",
);
assert.match(
  scriptAdd,
  /function createScriptPlayFromPlaybook\(play, options = \{\}\)[\s\S]*?mediaId: typeof getPlayMediaId[\s\S]*?copy\.scriptPersonnelVariantId = personnelVariantId/,
  "script-copy fallback preserves the canonical media ID and an explicit approved personnel selection",
);
assert.match(
  scriptShared,
  /refreshLinkedScriptPlaysFromPlaybook\(sourcePlay\)[\s\S]*?mediaId: typeof getPlayMediaId/,
  "script refresh fallback preserves the canonical media ID",
);
assert.match(
  callSheet,
  /function copyPlayForCallSheet\(play, overrides = \{\}\)[\s\S]*?mediaId: typeof getPlayMediaId/,
  "call-sheet fallback preserves the canonical media ID",
);
assert.match(
  gamePlanIntegrations,
  /pushGamePlanToScript\(\)[\s\S]*?mediaId: typeof getPlayMediaId[\s\S]*?createScriptFromGamePlan\(\)[\s\S]*?mediaId: typeof getPlayMediaId/,
  "game-plan-to-script fallbacks preserve the canonical media ID",
);
assert.match(
  clips,
  /function candidateSigs\(play\)[\s\S]*?getPlayMediaId\(play\)[\s\S]*?return out;[\s\S]*?function sigForPlay\(play\)[\s\S]*?function hasForPlay\(play\)[\s\S]*?const sig = sigForPlay\(play\)/,
  "play-video runtime reads use the permanent media ID rather than historic display signatures",
);
assert.match(
  images,
  /async function pushRemote\(play, blob, options = \{\}\)[\s\S]*?await checkRemoteForPlay\(play, \{ fresh: true \}\);/,
  "explicit diagram uploads compare against the current cloud version before writing",
);
assert.match(
  gamePlan,
  /const playBySourceId = new Map\([\s\S]*?getStablePlaySourceId\(snap\)[\s\S]*?playBySourceId\.get\(sourceId\)[\s\S]*?copyPlayWithSourceIdentity\(fresh, preserved\)/,
  "Game Plan refreshes linked cards from their canonical source before legacy call matching",
);
assert.match(
  callSheet,
  /const bySourceId = new Map\([\s\S]*?getStablePlaySourceId\(snap\)[\s\S]*?bySourceId\.get\(sourceId\)[\s\S]*?copyPlayForCallSheet\(fresh, getLocalOverrides\(snap\)\)/,
  "Call Sheet refreshes linked cards from their canonical source while preserving cell-local display overrides",
);
assert.match(
  quizFoundation,
  /function renderQuizPage\(\)[\s\S]*?playerQuizHubOverlay[\s\S]*?_renderPlayerQuizHub\(\)/,
  "the Quiz page owns one shared player study configuration flow",
);
assert.match(
  quiz,
  /function _syncPlayerQuizPositionDefault\(\)[\s\S]*?_resolveQuizPositionKeysForMode\(_quizPositionMode\)/,
  "the Quiz page preserves the roster-derived quiz position default",
);
assert.match(
  quizFoundation,
  /function _getQuizRosterPlayerForCurrentUser\(/,
  "the Quiz page keeps roster identity as the source of its position default",
);
assert.match(
  quiz,
  /function openPlayerQuizHubWithMode\(modeKey = ""\)[\s\S]*?openPlayerQuizHub\(\);/,
  "Quiz shortcuts open the single shared quiz configuration flow",
);

console.log("script editor canonical media and leaderboard quiz launcher contracts passed");
