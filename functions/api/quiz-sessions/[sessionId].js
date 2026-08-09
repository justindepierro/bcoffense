/** GET /api/quiz-sessions/:sessionId — resume a verified quiz session. */

import { getAuthoritativeQuizSession } from "../../_lib/d1-authoritative-quiz.js";
import {
  authoritativeQuizFailure,
  authoritativeQuizRequestContext,
  authoritativeQuizSuccess,
} from "../../_lib/authoritative-quiz-route.js";

export async function onRequestGet(context) {
  const ctx = await authoritativeQuizRequestContext(context.request, context.env);
  if (ctx.error) return ctx.error;
  try {
    const payload = await getAuthoritativeQuizSession(
      context.env.DB,
      ctx.teamId,
      ctx.session,
      String(context.params?.sessionId || ""),
    );
    return authoritativeQuizSuccess(payload);
  } catch (err) {
    return authoritativeQuizFailure("get", err);
  }
}
