import {
  buildPlayerRelease,
  releaseAllowsClip,
  releaseAllowsDiagram,
} from "../functions/_lib/player-release.js";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${label}`);
  }
}

function play(overrides = {}) {
  return {
    id: "play-1",
    type: "Run",
    personnel: "10",
    formation: "Rip",
    play: "Georgia",
    mediaId: "play:visible",
    reps: 2,
    respQ: "Read the end",
    playerNotes: "Keep your eyes inside.",
    notes: "Coach-only install note",
    coachSecret: "never-release-this",
    ...overrides,
  };
}

const visiblePlay = play();
const hiddenSibling = play({
  id: "play-hidden",
  mediaId: "play:hidden",
  playerHidden: true,
  notes: "Hidden coach detail",
});
const scriptOnlyPlay = play({
  id: "play-script-only",
  mediaId: "play:script-only",
  formation: "Lex",
  play: "Smaug",
  personnel: "11",
  respQ: "Set the edge",
});

const backup = {
  app: "BCOffense",
  exportDate: "2026-07-18T12:00:00.000Z",
  playbook: JSON.stringify([visiblePlay, hiddenSibling]),
  savedScripts: JSON.stringify([
    {
      id: "script-visible",
      name: "Friday Fast",
      date: "2026-07-18",
      playerVisible: true,
      workspace: { coachOnly: true },
      plays: [
        { isSeparator: true, label: "Team", minutes: 10, color: "#123456", private: "no" },
        visiblePlay,
        scriptOnlyPlay,
        hiddenSibling,
      ],
    },
    {
      id: "script-hidden",
      playerVisible: false,
      plays: [visiblePlay],
    },
  ]),
  signals: JSON.stringify([
    {
      id: "formation:rip",
      category: "CORE",
      componentType: "formation",
      componentValue: "Rip",
      compareKey: "rip",
      clipKey: "signals/formation/rip",
      clipCount: 1,
      visibility: "published",
      notes: "Player-facing signal note",
      internalReview: "never-release-this",
    },
    {
      id: "formation:secret",
      category: "CORE",
      componentType: "formation",
      componentValue: "Secret",
      compareKey: "secret",
      clipKey: "signals/formation/secret",
      clipCount: 1,
      visibility: "draft",
    },
  ]),
  teamName: JSON.stringify("Burke Catholic Eagles"),
  motd: JSON.stringify("Bring energy."),
  playerPortalBranding: JSON.stringify({ accent: "#123456" }),
  playerQuizSettings: JSON.stringify({ weeklyGoal: 500 }),
  playerQuizSourceSettings: JSON.stringify({ script: { state: "available" } }),
  playerSignalGameSettings: JSON.stringify({ enabled: true }),
  playerPublishStatus: JSON.stringify({ diagrams: { updatedAt: "2026-07-18T12:00:00.000Z" } }),
  playerHelmetStickerTypes: JSON.stringify([{ key: "effort", label: "Effort" }]),
  callSheet: JSON.stringify({ secret: "coach-only" }),
  teamRoster: JSON.stringify([{ name: "Not for player release" }]),
  authSession: JSON.stringify({ user: { role: "admin" } }),
};

console.log("\n▸ Player release projection");
const release = await buildPlayerRelease(backup, {
  teamId: "team-1",
  updatedAt: "2026-07-18T12:00:00.000Z",
});
const repeat = await buildPlayerRelease(backup, {
  teamId: "team-1",
  updatedAt: "2026-07-18T12:00:00.000Z",
});

assert(release.schema === "bcoffense.player-release/v1", "uses the versioned player-release schema");
assert(release.release.teamId === "team-1", "pins the release to its server team");
assert(release.release.revision === repeat.release.revision, "same source produces a stable revision");
assert(release.scripts.length === 1, "excludes unpublished scripts");
assert(release.scripts[0].workspace === undefined, "does not carry script workspace state");
assert(release.scripts[0].plays.length === 3, "keeps separator plus only player-eligible plays");
assert(release.playbook.length === 2, "keeps visible playbook and released script-only play");
assert(!release.playbook.some((entry) => entry.mediaId === "play:hidden"), "removes hidden plays from player release");
assert(!JSON.stringify(release).includes("coach-only"), "does not leak coach-only backup fields");
assert(!JSON.stringify(release).includes("never-release-this"), "does not pass arbitrary record properties through");
assert(release.playbook[0].notes === undefined, "does not expose generic coach notes");
assert(releaseAllowsDiagram(release, "play:visible"), "allows an exact released diagram ID");
assert(!releaseAllowsDiagram(release, "play:hidden"), "rejects a hidden diagram ID");
assert(releaseAllowsClip(release, "play:script-only"), "allows canonical permanent play-video IDs");
assert(releaseAllowsClip(release, "signals/formation/rip"), "allows published signal clip IDs");
assert(!releaseAllowsClip(release, "signals/formation/secret"), "rejects draft signal clip IDs");
assert(!releaseAllowsClip(release, "Rip|Georgia|10|Run"), "does not allow an ambiguous legacy tag clip key");

if (failed) {
  console.error(`\n${failed} player-release contract assertion${failed === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n${passed} player-release contract assertions passed.`);
}

