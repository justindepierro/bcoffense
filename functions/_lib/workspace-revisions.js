// Immutable workspace/player-release revision data plane.
//
// This helper deliberately accepts already-serialized payloads. It neither
// decides which coach fields belong in a player release nor parses large JSON
// bodies. Its job is to give those bytes immutable, team-scoped R2 addresses
// and move the two D1 heads together with a workspace revision CAS.

export const WORKSPACE_REVISION_SCHEMA = "bcoffense.workspace-revision/v1";
export const WORKSPACE_REVISION_R2_ROOT = "media/teams";

const IDENTIFIER_MAX_LENGTH = 512;
const CONTENT_TYPE_MAX_LENGTH = 200;
const SHA256_HEX = /^[a-f0-9]{64}$/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

function requireDatabase(env) {
  const db = env?.DB;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new Error("Workspace revision database is not configured.");
  }
  return db;
}

function requireReadableBucket(bucket) {
  if (!bucket || typeof bucket.get !== "function") {
    throw new Error("Workspace revision R2 bucket is not configured.");
  }
  return bucket;
}

function requireWritableBucket(bucket) {
  requireReadableBucket(bucket);
  if (typeof bucket.head !== "function" || typeof bucket.put !== "function") {
    throw new Error("Workspace revision R2 bucket is not writable.");
  }
  return bucket;
}

function requireIdentifier(value, label, maxLength = IDENTIFIER_MAX_LENGTH) {
  const identifier = String(value == null ? "" : value).trim();
  if (!identifier) throw new Error(`A ${label} is required.`);
  if (identifier.length > maxLength) throw new Error(`${label} is too long.`);
  if (CONTROL_CHARACTER.test(identifier) || identifier.includes("/") || identifier.includes("\\")) {
    throw new Error(`${label} contains an unsafe path character.`);
  }
  if (identifier === "." || identifier === ".." || identifier.includes("..")) {
    throw new Error(`${label} is not a valid identifier.`);
  }
  return identifier;
}

export function requireWorkspaceTeamId(value) {
  return requireIdentifier(value, "team ID");
}

export function requireWorkspaceActorId(value) {
  return requireIdentifier(value, "actor ID");
}

export function requireWorkspaceRevision(value, label = "revision") {
  const revision = String(value == null ? "" : value).trim().toLowerCase();
  if (!SHA256_HEX.test(revision)) {
    throw new Error(`A ${label} must be a SHA-256 hexadecimal value.`);
  }
  return revision;
}

export function normalizeExpectedWorkspaceRevision(value) {
  const revision = String(value == null ? "" : value).trim();
  return revision ? requireWorkspaceRevision(revision, "expected workspace revision") : "";
}

function optionalActorId(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return requireWorkspaceActorId(value);
}

function cleanContentType(value) {
  const contentType = String(value || "application/json; charset=utf-8").trim();
  if (!contentType || contentType.length > CONTENT_TYPE_MAX_LENGTH || CONTROL_CHARACTER.test(contentType)) {
    throw new Error("A valid revision content type is required.");
  }
  return contentType;
}

function encodePathPart(value) {
  return encodeURIComponent(value);
}

export function workspaceRevisionR2Key(teamId, revision) {
  const cleanTeamId = requireWorkspaceTeamId(teamId);
  const cleanRevision = requireWorkspaceRevision(revision, "workspace revision");
  return `${WORKSPACE_REVISION_R2_ROOT}/${encodePathPart(cleanTeamId)}/workspace/${cleanRevision}.json`;
}

export function playerReleaseRevisionR2Key(teamId, revision) {
  const cleanTeamId = requireWorkspaceTeamId(teamId);
  const cleanRevision = requireWorkspaceRevision(revision, "player release revision");
  return `${WORKSPACE_REVISION_R2_ROOT}/${encodePathPart(cleanTeamId)}/player-release/${cleanRevision}.json`;
}

async function payloadArrayBuffer(value, label) {
  if (typeof value === "string") return new TextEncoder().encode(value).buffer;
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  if (value && typeof value.arrayBuffer === "function") return value.arrayBuffer();
  throw new Error(`${label} must be an already-serialized string, Blob, ArrayBuffer, or typed array.`);
}

function toHex(value) {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digestPayload(value, label) {
  const bytes = await payloadArrayBuffer(value, label);
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is required for immutable workspace revisions.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return {
    bytes,
    checksum: toHex(digest),
    digest,
    size: bytes.byteLength,
  };
}

export async function sha256Hex(value) {
  return (await digestPayload(value, "Revision payload")).checksum;
}

function normalizeRevisionRow(row, kind) {
  if (!row?.revision || !row?.r2_key) return null;
  return {
    teamId: String(row.team_id || "").trim(),
    revision: String(row.revision || "").trim(),
    r2Key: String(row.r2_key || "").trim(),
    checksum: String(row.checksum || "").trim(),
    size: Math.max(0, Number(row.size_bytes || 0)),
    contentType: String(row.content_type || "application/json; charset=utf-8"),
    createdAt: Number(row.created_at || 0),
    createdBy: row.created_by ? String(row.created_by) : "",
    kind,
  };
}

function normalizeCurrentPointer(row, kind) {
  if (!row?.workspace_revision || !row?.player_release_revision) return null;
  return {
    teamId: String(row.team_id || "").trim(),
    workspaceRevision: String(row.workspace_revision || "").trim(),
    playerReleaseRevision: String(row.player_release_revision || "").trim(),
    updatedAt: Number(row.updated_at || 0),
    updatedBy: row.updated_by ? String(row.updated_by) : "",
    kind,
    workspace: row.workspace_r2_key ? {
      r2Key: String(row.workspace_r2_key),
      checksum: String(row.workspace_checksum || ""),
      size: Math.max(0, Number(row.workspace_size_bytes || 0)),
      contentType: String(row.workspace_content_type || "application/json; charset=utf-8"),
    } : null,
    playerRelease: row.player_release_r2_key ? {
      r2Key: String(row.player_release_r2_key),
      checksum: String(row.player_release_checksum || ""),
      size: Math.max(0, Number(row.player_release_size_bytes || 0)),
      contentType: String(row.player_release_content_type || "application/json; charset=utf-8"),
    } : null,
  };
}

function currentPointerQuery(table) {
  return `
    SELECT
      current.team_id,
      current.workspace_revision,
      current.player_release_revision,
      current.updated_at,
      current.updated_by,
      workspace.r2_key AS workspace_r2_key,
      workspace.checksum AS workspace_checksum,
      workspace.size_bytes AS workspace_size_bytes,
      workspace.content_type AS workspace_content_type,
      player_release.r2_key AS player_release_r2_key,
      player_release.checksum AS player_release_checksum,
      player_release.size_bytes AS player_release_size_bytes,
      player_release.content_type AS player_release_content_type
    FROM ${table} AS current
    JOIN team_workspace_revisions AS workspace
      ON workspace.team_id = current.team_id
     AND workspace.revision = current.workspace_revision
    JOIN team_player_release_revisions AS player_release
      ON player_release.team_id = current.team_id
     AND player_release.revision = current.player_release_revision
    WHERE current.team_id = ?
    LIMIT 1
  `;
}

export async function readCurrentWorkspacePointer(env, teamId) {
  const db = requireDatabase(env);
  const cleanTeamId = requireWorkspaceTeamId(teamId);
  const row = await db.prepare(currentPointerQuery("team_workspace_current")).bind(cleanTeamId).first();
  return normalizeCurrentPointer(row, "workspace-current");
}

export async function readCurrentPlayerReleasePointer(env, teamId) {
  const db = requireDatabase(env);
  const cleanTeamId = requireWorkspaceTeamId(teamId);
  const row = await db.prepare(currentPointerQuery("team_player_release_current")).bind(cleanTeamId).first();
  return normalizeCurrentPointer(row, "player-release-current");
}

async function readRevision(env, bucket, teamId, revision, table, kind) {
  const db = requireDatabase(env);
  const readableBucket = requireReadableBucket(bucket);
  const cleanTeamId = requireWorkspaceTeamId(teamId);
  const cleanRevision = requireWorkspaceRevision(revision, `${kind} revision`);
  const row = await db.prepare(
    `SELECT team_id, revision, r2_key, checksum, size_bytes, content_type, created_at, created_by
       FROM ${table}
      WHERE team_id = ? AND revision = ?
      LIMIT 1`,
  ).bind(cleanTeamId, cleanRevision).first();
  const metadata = normalizeRevisionRow(row, kind);
  if (!metadata) return { metadata: null, payload: null };
  const payload = await readableBucket.get(metadata.r2Key);
  return { metadata, payload: payload || null };
}

export async function readWorkspaceRevision(env, bucket, teamId, revision) {
  return readRevision(env, bucket, teamId, revision, "team_workspace_revisions", "workspace");
}

export async function readPlayerReleaseRevision(env, bucket, teamId, revision) {
  return readRevision(env, bucket, teamId, revision, "team_player_release_revisions", "player-release");
}

export async function readCurrentWorkspaceRevision(env, bucket, teamId) {
  const pointer = await readCurrentWorkspacePointer(env, teamId);
  if (!pointer) return { pointer: null, metadata: null, payload: null };
  const result = await readWorkspaceRevision(env, bucket, pointer.teamId, pointer.workspaceRevision);
  return { pointer, ...result };
}

export async function readCurrentPlayerReleaseRevision(env, bucket, teamId) {
  const pointer = await readCurrentPlayerReleasePointer(env, teamId);
  if (!pointer) return { pointer: null, metadata: null, payload: null };
  const result = await readPlayerReleaseRevision(env, bucket, pointer.teamId, pointer.playerReleaseRevision);
  return { pointer, ...result };
}

function immutableObjectMetadata({ teamId, revision, checksum, kind }) {
  return {
    teamId,
    revision,
    checksum,
    kind,
    schema: WORKSPACE_REVISION_SCHEMA,
  };
}

async function writeImmutablePayload(bucket, descriptor) {
  const existing = await bucket.head(descriptor.r2Key);
  if (existing) {
    const existingChecksum = String(existing.customMetadata?.checksum || "").trim().toLowerCase();
    const existingSize = Number(existing.size || 0);
    if (existingChecksum !== descriptor.checksum || existingSize !== descriptor.size) {
      throw new Error(`Immutable ${descriptor.kind} revision key collision.`);
    }
    return { ...descriptor, written: false };
  }

  await bucket.put(descriptor.r2Key, descriptor.bytes, {
    httpMetadata: {
      contentType: descriptor.contentType,
      cacheControl: "private, no-store",
    },
    customMetadata: immutableObjectMetadata(descriptor),
    sha256: descriptor.digest,
  });
  return { ...descriptor, written: true };
}

function dbChanges(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function revisionDescriptor(kind, teamId, payload, contentType) {
  const keyForKind = kind === "workspace" ? workspaceRevisionR2Key : playerReleaseRevisionR2Key;
  return digestPayload(payload, `${kind === "workspace" ? "Workspace" : "Player release"} payload`)
    .then((digest) => ({
      ...digest,
      teamId,
      kind,
      revision: digest.checksum,
      checksum: digest.checksum,
      r2Key: keyForKind(teamId, digest.checksum),
      contentType: cleanContentType(contentType),
    }));
}

function insertWorkspaceRevisionStatement(db, descriptor, createdAt, actorId) {
  return db.prepare(
    "INSERT OR IGNORE INTO team_workspace_revisions (team_id, revision, r2_key, checksum, size_bytes, content_type, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    descriptor.teamId, descriptor.revision, descriptor.r2Key, descriptor.checksum,
    descriptor.size, descriptor.contentType, createdAt, actorId,
  );
}

function insertPlayerReleaseRevisionStatement(db, descriptor, createdAt, actorId) {
  return db.prepare(
    "INSERT OR IGNORE INTO team_player_release_revisions (team_id, revision, r2_key, checksum, size_bytes, content_type, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    descriptor.teamId, descriptor.revision, descriptor.r2Key, descriptor.checksum,
    descriptor.size, descriptor.contentType, createdAt, actorId,
  );
}

function insertCommitStatement(db, teamId, workspaceRevision, playerReleaseRevision, createdAt, actorId) {
  return db.prepare(
    "INSERT OR IGNORE INTO team_workspace_release_commits (team_id, workspace_revision, player_release_revision, created_at, created_by) VALUES (?, ?, ?, ?, ?)",
  ).bind(teamId, workspaceRevision, playerReleaseRevision, createdAt, actorId);
}

function currentPointerCasStatement(db, {
  teamId,
  expectedWorkspaceRevision,
  workspaceRevision,
  playerReleaseRevision,
  updatedAt,
  actorId,
}) {
  if (!expectedWorkspaceRevision) {
    return db.prepare(
      "INSERT INTO team_workspace_current (team_id, workspace_revision, player_release_revision, updated_at, updated_by) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM team_workspace_current WHERE team_id = ?)",
    ).bind(teamId, workspaceRevision, playerReleaseRevision, updatedAt, actorId, teamId);
  }
  return db.prepare(
    "UPDATE team_workspace_current SET workspace_revision = ?, player_release_revision = ?, updated_at = ?, updated_by = ? WHERE team_id = ? AND workspace_revision = ?",
  ).bind(
    workspaceRevision, playerReleaseRevision, updatedAt, actorId,
    teamId, expectedWorkspaceRevision,
  );
}

function publicDescriptor(descriptor) {
  return {
    revision: descriptor.revision,
    r2Key: descriptor.r2Key,
    checksum: descriptor.checksum,
    size: descriptor.size,
    contentType: descriptor.contentType,
    written: Boolean(descriptor.written),
  };
}

/**
 * Store a prepared workspace snapshot and its already-built player release.
 *
 * R2 receives immutable bytes before D1 is touched. The final D1 statement is
 * a compare-and-swap of the workspace head, and its triggers advance the
 * player-release head in that same D1 transaction. A failed CAS intentionally
 * leaves the newly written immutable R2 objects (and their D1 revision rows)
 * available for a later recovery decision.
 */
export async function commitWorkspaceAndPlayerRelease(env, bucket, input = {}) {
  const db = requireDatabase(env);
  const writableBucket = requireWritableBucket(bucket);
  const teamId = requireWorkspaceTeamId(input.teamId);
  const expectedWorkspaceRevision = normalizeExpectedWorkspaceRevision(input.expectedWorkspaceRevision);
  const actorId = optionalActorId(input.actorId);
  const updatedAt = Number.isFinite(Number(input.updatedAt))
    ? Math.max(0, Math.floor(Number(input.updatedAt)))
    : Math.floor(Date.now() / 1000);

  const [workspaceDraft, playerReleaseDraft] = await Promise.all([
    revisionDescriptor("workspace", teamId, input.workspacePayload, input.workspaceContentType),
    revisionDescriptor("player-release", teamId, input.playerReleasePayload, input.playerReleaseContentType),
  ]);

  // Never move either D1 head until both immutable objects have been made
  // durable. The order here is also intentionally visible to the contract test.
  const workspace = await writeImmutablePayload(writableBucket, workspaceDraft);
  const playerRelease = await writeImmutablePayload(writableBucket, playerReleaseDraft);

  const statements = [
    insertWorkspaceRevisionStatement(db, workspace, updatedAt, actorId),
    insertPlayerReleaseRevisionStatement(db, playerRelease, updatedAt, actorId),
    insertCommitStatement(db, teamId, workspace.revision, playerRelease.revision, updatedAt, actorId),
    currentPointerCasStatement(db, {
      teamId,
      expectedWorkspaceRevision,
      workspaceRevision: workspace.revision,
      playerReleaseRevision: playerRelease.revision,
      updatedAt,
      actorId,
    }),
  ];
  const results = await db.batch(statements);
  const committed = dbChanges(results?.[results.length - 1]) > 0;
  const result = {
    committed,
    conflict: !committed,
    expectedWorkspaceRevision,
    workspace: publicDescriptor(workspace),
    playerRelease: publicDescriptor(playerRelease),
  };
  if (committed) {
    return {
      ...result,
      current: {
        teamId,
        workspaceRevision: workspace.revision,
        playerReleaseRevision: playerRelease.revision,
        updatedAt,
        updatedBy: actorId || "",
      },
    };
  }

  // No retry, merge, or overwrite is attempted here. The caller gets the
  // winning pointer and can present a deliberate conflict/recovery flow.
  return { ...result, current: await readCurrentWorkspacePointer(env, teamId) };
}
