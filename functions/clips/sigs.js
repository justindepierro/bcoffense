// functions/clips/sigs.js — List every play signature that currently has clips.
//   GET /clips/sigs  (any authed role)
// Lets the playbook render a 🎬 indicator without one request per row.

import { authJson } from "../_lib/auth.js";

export async function onRequestGet(context) {
  const store = context.env && context.env.SYNC_KV;
  if (!store) {
    return authJson({ ok: true, sigs: [] });
  }

  const prefix = "clips:";
  const sigs = [];
  let cursor;
  // KV list pages at up to 1000 keys; loop the cursor to capture them all.
  for (let guard = 0; guard < 50; guard += 1) {
    const page = await store.list({ prefix, cursor });
    for (const key of page.keys || []) {
      sigs.push(String(key.name).slice(prefix.length));
    }
    if (page.list_complete || !page.cursor) break;
    cursor = page.cursor;
  }

  return authJson({ ok: true, sigs });
}
