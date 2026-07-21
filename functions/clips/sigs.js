// functions/clips/sigs.js — List every play signature that currently has clips.
//   GET /clips/sigs  (any authed role)
// Lets the playbook render a 🎬 indicator without one request per row.

import { authJson } from "../_lib/auth.js";
import { getMediaPrincipal } from "../_lib/media-access.js";
import { listTeamClipSigs } from "../_lib/team-workspace.js";

export async function onRequestGet(context) {
  const principal = await getMediaPrincipal(context.request, context.env);
  if (!principal.ok) return authJson({ ok: false, error: principal.error }, { status: principal.status });
  const store = context.env && context.env.SYNC_KV;
  if (!store) {
    return authJson({ ok: true, sigs: [] });
  }

  const sigs = await listTeamClipSigs(store, context.env, principal.teamId);
  if (principal.session?.role === "player") {
    // `release.media.clipSigs` is an authorization allow-list. It deliberately
    // contains every released play media ID so a coach can attach a video later
    // without rebuilding the entire release. Intersect it with the live
    // manifests here; otherwise every released diagram looks like a video.
    const allowed = new Set(Array.isArray(principal.release?.media?.clipSigs)
      ? principal.release.media.clipSigs
      : []);
    return authJson({ ok: true, sigs: sigs.filter((sig) => allowed.has(sig)) });
  }
  return authJson({ ok: true, sigs });
}
