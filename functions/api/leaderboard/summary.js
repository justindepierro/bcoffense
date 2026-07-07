/**
 * GET /api/leaderboard/summary
 *
 * Returns team-wide quiz leaderboard rows for the active week and season.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { getLeaderboardSummary, getLeaderboardTeamId } from "../../_lib/d1-leaderboard.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database unavailable." }, { status: 503 });

  try {
    const url = new URL(request.url);
    const teamId = await getLeaderboardTeamId(env.DB, session);
    const summary = await getLeaderboardSummary(env.DB, teamId, {
      weekKey: url.searchParams.get("weekKey") || "",
    });
    return withSecurityHeaders(authJson({ ok: true, summary }));
  } catch (err) {
    console.error("[GET /api/leaderboard/summary]", err);
    return authJson({ ok: false, error: "Server error." }, { status: 500 });
  }
}
