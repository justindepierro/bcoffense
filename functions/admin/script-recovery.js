// Admin-only saved-script recovery from immutable canonical workspace history.
//
// A recovery restores one script record into the current workspace and rebuilds
// the player release in the same CAS-backed commit. It never rolls the whole
// team back to an old snapshot.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import { buildPlayerRelease, serializePlayerRelease } from "../_lib/player-release.js";
import { resolveSessionTeamId } from "../_lib/team-context.js";
import {
  commitWorkspaceAndPlayerRelease,
  readCurrentWorkspaceRevision,
  readWorkspaceRevision,
} from "../_lib/workspace-revisions.js";
import { sanitizeTeamWorkspace } from "../workspace/revision.js";

const SEARCH_LIMIT = 100;
const REVISION_PATTERN = /^[a-f0-9]{64}$/i;

function parseStoredJson(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_err) {
    return fallback;
  }
}

function scriptRows(workspace) {
  return parseStoredJson(workspace?.savedScripts, []).filter((record) => record && typeof record === "object");
}

function scriptPlayCount(record) {
  return Array.isArray(record?.plays)
    ? record.plays.filter((play) => !play?.isSeparator).length
    : 0;
}

function scriptMatches(record, query) {
  const haystack = [record?.name, record?.date, record?.savedAt, record?.updatedAt]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function safeRecoveryCandidate(record, sourceRevision, createdAt, currentIds) {
  return {
    scriptId: String(record.id),
    sourceRevision,
    name: String(record.name || "Untitled script"),
    date: String(record.date || ""),
    savedAt: String(record.updatedAt || record.savedAt || ""),
    playCount: scriptPlayCount(record),
    alreadyInLibrary: currentIds.has(String(record.id)),
    historicalRevisionAt: Number(createdAt || 0),
  };
}

async function requireAdmin(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || session.role !== "admin") {
    return { error: authJson({ ok: false, error: "Only an admin can recover saved scripts." }, { status: 403 }) };
  }
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId || !context.env?.DB || !context.env?.CLIPS) {
    return { error: authJson({ ok: false, error: "Canonical workspace storage is not configured." }, { status: 503 }) };
  }
  return { session, teamId };
}

async function parseWorkspacePayload(payload) {
  if (!payload) return null;
  try { return JSON.parse(await payload.text()); } catch (_err) { return null; }
}

export async function onRequestGet(context) {
  const principal = await requireAdmin(context);
  if (principal.error) return principal.error;

  const query = String(new URL(context.request.url).searchParams.get("query") || "").trim().toLowerCase();
  if (query.length < 2) {
    return authJson({ ok: false, error: "Enter at least two characters to search cloud history." }, { status: 400 });
  }

  try {
    const current = await readCurrentWorkspaceRevision(context.env, context.env.CLIPS, principal.teamId);
    const currentWorkspace = await parseWorkspacePayload(current?.payload);
    const currentIds = new Set(
      scriptRows(currentWorkspace)
        .filter((record) => !record.deletedAt)
        .map((record) => String(record.id)),
    );
    const rows = await context.env.DB.prepare(
      "SELECT revision, created_at FROM team_workspace_revisions WHERE team_id = ? ORDER BY created_at DESC LIMIT ?",
    ).bind(principal.teamId, SEARCH_LIMIT).all();
    const candidatesById = new Map();

    for (const row of rows?.results || []) {
      const revision = String(row?.revision || "");
      if (!REVISION_PATTERN.test(revision) || revision === current?.pointer?.workspaceRevision) continue;
      const historical = await readWorkspaceRevision(context.env, context.env.CLIPS, principal.teamId, revision);
      const workspace = await parseWorkspacePayload(historical?.payload);
      scriptRows(workspace).forEach((record) => {
        if (record.deletedAt || !record.id || !scriptMatches(record, query)) return;
        const id = String(record.id);
        if (!candidatesById.has(id)) {
          candidatesById.set(id, safeRecoveryCandidate(record, revision, row.created_at, currentIds));
        }
      });
    }

    const candidates = [...candidatesById.values()]
      .sort((left, right) => Number(right.historicalRevisionAt) - Number(left.historicalRevisionAt));
    return authJson({ ok: true, candidates, scannedRevisions: (rows?.results || []).length }, {
      headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" },
    });
  } catch (err) {
    console.error("Script recovery history lookup failed", err);
    return authJson({ ok: false, error: "Cloud script history could not be searched." }, { status: 502 });
  }
}

export async function onRequestPost(context) {
  const principal = await requireAdmin(context);
  if (principal.error) return principal.error;

  let input = null;
  try { input = await context.request.json(); } catch (_err) { /* handled below */ }
  const sourceRevision = String(input?.sourceRevision || "").trim();
  const scriptId = String(input?.scriptId || "").trim();
  if (!REVISION_PATTERN.test(sourceRevision) || !scriptId || scriptId.length > 160) {
    return authJson({ ok: false, error: "The selected recovery record is invalid." }, { status: 400 });
  }

  try {
    const current = await readCurrentWorkspaceRevision(context.env, context.env.CLIPS, principal.teamId);
    if (!current?.pointer || !current?.payload) {
      return authJson({ ok: false, error: "No current team workspace is available." }, { status: 404 });
    }
    const rawCurrent = await parseWorkspacePayload(current.payload);
    const normalizedCurrent = sanitizeTeamWorkspace(rawCurrent);
    if (!normalizedCurrent.ok) {
      return authJson({ ok: false, error: "The current workspace needs admin recovery before script restore." }, { status: 502 });
    }
    const historical = await readWorkspaceRevision(context.env, context.env.CLIPS, principal.teamId, sourceRevision);
    const sourceWorkspace = await parseWorkspacePayload(historical?.payload);
    const sourceRecord = scriptRows(sourceWorkspace).find((record) => String(record.id) === scriptId && !record.deletedAt);
    if (!sourceRecord) {
      return authJson({ ok: false, error: "That script is no longer available in the selected cloud revision." }, { status: 404 });
    }

    const workspace = normalizedCurrent.workspace;
    const currentScripts = scriptRows(workspace);
    const existingIndex = currentScripts.findIndex((record) => String(record.id) === scriptId);
    if (existingIndex >= 0 && !currentScripts[existingIndex].deletedAt) {
      return authJson({ ok: true, alreadyPresent: true, script: safeRecoveryCandidate(sourceRecord, sourceRevision, 0, new Set([scriptId])) });
    }

    const restoredAt = new Date().toISOString();
    const restored = JSON.parse(JSON.stringify(sourceRecord));
    restored.deletedAt = "";
    restored.deletedBy = "";
    restored.updatedAt = restoredAt;
    if (existingIndex >= 0) currentScripts[existingIndex] = restored;
    else currentScripts.push(restored);
    workspace.savedScripts = typeof rawCurrent?.savedScripts === "string"
      ? JSON.stringify(currentScripts)
      : currentScripts;

    const release = await buildPlayerRelease(workspace, {
      teamId: principal.teamId,
      updatedAt: restoredAt,
      env: context.env,
    });
    const committed = await commitWorkspaceAndPlayerRelease(context.env, context.env.CLIPS, {
      teamId: principal.teamId,
      expectedWorkspaceRevision: current.pointer.workspaceRevision,
      workspacePayload: JSON.stringify(workspace),
      playerReleasePayload: serializePlayerRelease(release).text,
      actorId: principal.session.d1UserId || null,
      workspaceContentType: "application/json; charset=utf-8",
      playerReleaseContentType: "application/json; charset=utf-8",
    });
    if (!committed.committed) {
      return authJson({ ok: false, error: "The workspace changed while restoring. Search again and retry.", current: committed.current || null }, { status: 409 });
    }

    return authJson({
      ok: true,
      script: safeRecoveryCandidate(restored, sourceRevision, 0, new Set([scriptId])),
      workspaceRevision: committed.current.workspaceRevision,
      playerReleaseRevision: committed.current.playerReleaseRevision,
    }, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
  } catch (err) {
    console.error("Script recovery failed", err);
    return authJson({ ok: false, error: "The saved script could not be restored. Retry safely." }, { status: 502 });
  }
}
