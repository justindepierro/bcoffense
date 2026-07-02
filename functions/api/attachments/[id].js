/**
 * GET /api/attachments/[id]
 * Serve a discussion attachment image directly from R2.
 * Auth: any authenticated user on the team.
 *
 * The [id] param is the UUID portion only — the route strips the extension.
 * We try .jpg, .png, .webp in order.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";

const PREFIX = "disc-attachments";
const EXTS   = ["jpg", "png", "webp"];

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.CLIPS) {
    return new Response("Storage not configured", { status: 503 });
  }

  // Strip any extension from the id param
  const rawId = String(params.id || "").replace(/\.\w+$/, "").replace(/[^a-z0-9\-]/gi, "");
  if (!rawId) return new Response("Not found", { status: 404 });

  // Try each extension
  let obj = null;
  for (const ext of EXTS) {
    const key = `${PREFIX}/${rawId}.${ext}`;
    obj = await env.CLIPS.get(key);
    if (obj) break;
  }

  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type":  obj.httpMetadata?.contentType || "image/jpeg",
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  });

  return new Response(obj.body, { status: 200, headers });
}
