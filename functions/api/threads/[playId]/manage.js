/**
 * POST /api/threads/:playId/manage
 * Thread-level controls: lock, unlock.
 * Body: { action: "lock" | "unlock" }
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../../_lib/auth.js";
import { getTeamId, setThreadLock } from "../../../_lib/d1-threads.js";

export async function onRequestPost(context) {
  const { request, env, params } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const isStaff = session.role === "coach" || session.role === "admin";
  if (!isStaff) return authJson({ ok: false, error: "Coaches only." }, { status: 403 });

  const playId = decodeURIComponent(String(params.playId || "")).trim();
  if (!playId) return authJson({ ok: false, error: "Play ID required." }, { status: 400 });

  let body = {};
  try {
    const ct = request.headers.get("Content-Type") || "";
    body = ct.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
  } catch (_) {
    return authJson({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const action = String(body.action || "").trim();
  if (action !== "lock" && action !== "unlock") {
    return authJson({ ok: false, error: "action must be 'lock' or 'unlock'." }, { status: 422 });
  }

  const teamId = await getTeamId(env.DB, session);
  if (!teamId) return authJson({ ok: false, error: "Team access is not configured for this account." }, { status: 503 });
  const result = await setThreadLock(env.DB, teamId, playId, action === "lock", session);
  if (result.error) return authJson({ ok: false, error: result.error }, { status: 403 });

  return withSecurityHeaders(authJson({ ok: true, locked: result.locked }));
}
