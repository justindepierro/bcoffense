// GET /player/release — small, sanitized player-only data plane.

import { authJson, getSessionFromRequest, withSecurityHeaders } from "../_lib/auth.js";
import {
  PLAYER_RELEASE_SCHEMA,
  readStoredPlayerRelease,
} from "../_lib/player-release.js";
import { resolveSessionTeamId } from "../_lib/team-context.js";

function etagFor(release) {
  return `\"${String(release?.release?.revision || "")}\"`;
}

function playerReleaseHeaders(release) {
  return {
    "Cache-Control": "private, no-store",
    "Vary": "Cookie",
    "ETag": etagFor(release),
    "X-BC-Player-Release": PLAYER_RELEASE_SCHEMA,
  };
}

async function loadRelease(env, teamId) {
  // A player GET is a read-only operation. It must never become an implicit
  // publishing path that races with a coach update or makes player readiness
  // depend on a mutable recovery snapshot. Admin recovery tooling builds the
  // first release during migration; normal workspace commits rebuild it.
  return readStoredPlayerRelease(env, teamId);
}

export async function onRequestGet(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || session.role !== "player") {
    return authJson({ ok: false, error: "Player access is required." }, { status: 403 });
  }
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId) {
    return authJson({ ok: false, error: "Your team access is not configured yet." }, { status: 503 });
  }

  try {
    const release = await loadRelease(context.env, teamId);
    if (!release) {
      return authJson({ ok: false, error: "No player release is available yet." }, { status: 404 });
    }
    const etag = etagFor(release);
    if (context.request.headers.get("If-None-Match") === etag) {
      return withSecurityHeaders(new Response(null, {
        status: 304,
        headers: playerReleaseHeaders(release),
      }));
    }
    return authJson({ ok: true, release }, { headers: playerReleaseHeaders(release) });
  } catch (_err) {
    return authJson({ ok: false, error: "Player release could not be loaded." }, { status: 502 });
  }
}
