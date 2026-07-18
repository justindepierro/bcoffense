// Shared cloud-canonical diagram manifest helpers.

const MANIFEST_PREFIX = "media:diagram:";

export function imageManifestKey(mediaId) {
  return `${MANIFEST_PREFIX}${encodeURIComponent(String(mediaId || "").trim())}`;
}

export function imageVersionedR2Key(mediaId, version) {
  return `media/plays/${encodeURIComponent(String(mediaId || "").trim())}/diagram/${version}`;
}

export function legacyImageR2Key(mediaId) {
  return `images/${String(mediaId || "").trim()}`;
}

export async function readImageManifest(env, mediaId) {
  const db = env && env.DB;
  if (!db) throw new Error("Image manifest database is not configured.");
  const row = await db.prepare(
    "SELECT version, r2_key, size, content_type, checksum, uploaded_at, uploaded_by FROM media_manifests WHERE media_id = ? AND kind = 'diagram' LIMIT 1",
  ).bind(String(mediaId || "").trim()).first();
  if (!row?.r2_key || !row?.version) return null;
  return {
    version: row.version,
    r2key: row.r2_key,
    size: Number(row.size || 0),
    contentType: row.content_type || "image/jpeg",
    checksum: row.checksum || "",
    uploadedAt: row.uploaded_at || "",
    uploadedBy: row.uploaded_by || "",
  };
}

export async function writeImageManifest(env, mediaId, manifest) {
  const db = env && env.DB;
  if (!db) throw new Error("Image manifest database is not configured.");
  await db.prepare(
    "INSERT INTO media_manifests (media_id, kind, version, r2_key, size, content_type, checksum, uploaded_at, uploaded_by) VALUES (?, 'diagram', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(media_id, kind) DO UPDATE SET version = excluded.version, r2_key = excluded.r2_key, size = excluded.size, content_type = excluded.content_type, checksum = excluded.checksum, uploaded_at = excluded.uploaded_at, uploaded_by = excluded.uploaded_by",
  ).bind(
    String(mediaId || "").trim(), manifest.version, manifest.r2key, Number(manifest.size || 0),
    manifest.contentType, manifest.checksum, manifest.uploadedAt, manifest.uploadedBy,
  ).run();
}

export async function deleteImageManifest(env, mediaId) {
  const db = env && env.DB;
  if (!db) throw new Error("Image manifest database is not configured.");
  await db.prepare("DELETE FROM media_manifests WHERE media_id = ? AND kind = 'diagram'")
    .bind(String(mediaId || "").trim()).run();
}

export function publicImageManifest(mediaId, manifest, opts = {}) {
  if (!manifest) return { ok: true, sig: mediaId, published: false };
  return {
    ok: true,
    sig: mediaId,
    published: true,
    version: manifest.version,
    size: Number(manifest.size || 0),
    contentType: manifest.contentType || "image/jpeg",
    checksum: manifest.checksum || "",
    uploadedAt: manifest.uploadedAt || "",
    uploadedBy: manifest.uploadedBy || "",
    legacy: Boolean(opts.legacy),
  };
}

export async function resolveImageManifest(env, bucket, mediaId) {
  const manifest = await readImageManifest(env, mediaId);
  if (manifest) return { manifest, legacy: false };
  const legacyObject = await bucket.head(legacyImageR2Key(mediaId));
  if (!legacyObject) return { manifest: null, legacy: false };
  return {
    legacy: true,
    manifest: {
      version: legacyObject.version || legacyObject.etag || "legacy",
      r2key: legacyImageR2Key(mediaId),
      size: legacyObject.size || 0,
      contentType: legacyObject.httpMetadata?.contentType || "image/jpeg",
      uploadedAt: legacyObject.uploaded ? new Date(legacyObject.uploaded).toISOString() : "",
      uploadedBy: "",
      checksum: "",
    },
  };
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
