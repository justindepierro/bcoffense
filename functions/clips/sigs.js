// functions/clips/sigs.js — List every play signature that currently has clips.
//   GET /clips/sigs  (any authed role)
// Lets the playbook render a 🎬 indicator without one request per row.

import { authJson } from "../_lib/auth.js";
import { getMediaPrincipal } from "../_lib/media-access.js";
import { listTeamClipSigs } from "../_lib/team-workspace.js";

export async function onRequestGet(context) {
  const principal = await getMediaPrincipal(context.request, context.env);
  if (!principal.ok) return authJson({ ok: false, error: principal.error }, { status: principal.status });
  if (principal.session?.role === "player") {
    return authJson({ ok: true, sigs: Array.isArray(principal.release?.media?.clipSigs) ? principal.release.media.clipSigs : [] });
  }
  const store = context.env && context.env.SYNC_KV;
  if (!store) {
    return authJson({ ok: true, sigs: [] });
  }

  const sigs = await listTeamClipSigs(store, context.env, principal.teamId);
  return authJson({ ok: true, sigs });
}
