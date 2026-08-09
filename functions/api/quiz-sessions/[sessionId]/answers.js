/** POST /api/quiz-sessions/:sessionId/answers — record one immutable choice. */

import {
  answerAuthoritativeQuizSession,
  readAuthoritativeQuizPayload,
} from "../../../_lib/d1-authoritative-quiz.js";
import {
  authoritativeQuizFailure,
  authoritativeQuizRequestContext,
  authoritativeQuizSuccess,
} from "../../../_lib/authoritative-quiz-route.js";

export async function onRequestPost(context) {
  const ctx = await authoritativeQuizRequestContext(context.request, context.env);
  if (ctx.error) return ctx.error;
  try {
    const body = await readAuthoritativeQuizPayload(context.request);
    const payload = await answerAuthoritativeQuizSession(
      context.env.DB,
      ctx.teamId,
      ctx.session,
      String(context.params?.sessionId || ""),
      body,
    );
    return authoritativeQuizSuccess(payload);
  } catch (err) {
    return authoritativeQuizFailure("answer", err);
  }
}
