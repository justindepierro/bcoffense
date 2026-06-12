import {
  authJson,
  getSessionFromRequest,
} from "../_lib/auth.js";

const SYNC_BACKUP_KEY = "team-backup";
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
  const store = requireSyncStore(context.env);
  const result = await store.getWithMetadata(SYNC_BACKUP_KEY, {
    type: "json",
    cacheTtl: 60,
  });
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

  const store = requireSyncStore(context.env);
  const updatedAt = new Date().toISOString();
  const summary = summarizeBackup(backup);
  await store.put(SYNC_BACKUP_KEY, backupText, {
    metadata: {
      updatedAt,
      size: backupSize,
      pushedBy: session.username,
      summary,
    },
  });

  return authJson({
    ok: true,
    updatedAt,
    size: backupSize,
    summary,
  });
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
