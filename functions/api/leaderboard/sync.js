/**
 * POST /api/leaderboard/sync
 *
 * Syncs a signed-in D1 player's local quiz attempts into D1. Coach-owned
 * rewards and stickers use /api/leaderboard/awards instead.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import {
  getLeaderboardSummary,
  getLeaderboardTeamId,
  readLeaderboardPayload,
  syncLeaderboardPayload,
} from "../../_lib/d1-leaderboard.js";

function isClientPayloadError(err) {
  return err instanceof TypeError || err instanceof RangeError || err instanceof SyntaxError;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database unavailable." }, { status: 503 });
  if (session.role !== "player" || !session.d1UserId) {
    return authJson({ ok: false, error: "A signed-in player account is required." }, { status: 403 });
  }

  try {
    const payload = await readLeaderboardPayload(request);
    const teamId = await getLeaderboardTeamId(env.DB, session);
    if (!teamId) return authJson({ ok: false, error: "Team access is not configured for this account." }, { status: 503 });
    const synced = await syncLeaderboardPayload(env.DB, teamId, session, payload);
    const summary = await getLeaderboardSummary(env.DB, teamId, { weekKey: payload?.weekKey });
    return withSecurityHeaders(authJson({ ok: true, synced, summary }));
  } catch (err) {
    if (isClientPayloadError(err)) {
      return authJson({ ok: false, error: "Invalid leaderboard submission." }, { status: 400 });
    }
    console.error("[POST /api/leaderboard/sync]", err);
    return authJson({ ok: false, error: "Server error." }, { status: 500 });
  }
}
