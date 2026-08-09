/**
 * POST /api/notifications/broadcast
 *
 * Staff-only bridge from local/cloud publish actions to D1 player alerts.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { getTeamId } from "../../_lib/d1-threads.js";
import { notifyTeamPlayers } from "../../_lib/d1-notifications.js";
import { RequestBodyError, readBoundedJsonObject } from "../../_lib/request-body.js";

const STAFF_ROLES = new Set(["admin", "coach", "assistant", "assistant_coach"]);
const ALLOWED_TYPES = new Set([
  "team_update",
  "script_published",
  "new_quiz",
  "media_update",
  "team_announcement",
]);
const MAX_BROADCAST_BODY_BYTES = 8 * 1024;
const MAX_NOTIFICATION_TITLE_LENGTH = 160;
const MAX_NOTIFICATION_BODY_LENGTH = 240;
const MAX_NOTIFICATION_DEEP_LINK_LENGTH = 512;
const MAX_NOTIFICATION_TAG_LENGTH = 160;

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null) return { value: "" };
  if (typeof value !== "string") return { error: `${label} must be text.` };
  const text = value.trim();
  if (text.length > maxLength) return { error: `${label} is too long.` };
  return { value: text };
}

function notificationBodyError(error) {
  if (error instanceof RequestBodyError && error.status === 413) {
    return authJson({ ok: false, error: "Notification request is too large." }, { status: 413 });
  }
  return authJson({ ok: false, error: "Invalid JSON." }, { status: 400 });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!STAFF_ROLES.has(session.role)) {
    return authJson({ ok: false, error: "Coach access required." }, { status: 403 });
  }
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  let body;
  try {
    body = await readBoundedJsonObject(request, { maxBytes: MAX_BROADCAST_BODY_BYTES });
  } catch (error) {
    return notificationBodyError(error);
  }

  const type = optionalText(body.type, "Notification type", 48);
  const title = optionalText(body.title, "Title", MAX_NOTIFICATION_TITLE_LENGTH);
  const message = optionalText(body.body, "Notification body", MAX_NOTIFICATION_BODY_LENGTH);
  const deepLink = optionalText(body.deepLink, "Notification deep link", MAX_NOTIFICATION_DEEP_LINK_LENGTH);
  const tag = optionalText(body.tag, "Notification tag", MAX_NOTIFICATION_TAG_LENGTH);
  const invalidField = [type, title, message, deepLink, tag].find((field) => field.error);
  if (invalidField?.error) return authJson({ ok: false, error: invalidField.error }, { status: 422 });

  if (!ALLOWED_TYPES.has(type.value)) return authJson({ ok: false, error: "Unsupported notification type." }, { status: 422 });
  if (!title.value) return authJson({ ok: false, error: "Title required." }, { status: 422 });

  try {
    const teamId = await getTeamId(env.DB, session);
    if (!teamId) return authJson({ ok: false, error: "Team access is not configured for this account." }, { status: 503 });
    const result = await notifyTeamPlayers(env.DB, teamId, {
      type: type.value,
      title: title.value,
      body: message.value,
      deepLink: deepLink.value,
      tag: tag.value,
    }, env);
    return withSecurityHeaders(authJson({ ok: true, ...result }));
  } catch (err) {
    console.error("[POST /api/notifications/broadcast]", err);
    return authJson({ ok: false, error: "Could not send notifications." }, { status: 500 });
  }
}
