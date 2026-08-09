/** POST /api/quiz-sessions/:sessionId/complete — atomically finalize one run. */

import {
  AuthoritativeQuizError,
  completeAuthoritativeQuizSession,
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
    // Completion accepts a deliberately empty JSON object. Reading it through
    // the same bounded parser keeps every write route on one finite body rule.
    const body = await readAuthoritativeQuizPayload(context.request);
    if (Object.keys(body).length) {
      throw new AuthoritativeQuizError("Completion request must be empty.", 400);
    }
    const payload = await completeAuthoritativeQuizSession(
      context.env.DB,
      ctx.teamId,
      ctx.session,
      String(context.params?.sessionId || ""),
    );
    return authoritativeQuizSuccess(payload);
  } catch (err) {
    return authoritativeQuizFailure("complete", err);
  }
}
