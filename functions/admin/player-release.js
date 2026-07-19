// POST /admin/player-release — one-time migration and recovery release build.
//
// This is deliberately admin-only and is never called by a player request.
// Normal workspace writes rebuild the release automatically; this endpoint
// exists to bootstrap the first scoped release from retained recovery data
// after a safe rollout or to repair a missing release record.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import { buildPlayerRelease, serializePlayerRelease } from "../_lib/player-release.js";
import { resolveSessionTeamId } from "../_lib/team-context.js";
import { readTeamWorkspace } from "../_lib/team-workspace.js";
import {
  commitWorkspaceAndPlayerRelease,
  readCurrentWorkspaceRevision,
} from "../_lib/workspace-revisions.js";

export async function onRequestPost(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || session.role !== "admin") {
    return authJson({ ok: false, error: "Only admin can rebuild a player release." }, { status: 403 });
  }
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId || !context.env?.CLIPS || !context.env?.DB) {
    return authJson({ ok: false, error: "Canonical workspace storage is not configured." }, { status: 503 });
  }

  try {
    // Prefer the current immutable workspace. The raw KV snapshot is retained
    // only to bootstrap a first canonical revision during an explicit admin
    // recovery, never as the normal release source.
    const current = await readCurrentWorkspaceRevision(context.env, context.env.CLIPS, teamId);
    let workspace = null;
    let workspacePayload = "";
    let expectedWorkspaceRevision = "";
    if (current?.pointer && current?.payload) {
      workspacePayload = await current.payload.text();
      workspace = JSON.parse(workspacePayload);
      expectedWorkspaceRevision = current.pointer.workspaceRevision;
    } else if (context.env?.SYNC_KV) {
      workspace = await readTeamWorkspace(context.env.SYNC_KV, context.env, teamId);
      workspacePayload = workspace ? JSON.stringify(workspace) : "";
    }
    if (!workspace || typeof workspace !== "object") {
      return authJson({ ok: false, error: "No recoverable team workspace is available yet." }, { status: 404 });
    }
    const release = await buildPlayerRelease(workspace, {
      teamId,
      updatedAt: new Date().toISOString(),
      env: context.env,
    });
    const committed = await commitWorkspaceAndPlayerRelease(context.env, context.env.CLIPS, {
      teamId,
      expectedWorkspaceRevision,
      workspacePayload,
      playerReleasePayload: serializePlayerRelease(release).text,
      actorId: session.d1UserId || null,
      workspaceContentType: "application/json; charset=utf-8",
      playerReleaseContentType: "application/json; charset=utf-8",
    });
    if (!committed.committed) {
      return authJson({ ok: false, error: "The workspace changed while rebuilding the player release. Retry after refresh." }, { status: 409 });
    }
    return authJson({
      ok: true,
      release: {
        teamId: release.release.teamId,
        revision: release.release.revision,
        updatedAt: release.release.updatedAt,
        diagramCount: release.media?.diagramMediaIds?.length || 0,
        scriptCount: release.scripts?.length || 0,
      },
      workspaceRevision: committed.current.workspaceRevision,
      playerReleaseRevision: committed.current.playerReleaseRevision,
    });
  } catch (_err) {
    return authJson({ ok: false, error: "The player release could not be rebuilt." }, { status: 502 });
  }
}

export async function onRequestGet() {
  return authJson({ ok: false, error: "Use POST to rebuild a player release." }, { status: 405 });
}
