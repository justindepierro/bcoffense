import {
  commitWorkspaceAndPlayerRelease,
  normalizeExpectedWorkspaceRevision,
  playerReleaseRevisionR2Key,
  readCurrentWorkspaceRevision,
  requireWorkspaceRevision,
  sha256Hex,
  workspaceRevisionR2Key,
} from "../functions/_lib/workspace-revisions.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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

function fakeBucket(events, payloads = new Map()) {
  return {
    async head(key) {
      events.push(`head:${key}`);
      return payloads.get(key)?.head || null;
    },
    async put(key, value, options) {
      events.push(`put:${key}`);
      payloads.set(key, {
        value,
        head: {
          size: value.byteLength,
          customMetadata: options.customMetadata,
        },
      });
    },
    async get(key) {
      events.push(`get:${key}`);
      return payloads.get(key)?.payload || null;
    },
  };
}

function fakeDb({
  casChanges = 1,
  current = null,
  workspaceRevision = null,
  playerReleaseRevision = null,
  events = [],
} = {}) {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      return {
        sql,
        bind(...values) {
          return {
            sql,
            values,
            async first() {
              if (sql.includes("FROM team_workspace_current AS current")) return current;
              if (sql.includes("FROM team_workspace_revisions")) return workspaceRevision;
              if (sql.includes("FROM team_player_release_revisions")) return playerReleaseRevision;
              return null;
            },
          };
        },
      };
    },
    async batch(batchStatements) {
      events.push("batch");
      statements.push(...batchStatements);
      return batchStatements.map((_, index) => ({
        meta: { changes: index === batchStatements.length - 1 ? casChanges : 1 },
      }));
    },
  };
}

console.log("\n▸ Workspace revision data plane");

const helperSource = await readFile(
  fileURLToPath(new URL("../functions/_lib/workspace-revisions.js", import.meta.url)),
  "utf8",
);
assert(
  helperSource.indexOf("const workspace = await writeImmutablePayload")
    < helperSource.indexOf("const results = await db.batch(statements)"),
  "static contract keeps immutable R2 writes before the D1 CAS batch",
);
assert(
  helperSource.includes("WHERE team_id = ? AND workspace_revision = ?")
    && helperSource.includes("WHERE NOT EXISTS (SELECT 1 FROM team_workspace_current"),
  "static contract keeps both update and first-write workspace CAS predicates",
);

const workspaceHash = await sha256Hex('{"workspace":1}');
const releaseHash = await sha256Hex('{"release":1}');
assert(workspaceHash.length === 64 && workspaceHash !== releaseHash, "uses deterministic SHA-256 revisions");
assert(
  workspaceRevisionR2Key("team alpha", workspaceHash)
    === `media/teams/team%20alpha/workspace/${workspaceHash}.json`,
  "uses a team-namespaced immutable workspace key",
);
assert(
  playerReleaseRevisionR2Key("team alpha", releaseHash)
    === `media/teams/team%20alpha/player-release/${releaseHash}.json`,
  "uses a separate team-namespaced immutable player-release key",
);
assert(normalizeExpectedWorkspaceRevision("") === "", "supports an empty expected revision for the first commit");
assert(requireWorkspaceRevision(workspaceHash) === workspaceHash, "accepts a canonical SHA-256 revision");
try {
  workspaceRevisionR2Key("../other-team", workspaceHash);
  assert(false, "rejects unsafe team identifiers");
} catch (_err) {
  assert(true, "rejects unsafe team identifiers");
}
try {
  normalizeExpectedWorkspaceRevision("not-a-revision");
  assert(false, "rejects malformed expected revisions");
} catch (_err) {
  assert(true, "rejects malformed expected revisions");
}

const successEvents = [];
const successDb = fakeDb({ events: successEvents });
const successBucket = fakeBucket(successEvents);
const success = await commitWorkspaceAndPlayerRelease({ DB: successDb }, successBucket, {
  teamId: "team-1",
  expectedWorkspaceRevision: "",
  workspacePayload: '{"workspace":1}',
  playerReleasePayload: '{"release":1}',
  actorId: "coach-1",
  updatedAt: 123,
});
assert(success.committed && !success.conflict, "advances a first workspace head when no current head exists");
assert(successEvents.indexOf("batch") > successEvents.findIndex((event) => event.startsWith("put:")), "writes immutable R2 payloads before the D1 batch");
assert(successDb.statements.length === 4, "uses one D1 batch for revisions, commit record, and workspace CAS");
assert(
  successDb.statements.at(-1).sql.includes("WHERE NOT EXISTS (SELECT 1 FROM team_workspace_current"),
  "uses an insert-only CAS when the expected revision is empty",
);

const current = {
  team_id: "team-1",
  workspace_revision: "b".repeat(64),
  player_release_revision: "c".repeat(64),
  updated_at: 222,
  updated_by: "other-coach",
  workspace_r2_key: "media/teams/team-1/workspace/current.json",
  workspace_checksum: "b".repeat(64),
  workspace_size_bytes: 20,
  workspace_content_type: "application/json; charset=utf-8",
  player_release_r2_key: "media/teams/team-1/player-release/current.json",
  player_release_checksum: "c".repeat(64),
  player_release_size_bytes: 10,
  player_release_content_type: "application/json; charset=utf-8",
};
const conflictEvents = [];
const conflictDb = fakeDb({ casChanges: 0, current, events: conflictEvents });
const conflictBucket = fakeBucket(conflictEvents);
const conflict = await commitWorkspaceAndPlayerRelease({ DB: conflictDb }, conflictBucket, {
  teamId: "team-1",
  expectedWorkspaceRevision: "a".repeat(64),
  workspacePayload: '{"workspace":2}',
  playerReleasePayload: '{"release":2}',
  updatedAt: 456,
});
assert(!conflict.committed && conflict.conflict, "returns a conflict instead of overwriting a newer workspace head");
assert(conflict.current?.workspaceRevision === "b".repeat(64), "returns the winning current pointer on conflict");
assert(conflict.workspace.written && conflict.playerRelease.written, "retains immutable R2 recovery objects after a failed CAS");
assert(
  conflictDb.statements.at(-1).sql.includes("WHERE team_id = ? AND workspace_revision = ?"),
  "uses the expected workspace revision as the update CAS predicate",
);

const readEvents = [];
const readPayloads = new Map([[
  current.workspace_r2_key,
  { payload: { body: "raw workspace payload" } },
]]);
const readResult = await readCurrentWorkspaceRevision(
  {
    DB: fakeDb({
      current,
      events: readEvents,
      workspaceRevision: {
        team_id: "team-1",
        revision: current.workspace_revision,
        r2_key: current.workspace_r2_key,
        checksum: current.workspace_checksum,
        size_bytes: current.workspace_size_bytes,
        content_type: current.workspace_content_type,
        created_at: 111,
        created_by: "coach-1",
      },
    }),
  },
  fakeBucket(readEvents, readPayloads),
  "team-1",
);
assert(readResult.metadata?.r2Key === current.workspace_r2_key, "loads current workspace metadata from D1");
assert(readResult.payload?.body === "raw workspace payload", "returns raw R2 payloads without JSON parsing them");

if (failed) {
  console.error(`\n${failed} workspace revision contract assertion${failed === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n${passed} workspace revision contract assertions passed.`);
}
