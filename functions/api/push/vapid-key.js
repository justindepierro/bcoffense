/**
 * GET /api/push/vapid-key
 * Returns the VAPID public key for client-side PushManager.subscribe().
 * Public endpoint — no auth required (public key is safe to expose).
 */

import { withSecurityHeaders, authJson } from "../../_lib/auth.js";

export async function onRequest(context) {
  const { env, request } = context;

  if (request.method !== "GET") {
    return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });
  }

  if (!env.VAPID_PUBLIC_KEY) {
    return authJson({ ok: false, error: "Push not configured." }, { status: 503 });
  }

  return withSecurityHeaders(
    authJson({ ok: true, publicKey: env.VAPID_PUBLIC_KEY }),
  );
}
