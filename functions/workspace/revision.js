// Coach workspace data plane.
//
// This is the normal save path: a staff-safe workspace snapshot and the
// server-projected player release become immutable R2 revisions, then one D1
// compare-and-swap advances their shared team head. The raw recovery endpoint remains
// admin-only recovery tooling and is not used by this route.

import { authJson, getSessionFromRequest, withSecurityHeaders } from "../_lib/auth.js";
import { buildPlayerRelease, serializePlayerRelease } from "../_lib/player-release.js";
import { resolveSessionTeamId } from "../_lib/team-context.js";
import {
  commitWorkspaceAndPlayerRelease,
  readCurrentWorkspacePointer,
  readCurrentWorkspaceRevision,
  sha256Hex,
} from "../_lib/workspace-revisions.js";

const MAX_WORKSPACE_BYTES = 25 * 1024 * 1024;
const STAFF_ROLES = new Set(["admin", "coach", "assistant_coach"]);
// The endpoint is intentionally an allowlist, not a private-key denylist.
// A future browser-only key must be deliberately classified before it can ever
// become durable team data. Values are the portable storage keys emitted by
// storageManager.getAllData(), plus the backup envelope fields below.
const TEAM_WORKSPACE_KEYS = new Set([
  "app", "version", "exportDate",
  "playbook", "savedScripts", "savedWristbands", "wristbandTemplates",
  "sortPresets", "customSortOrders", "scriptCustomSortOrders", "periodTemplates",
  "scriptTemplates", "callSheet", "callSheetSettings", "columnVisibility",
  "playbookState", "scriptDisplayOptions", "scriptControlsMode", "playReadiness",
  "callsheetDisplayOptions", "callsheetDisplayPresets", "callsheetTemplates",
  "callsheetCategoryOrder", "callsheetNotes", "callsheetTargets", "callSheetSnapshots",
  "defensiveTendencies", "tendenciesSettings", "gameWeek", "installationData",
  "installationTemplates", "playCollections", "callSheetConstraints", "ob_playRatings",
  "schedule", "gamePlanTags", "printStudioSettings", "presentationSetup",
  "wristbandSortCriteria", "wristbandFavorites", "wristbandRecentPlays",
  "wristbandLogoCard", "teamRoster", "teamName", "teamPersonnelPackages",
  "teamSwapGroups", "teamAssignmentLabels", "teamSettingsCollapsed", "gamePlanBoards",
  "gamePlanSnapshots", "gamePlanTemplates", "callSheetPrintOptions", "motd",
  "playerPortalBranding", "playerQuizSettings", "playerQuizSourceSettings",
  "playerSignalGameSettings", "playerPublishStatus", "signals",
  "playerHelmetStickerTypes", "gameWeekArchive", "tendenciesReports",
]);

function isStaff(session) {
  return Boolean(session && STAFF_ROLES.has(session.role));
}

function workspaceError(message, status = 400, extra = {}) {
  return authJson({ ok: false, error: message, ...extra }, { status });
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function isoFromSeconds(value) {
  const seconds = Math.max(0, Number(value) || 0);
  return seconds ? new Date(seconds * 1000).toISOString() : "";
}

function summarizeWorkspace(workspace) {
  const keys = [
    "playbook", "savedScripts", "savedWristbands", "callSheet",
    "defensiveTendencies", "gameWeek", "gamePlanBoards", "gamePlanSnapshots",
  ];
  return {
    itemCount: keys.filter((key) => Object.prototype.hasOwnProperty.call(workspace, key)).length,
    playbookCount: Array.isArray(readJson(workspace.playbook, [])) ? readJson(workspace.playbook, []).length : 0,
    scriptCount: Array.isArray(readJson(workspace.savedScripts, [])) ? readJson(workspace.savedScripts, []).length : 0,
  };
}

function readJson(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;
  try { return JSON.parse(value); } catch (_err) { return fallback; }
}

function validateWorkspace(workspace) {
  if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
    return "Workspace must be a JSON object.";
  }
  if (workspace.app && workspace.app !== "BCOffense") {
    return "Workspace is not a BCOffense workspace.";
  }
  if (workspace.exportDate && Number.isNaN(new Date(workspace.exportDate).getTime())) {
    return "Workspace export date is invalid.";
  }
  const unknownKey = Object.keys(workspace).find((key) => !TEAM_WORKSPACE_KEYS.has(key));
  if (unknownKey) {
    return `Workspace contains a non-team field (${unknownKey}). Refresh this device and retry.`;
  }
  return "";
}

function requestExpectedRevision(request) {
  const explicit = request.headers.get("X-BC-Expected-Workspace-Revision");
  if (explicit !== null) return { supplied: true, value: explicit.trim().replace(/^"|"$/g, "") };
  const etag = request.headers.get("If-Match");
  if (etag !== null) return { supplied: true, value: etag.trim().replace(/^"|"$/g, "") };
  return { supplied: false, value: "" };
}

function pointerSummary(pointer) {
  if (!pointer) return null;
  return {
    workspaceRevision: pointer.workspaceRevision,
    playerReleaseRevision: pointer.playerReleaseRevision,
    updatedAt: isoFromSeconds(pointer.updatedAt),
  };
}

async function requireStaffContext(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!isStaff(session)) return { error: workspaceError("Coach access is required.", 403) };
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId) return { error: workspaceError("Team access is not configured for this account.", 503) };
  if (!context.env?.DB || !context.env?.CLIPS) {
    return { error: workspaceError("The canonical workspace store is not configured.", 503) };
  }
  return { session, teamId };
}

async function getWorkspace(context) {
  const principal = await requireStaffContext(context);
  if (principal.error) return principal.error;
  try {
    const current = await readCurrentWorkspaceRevision(context.env, context.env.CLIPS, principal.teamId);
    if (!current.pointer || !current.metadata || !current.payload) {
      return workspaceError("No canonical team workspace is available yet.", 404);
    }
    const text = await current.payload.text();
    if (await sha256Hex(text) !== String(current.metadata.checksum || "").toLowerCase()) {
      return workspaceError("The canonical workspace failed its integrity check.", 502);
    }
    let workspace = null;
    try { workspace = JSON.parse(text); } catch (_err) { /* handled below */ }
    const validationError = validateWorkspace(workspace);
    if (validationError) return workspaceError("The canonical workspace is invalid. Use admin recovery tools.", 502);
    const etag = `"${current.pointer.workspaceRevision}"`;
    if (context.request.headers.get("If-None-Match") === etag) {
      return withSecurityHeaders(new Response(null, {
        status: 304,
        headers: { "Cache-Control": "private, no-store", "ETag": etag, "Vary": "Cookie" },
      }));
    }
    return authJson({
      ok: true,
      workspace,
      revision: current.pointer.workspaceRevision,
      playerReleaseRevision: current.pointer.playerReleaseRevision,
      updatedAt: isoFromSeconds(current.pointer.updatedAt),
      size: current.metadata.size,
      summary: summarizeWorkspace(workspace),
    }, { headers: { "Cache-Control": "private, no-store", "ETag": etag, "Vary": "Cookie" } });
  } catch (_err) {
    return workspaceError("The canonical workspace could not be loaded.", 502);
  }
}

async function putWorkspace(context) {
  const principal = await requireStaffContext(context);
  if (principal.error) return principal.error;
  const contentLength = Number(context.request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_WORKSPACE_BYTES) return workspaceError("Workspace exceeds the 25 MiB delivery limit.", 413);
  const text = await context.request.text();
  if (!text || byteLength(text) > MAX_WORKSPACE_BYTES) return workspaceError("Workspace exceeds the 25 MiB delivery limit.", 413);

  let workspace = null;
  try { workspace = JSON.parse(text); } catch (_err) { return workspaceError("Workspace must be valid JSON."); }
  const validationError = validateWorkspace(workspace);
  if (validationError) return workspaceError(validationError);

  let current = null;
  try { current = await readCurrentWorkspacePointer(context.env, principal.teamId); } catch (_err) {
    return workspaceError("The current workspace revision could not be checked.", 502);
  }
  const expected = requestExpectedRevision(context.request);
  if (current && !expected.supplied) {
    return workspaceError("This device must refresh the current workspace before saving.", 428, { current: pointerSummary(current) });
  }
  if (current && expected.value !== current.workspaceRevision) {
    return workspaceError("This workspace changed on another device. Refresh before saving.", 409, { current: pointerSummary(current) });
  }
  if (!current && expected.value) {
    return workspaceError("This device has an outdated workspace revision. Refresh before saving.", 409, { current: null });
  }

  const updatedAt = new Date().toISOString();
  let release;
  let releaseText;
  try {
    release = await buildPlayerRelease(workspace, { teamId: principal.teamId, updatedAt, env: context.env });
    releaseText = serializePlayerRelease(release).text;
  } catch (err) {
    return workspaceError(err?.message || "The player release could not be prepared.", 422);
  }

  try {
    const committed = await commitWorkspaceAndPlayerRelease(context.env, context.env.CLIPS, {
      teamId: principal.teamId,
      expectedWorkspaceRevision: expected.value,
      workspacePayload: JSON.stringify(workspace),
      playerReleasePayload: releaseText,
      actorId: principal.session.d1UserId || null,
      workspaceContentType: "application/json; charset=utf-8",
      playerReleaseContentType: "application/json; charset=utf-8",
    });
    if (!committed.committed) {
      return workspaceError("This workspace changed on another device. Refresh before saving.", 409, {
        current: pointerSummary(committed.current),
      });
    }
    return authJson({
      ok: true,
      revision: committed.current.workspaceRevision,
      playerReleaseRevision: committed.current.playerReleaseRevision,
      updatedAt: isoFromSeconds(committed.current.updatedAt),
      size: committed.workspace.size,
      summary: summarizeWorkspace(workspace),
      release: {
        revision: release.release.revision,
        diagramCount: release.media?.diagramMediaIds?.length || 0,
        scriptCount: release.scripts?.length || 0,
      },
    }, { headers: {
      "Cache-Control": "private, no-store",
      "ETag": `"${committed.current.workspaceRevision}"`,
      "Vary": "Cookie",
    } });
  } catch (_err) {
    return workspaceError("Workspace bytes were not committed. Retry safely.", 502);
  }
}

export async function onRequestGet(context) {
  return getWorkspace(context);
}

export async function onRequestHead(context) {
  const response = await getWorkspace(context);
  return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
}

export async function onRequestPut(context) {
  return putWorkspace(context);
}
