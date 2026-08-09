/**
 * POST /api/leaderboard/awards
 *
 * Applies one coach/admin-owned reward or sticker mutation. This endpoint
 * never accepts player quiz attempts or a browser-owned leaderboard snapshot.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { hasCoachPermission } from "../../_lib/staff-access.js";
import {
  getLeaderboardSummary,
  getLeaderboardTeamId,
  mutateStaffLeaderboardRecord,
  readLeaderboardPayload,
} from "../../_lib/d1-leaderboard.js";

function isClientPayloadError(err) {
  return err instanceof TypeError || err instanceof RangeError || err instanceof SyntaxError;
}

function isTargetError(err) {
  return /active player target|active team player/i.test(String(err?.message || ""));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database unavailable." }, { status: 503 });
  if (!hasCoachPermission(session, "tab:leaderboard")) {
    return authJson({ ok: false, error: "Coach leaderboard access is required." }, { status: 403 });
  }

  try {
    const payload = await readLeaderboardPayload(request);
    if (Object.prototype.hasOwnProperty.call(payload, "attempts")) {
      throw new TypeError("Awards cannot include player quiz attempts.");
    }
    const teamId = await getLeaderboardTeamId(env.DB, session);
    if (!teamId) return authJson({ ok: false, error: "Team access is not configured for this account." }, { status: 503 });
    const result = await mutateStaffLeaderboardRecord(env.DB, teamId, session, payload);
    const summary = await getLeaderboardSummary(env.DB, teamId);
    return withSecurityHeaders(authJson({ ok: true, result, summary }));
  } catch (err) {
    if (isTargetError(err)) {
      return authJson({ ok: false, error: "That player is not an active member of this team." }, { status: 422 });
    }
    if (isClientPayloadError(err)) {
      return authJson({ ok: false, error: "Invalid leaderboard award." }, { status: 400 });
    }
    console.error("[POST /api/leaderboard/awards]", err);
    return authJson({ ok: false, error: "Server error." }, { status: 500 });
  }
}
