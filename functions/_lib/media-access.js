// Role + release authorization shared by diagrams and clips.

import { getSessionFromRequest } from "./auth.js";
import { readStoredPlayerRelease, releaseAllowsClip, releaseAllowsDiagram } from "./player-release.js";
import { resolveSessionTeamId } from "./team-context.js";

export function isStaffSession(session) {
  return session?.role === "admin" || session?.role === "coach";
}

export async function getMediaPrincipal(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return { ok: false, status: 401, error: "Authentication required." };
  const teamId = await resolveSessionTeamId(session, env);
  if (!teamId) {
    return { ok: false, status: 503, error: "Team access is not configured for this account." };
  }

  if (isStaffSession(session)) return { ok: true, session, teamId, release: null };
  if (session.role !== "player") return { ok: false, status: 403, error: "Media access is not available for this role." };

  let release = null;
  try {
    release = await readStoredPlayerRelease(env, teamId);
  } catch (_err) {
    return { ok: false, status: 503, error: "Player media access is temporarily unavailable." };
  }
  return { ok: true, session, teamId, release };
}

export async function getMediaAccess(request, env, kind, identifier) {
  const principal = await getMediaPrincipal(request, env);
  if (!principal.ok || isStaffSession(principal.session)) return principal;
  const allowed = kind === "diagram"
    ? releaseAllowsDiagram(principal.release, identifier)
    : releaseAllowsClip(principal.release, identifier);
  // Deliberately use 404 for an unreleased identifier so a player cannot use
  // the endpoint to learn whether another asset exists.
  if (!allowed) return { ok: false, status: 404, error: "Media is not available in your current release." };
  return principal;
}

export async function getStaffWriteAccess(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!isStaffSession(session)) return { ok: false, status: 403, error: "Only coaches may change media." };
  const teamId = await resolveSessionTeamId(session, env);
  if (!teamId) return { ok: false, status: 503, error: "Team access is not configured for this account." };
  return { ok: true, session, teamId };
}
