// Team-scoped discussion attachment key and validation helpers.
//
// An attachment ID alone is not an authorization boundary: IDs are exposed in
// thread responses so a user could otherwise ask R2 for another team's object.
// Every new object therefore lives below its team's namespace, while reads only
// accept a narrowly-defined legacy key after D1 has proved post ownership.

const PREFIX = "disc-attachments";
const EXTENSIONS = new Set(["jpg", "png", "webp"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function encodePathSegment(value) {
  // encodeURIComponent deliberately leaves dots untouched. Encode them too so
  // a malformed team ID can never resemble a path traversal segment in logs or
  // future key tooling. R2 keys are strings, but keeping every segment opaque
  // makes the namespace contract clear and portable.
  return encodeURIComponent(String(value || "").trim()).replace(/\./g, "%2E");
}

export function normalizeDiscussionAttachmentId(value) {
  const cleaned = String(value || "").trim().replace(/\.(?:jpg|png|webp)$/i, "");
  return UUID_PATTERN.test(cleaned) ? cleaned.toLowerCase() : "";
}

export function normalizeDiscussionAttachmentExtension(value) {
  const cleaned = String(value || "").trim().replace(/^\./, "").toLowerCase();
  return EXTENSIONS.has(cleaned) ? cleaned : "";
}

export function discussionAttachmentR2Key(teamId, attachmentId, extension) {
  const cleanTeamId = String(teamId || "").trim();
  const cleanId = normalizeDiscussionAttachmentId(attachmentId);
  const cleanExtension = normalizeDiscussionAttachmentExtension(extension);
  if (!cleanTeamId || !cleanId || !cleanExtension) return "";
  return `${PREFIX}/teams/${encodePathSegment(cleanTeamId)}/${cleanId}.${cleanExtension}`;
}

/**
 * True only for a current, team-scoped upload key. Use this before inserting a
 * post_attachments record so a caller cannot bind another team's object to a
 * post in their own team.
 */
export function isCanonicalDiscussionAttachmentKey(teamId, attachmentId, key) {
  const cleanKey = String(key || "").trim();
  const extension = normalizeDiscussionAttachmentExtension(cleanKey.split(".").pop());
  if (!extension) return false;
  return cleanKey === discussionAttachmentR2Key(teamId, attachmentId, extension);
}

/**
 * Resolve the exact R2 key that is safe to read for an already-authorized
 * attachment row. Legacy objects predate team namespacing, so they remain
 * readable only when the caller first passes the D1 post/team ownership join.
 */
export function resolveAuthorizedDiscussionAttachmentKey(teamId, attachmentId, storedKey) {
  const cleanKey = String(storedKey || "").trim();
  const cleanId = normalizeDiscussionAttachmentId(attachmentId);
  const extension = normalizeDiscussionAttachmentExtension(cleanKey.split(".").pop());
  if (!cleanId || !extension) return "";

  const canonical = discussionAttachmentR2Key(teamId, cleanId, extension);
  if (cleanKey === canonical) return canonical;

  // Pre-namespacing objects used this exact form. Do not generalize this
  // fallback (for example with a prefix lookup): that would reintroduce the
  // cross-team object enumeration this boundary is designed to prevent.
  const legacy = `${PREFIX}/${cleanId}.${extension}`;
  return cleanKey === legacy ? legacy : "";
}

export function isLegacyDiscussionAttachmentKey(attachmentId, storedKey) {
  const cleanKey = String(storedKey || "").trim();
  const cleanId = normalizeDiscussionAttachmentId(attachmentId);
  const extension = normalizeDiscussionAttachmentExtension(cleanKey.split(".").pop());
  if (!cleanId || !extension) return false;
  return cleanKey === `${PREFIX}/${cleanId}.${extension}`;
}
