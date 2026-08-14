// Shared cloud-canonical diagram manifest helpers.

const MANIFEST_PREFIX = "media:diagram:";
export const SAFE_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SHA256_HEX = /^[a-f0-9]{64}$/i;

export function normalizeImageContentType(value) {
  const type = String(value || "").split(";", 1)[0].trim().toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  return SAFE_IMAGE_CONTENT_TYPES.has(type) ? type : "";
}

export function detectImageContentType(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "";
}

export function validateImagePayload(value, declaredContentType = "") {
  const detectedContentType = detectImageContentType(value);
  const declared = normalizeImageContentType(declaredContentType);
  if (!detectedContentType) {
    return { ok: false, error: "Image bytes must be JPEG, PNG, or WebP." };
  }
  if (!declared) {
    return { ok: false, error: "Unsupported image type. Use JPEG, PNG, or WebP." };
  }
  if (declared !== detectedContentType) {
    return { ok: false, error: "Image content does not match its declared type." };
  }
  return { ok: true, contentType: detectedContentType };
}

export function imageManifestKey(teamId, mediaId) {
  return `${MANIFEST_PREFIX}${encodeURIComponent(String(teamId || "").trim())}:${encodeURIComponent(String(mediaId || "").trim())}`;
}

export function imageVersionedR2Key(teamId, mediaId, version) {
  return `media/teams/${encodeURIComponent(String(teamId || "").trim())}/plays/${encodeURIComponent(String(mediaId || "").trim())}/diagram/${version}`;
}

export function isCanonicalImageR2Key(teamId, mediaId, version, r2key) {
  return String(r2key || "") === imageVersionedR2Key(teamId, mediaId, version);
}

export function isTrustedImageManifest(teamId, mediaId, manifest) {
  const version = String(manifest?.version || "").trim();
  const r2key = String(manifest?.r2key || manifest?.r2_key || "").trim();
  const checksum = String(manifest?.checksum || "").trim();
  return Boolean(
    version &&
    SHA256_HEX.test(checksum) &&
    normalizeImageContentType(manifest?.contentType || manifest?.content_type) &&
    isCanonicalImageR2Key(teamId, mediaId, version, r2key),
  );
}

function toTrustedManifest(teamId, mediaId, row) {
  if (!isTrustedImageManifest(teamId, mediaId, row)) return null;
  return {
    version: String(row.version).trim(),
    r2key: String(row.r2key || row.r2_key).trim(),
    size: Number(row.size ?? row.size_bytes ?? 0) || 0,
    contentType: normalizeImageContentType(row.contentType || row.content_type),
    checksum: String(row.checksum).trim().toLowerCase(),
    uploadedAt: row.uploadedAt || row.uploaded_at || "",
    uploadedBy: row.uploadedBy || row.uploaded_by || "",
  };
}

export function legacyImageR2Key(mediaId) {
  return `images/${String(mediaId || "").trim()}`;
}

export async function readImageManifest(env, teamId, mediaId) {
  const db = env && env.DB;
  if (!db) throw new Error("Image manifest database is not configured.");
  const row = await db.prepare(
    "SELECT version, r2_key, size, content_type, checksum, uploaded_at, uploaded_by FROM team_media_manifests WHERE team_id = ? AND media_id = ? AND kind = 'diagram' LIMIT 1",
  ).bind(String(teamId || "").trim(), String(mediaId || "").trim()).first();
  return toTrustedManifest(teamId, mediaId, row);
}

export async function readImageManifests(env, teamId, mediaIds = []) {
  const db = env && env.DB;
  if (!db) return new Map();
  const ids = [...new Set((Array.isArray(mediaIds) ? mediaIds : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
  const manifests = new Map();
  // Keep well below D1/SQLite bind limits and avoid one round trip per play.
  for (let index = 0; index < ids.length; index += 80) {
    const batch = ids.slice(index, index + 80);
    const placeholders = batch.map(() => "?").join(",");
    const rows = await db.prepare(
      `SELECT media_id, version, r2_key, size, content_type, checksum, uploaded_at, uploaded_by
       FROM team_media_manifests
       WHERE team_id = ? AND kind = 'diagram' AND media_id IN (${placeholders})`,
    ).bind(String(teamId || "").trim(), ...batch).all();
    (rows?.results || []).forEach((row) => {
      const mediaId = String(row?.media_id || "").trim();
      const manifest = toTrustedManifest(teamId, mediaId, row);
      if (mediaId && manifest) manifests.set(mediaId, manifest);
    });
  }
  return manifests;
}

/**
 * Conditionally advance a diagram pointer.
 *
 * The R2 object is immutable and may already exist when this runs. The D1
 * comparison is the commit point: only the writer that observed the current
 * version may move the pointer. Returning `committed: false` preserves both
 * versions for recovery instead of silently letting a second coach overwrite
 * the first coach's diagram.
 */
export async function writeImageManifest(env, teamId, mediaId, manifest, opts = {}) {
  const db = env && env.DB;
  if (!db) throw new Error("Image manifest database is not configured.");
  const cleanTeamId = String(teamId || "").trim();
  const cleanMediaId = String(mediaId || "").trim();
  if (!isTrustedImageManifest(cleanTeamId, cleanMediaId, manifest)) {
    throw new Error("A checksum-verified canonical diagram manifest is required.");
  }
  const expectedVersion = String(opts.expectedVersion || "").trim();
  // A pre-release build could have copied legacy or malformed pointers into
  // the active table. Remove only an exact row we have proven untrusted, and
  // only its pointer; its R2 bytes remain recovery evidence. This makes the
  // first verified replacement self-healing without permitting a stale writer
  // to delete a newer valid manifest.
  const existing = await db.prepare(
    "SELECT version, r2_key, content_type, checksum FROM team_media_manifests WHERE team_id = ? AND media_id = ? AND kind = 'diagram' LIMIT 1",
  ).bind(cleanTeamId, cleanMediaId).first();
  if (existing && !isTrustedImageManifest(cleanTeamId, cleanMediaId, existing)) {
    await db.prepare(
      "DELETE FROM team_media_manifests WHERE team_id = ? AND media_id = ? AND kind = 'diagram' AND version = ? AND r2_key = ? AND checksum = ?",
    ).bind(
      cleanTeamId,
      cleanMediaId,
      String(existing.version || ""),
      String(existing.r2_key || ""),
      String(existing.checksum || ""),
    ).run();
  }
  const result = await db.prepare(
    "INSERT INTO team_media_manifests (team_id, media_id, kind, version, r2_key, size, content_type, checksum, uploaded_at, uploaded_by) VALUES (?, ?, 'diagram', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(team_id, media_id, kind) DO UPDATE SET version = excluded.version, r2_key = excluded.r2_key, size = excluded.size, content_type = excluded.content_type, checksum = excluded.checksum, uploaded_at = excluded.uploaded_at, uploaded_by = excluded.uploaded_by WHERE team_media_manifests.version = ?",
  ).bind(
    cleanTeamId, cleanMediaId, manifest.version, manifest.r2key, Number(manifest.size || 0),
    manifest.contentType, manifest.checksum, manifest.uploadedAt, manifest.uploadedBy, expectedVersion,
  ).run();
  const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
  return { committed: changes > 0, changes };
}

export async function deleteImageManifest(env, teamId, mediaId, opts = {}) {
  const db = env && env.DB;
  if (!db) throw new Error("Image manifest database is not configured.");
  const expectedVersion = String(opts.expectedVersion || "").trim();
  const result = await db.prepare(
    "DELETE FROM team_media_manifests WHERE team_id = ? AND media_id = ? AND kind = 'diagram' AND version = ?",
  ).bind(
    String(teamId || "").trim(),
    String(mediaId || "").trim(),
    expectedVersion,
  ).run();
  const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
  return { committed: changes > 0, changes };
}

export function publicImageManifest(mediaId, manifest, opts = {}) {
  if (!manifest) return { ok: true, sig: mediaId, published: false, available: false };
  // `published` means that a team-scoped D1 pointer exists. `available` is
  // intentionally separate: a pointer can survive an interrupted R2 restore
  // or an accidental object deletion, and clients must never mistake that for
  // a usable image file. `null` preserves an inconclusive storage check so a
  // transient R2 problem is not mislabeled as a missing binary.
  const available = Object.prototype.hasOwnProperty.call(opts, "available")
    ? opts.available
    : true;
  return {
    ok: true,
    sig: mediaId,
    published: true,
    available,
    version: manifest.version,
    size: Number(manifest.size || 0),
    contentType: manifest.contentType || "image/jpeg",
    checksum: manifest.checksum || "",
    uploadedAt: manifest.uploadedAt || "",
    uploadedBy: manifest.uploadedBy || "",
    legacy: Boolean(opts.legacy),
    idempotent: Boolean(opts.idempotent),
    recovered: Boolean(opts.recovered),
  };
}

// Manifest reads normally avoid fetching image bytes. A small R2 HEAD lets
// those reads distinguish a valid D1 pointer from a dangling one without
// exposing an unavailable diagram as player-ready. `null` means the storage
// check itself was inconclusive; callers should still attempt the authorized
// file read rather than fabricate a missing-file result.
export async function imageManifestAvailability(bucket, manifest) {
  if (!manifest?.r2key || !bucket?.head) return false;
  try {
    return Boolean(await bucket.head(manifest.r2key));
  } catch (_err) {
    return null;
  }
}

export async function resolveImageManifest(env, _bucket, teamId, mediaId) {
  const manifest = await readImageManifest(env, teamId, mediaId);
  if (manifest) return { manifest, legacy: false };
  // Legacy `images/<key>` objects are recovery evidence only. Runtime reads
  // must resolve exclusively through the D1 pointer for this exact media ID;
  // otherwise a stale or ambiguous key can display another play's diagram.
  return { manifest: null, legacy: false };
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
