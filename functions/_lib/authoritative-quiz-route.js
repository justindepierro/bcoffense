/** Shared request boundary for server-authoritative quiz session routes. */

import { authJson, getSessionFromRequest, withSecurityHeaders } from "./auth.js";
import { getTeamId } from "./d1-threads.js";
import { AuthoritativeQuizError } from "./d1-authoritative-quiz.js";

export async function authoritativeQuizRequestContext(request, env, opts = {}) {
  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return { error: authJson({ ok: false, error: "Authentication required." }, { status: 401 }) };
  }
  if (session.role !== "player" || !session.d1UserId) {
    return {
      error: authJson(
        { ok: false, error: "A named player account is required for Verified Call Recognition." },
        { status: 403 },
      ),
    };
  }
  if (!env?.DB) return { error: authJson({ ok: false, error: "Database unavailable." }, { status: 503 }) };
  if (opts.requiresRelease && !env?.CLIPS) {
    return { error: authJson({ ok: false, error: "Verified quiz source storage is unavailable." }, { status: 503 }) };
  }
  const teamId = await getTeamId(env.DB, session);
  if (!teamId) {
    return { error: authJson({ ok: false, error: "Team access is not configured for this account." }, { status: 503 }) };
  }
  return { session, teamId };
}

export function authoritativeQuizSuccess(payload, status = 200) {
  return withSecurityHeaders(authJson({ ok: true, ...payload }, { status }));
}

export function authoritativeQuizFailure(route, err) {
  if (err instanceof AuthoritativeQuizError) {
    return withSecurityHeaders(authJson({ ok: false, error: err.message, code: err.code }, { status: err.status }));
  }
  console.error(JSON.stringify({ event: "authoritative_quiz_route_failed", route, message: String(err?.message || err) }));
  return withSecurityHeaders(authJson({ ok: false, error: "Verified quiz service is temporarily unavailable." }, { status: 503 }));
}
