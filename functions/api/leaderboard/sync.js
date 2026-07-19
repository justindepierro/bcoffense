/**
 * POST /api/leaderboard/sync
 *
 * Syncs local quiz attempts, reward events, and helmet stickers into D1.
 * Returns the current team leaderboard summary after the upsert pass.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import {
  getLeaderboardSummary,
  getLeaderboardTeamId,
  syncLeaderboardPayload,
} from "../../_lib/d1-leaderboard.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database unavailable." }, { status: 503 });

  try {
    const payload = await request.json().catch(() => ({}));
    const teamId = await getLeaderboardTeamId(env.DB, session);
    if (!teamId) return authJson({ ok: false, error: "Team access is not configured for this account." }, { status: 503 });
    const synced = await syncLeaderboardPayload(env.DB, teamId, session, payload);
    const summary = await getLeaderboardSummary(env.DB, teamId, { weekKey: payload?.weekKey });
    return withSecurityHeaders(authJson({ ok: true, synced, summary }));
  } catch (err) {
    console.error("[POST /api/leaderboard/sync]", err);
    return authJson({ ok: false, error: "Server error." }, { status: 500 });
  }
}
