import {
  authJson,
  getSessionFromRequest,
} from "../_lib/auth.js";
import { buildPlayerRelease, serializePlayerRelease } from "../_lib/player-release.js";
import { resolveSessionTeamId } from "../_lib/team-context.js";
import { readTeamWorkspaceRecord, writeTeamWorkspace } from "../_lib/team-workspace.js";
import {
  commitWorkspaceAndPlayerRelease,
  readCurrentWorkspacePointer,
} from "../_lib/workspace-revisions.js";

const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

function getSyncStore(env) {
  return env && env.SYNC_KV;
}

function requireSyncStore(env) {
  const store = getSyncStore(env);
  if (!store) {
    throw new Error("Cloud sync storage is not configured.");
  }
  return store;
}

function summarizeBackup(backup) {
  const storageKeys = [
    "playbook",
    "savedScripts",
    "savedWristbands",
    "callSheet",
    "defensiveTendencies",
    "gameWeek",
    "gamePlanBoards",
    "gamePlanSnapshots",
  ];
  const itemCount = storageKeys.filter((key) =>
    Object.prototype.hasOwnProperty.call(backup, key),
  ).length;
  const imageCount =
    backup.playImages && typeof backup.playImages === "object"
      ? Object.keys(backup.playImages).length
      : 0;

  return {
    app: backup.app || "",
    version: backup.version || "",
    exportDate: backup.exportDate || "",
    itemCount,
    imageCount,
  };
}

function validateBackupForStorage(backup) {
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    return "Backup must be a JSON object.";
  }
  if (backup.app && backup.app !== "BCOffense") {
    return "Backup is not a BCOffense backup.";
  }
  if (backup.exportDate && Number.isNaN(new Date(backup.exportDate).getTime())) {
    return "Backup export date is invalid.";
  }
  if (backup.playImages) {
    if (typeof backup.playImages !== "object" || Array.isArray(backup.playImages)) {
      return "Backup play images must be an object.";
    }
    const invalidImage = Object.values(backup.playImages)
      .slice(0, 50)
      .find((value) => typeof value !== "string" || !value.startsWith("data:image/"));
    if (invalidImage) return "Backup includes an invalid play image.";
  }
  return "";
}

async function readBackup(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || session.role !== "admin") {
    return authJson(
      { ok: false, error: "Only admin can access raw cloud backups." },
      { status: 403 },
    );
  }
  const store = requireSyncStore(context.env);
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId) {
    return authJson(
      { ok: false, error: "Primary team access must be configured before recovering a workspace." },
      { status: 503 },
    );
  }
  const result = await readTeamWorkspaceRecord(store, context.env, teamId);
  if (!result || !result.value) {
    return authJson(
      { ok: false, error: "No cloud backup has been pushed yet." },
      { status: 404 },
    );
  }

  return authJson({
    ok: true,
    backup: result.value,
    updatedAt: result.metadata?.updatedAt || "",
    size: result.metadata?.size || 0,
    summary: result.metadata?.summary || summarizeBackup(result.value),
    legacyRecovery: Boolean(result.legacy),
  });
}

async function writeBackup(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || session.role !== "admin") {
    return authJson(
      { ok: false, error: "Only admin can push cloud backups." },
      { status: 403 },
    );
  }
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId) {
    return authJson(
      { ok: false, error: "Primary team access must be configured before publishing a workspace." },
      { status: 503 },
    );
  }

  const contentLength = Number(context.request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_BACKUP_BYTES) {
    return authJson(
      { ok: false, error: "Cloud backup is larger than the 25 MiB storage limit." },
      { status: 413 },
    );
  }

  const backupText = await context.request.text();
  const backupSize = new TextEncoder().encode(backupText).length;
  if (backupSize > MAX_BACKUP_BYTES) {
    return authJson(
      { ok: false, error: "Cloud backup is larger than the 25 MiB storage limit." },
      { status: 413 },
    );
  }

  let backup;
  try {
    backup = JSON.parse(backupText);
  } catch (_err) {
    return authJson(
      { ok: false, error: "Cloud backup must be valid JSON." },
      { status: 400 },
    );
  }

  const validationError = validateBackupForStorage(backup);
  if (validationError) {
    return authJson(
      { ok: false, error: validationError },
      { status: 400 },
    );
  }

  const updatedAt = new Date().toISOString();
  const summary = summarizeBackup(backup);
  // Raw backups are retained only for admin recovery, but a recovery write
  // must still use the same atomic D1/R2 head as normal coach saves. Build
  // and validate the narrow player release before either authoritative pointer
  // moves; KV is no longer a player-facing commit source.
  try {
    const current = await readCurrentWorkspacePointer(context.env, teamId);
    const release = await buildPlayerRelease(backup, { teamId, updatedAt, env: context.env });
    const releaseText = serializePlayerRelease(release).text;
    const committed = await commitWorkspaceAndPlayerRelease(context.env, context.env.CLIPS, {
      teamId,
      expectedWorkspaceRevision: current?.workspaceRevision || "",
      workspacePayload: backupText,
      playerReleasePayload: releaseText,
      actorId: session.d1UserId || null,
      workspaceContentType: "application/json; charset=utf-8",
      playerReleaseContentType: "application/json; charset=utf-8",
    });
    if (!committed.committed) {
      return authJson({
        ok: false,
        error: "The workspace changed during recovery. Refresh the recovery status before retrying.",
        current: committed.current || null,
      }, { status: 409 });
    }

    // Keep the raw JSON only as a separately labeled recovery snapshot. A
    // failure here cannot make the player release drift because the canonical
    // D1/R2 commit above has already completed atomically.
    const store = requireSyncStore(context.env);
    await writeTeamWorkspace(store, teamId, backupText, {
      updatedAt,
      size: backupSize,
      pushedBy: session.username,
      summary,
    });
    return authJson({
      ok: true,
      updatedAt,
      size: backupSize,
      summary,
      revision: committed.current.workspaceRevision,
      playerReleaseRevision: committed.current.playerReleaseRevision,
    });
  } catch (err) {
    return authJson({
      ok: false,
      error: err?.message || "The recovery workspace could not be committed safely.",
    }, { status: 502 });
  }
}

export async function onRequestGet(context) {
  return readBackup(context);
}

export async function onRequestHead(context) {
  const response = await readBackup(context);
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function onRequestPut(context) {
  return writeBackup(context);
}

export async function onRequestPost(context) {
  return writeBackup(context);
}
