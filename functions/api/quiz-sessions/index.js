/** POST /api/quiz-sessions — start or resume Verified Call Recognition. */

import {
  readAuthoritativeQuizPayload,
  startAuthoritativeQuizSession,
} from "../../_lib/d1-authoritative-quiz.js";
import {
  authoritativeQuizFailure,
  authoritativeQuizRequestContext,
  authoritativeQuizSuccess,
} from "../../_lib/authoritative-quiz-route.js";

export async function onRequestPost(context) {
  const ctx = await authoritativeQuizRequestContext(context.request, context.env, { requiresRelease: true });
  if (ctx.error) return ctx.error;
  try {
    const body = await readAuthoritativeQuizPayload(context.request);
    const payload = await startAuthoritativeQuizSession(context.env, ctx.teamId, ctx.session, body);
    return authoritativeQuizSuccess(payload, payload.resumed ? 200 : 201);
  } catch (err) {
    return authoritativeQuizFailure("start", err);
  }
}
