// Server-side player release projection.
//
// The legacy `team-backup` object is deliberately broad because it was built
// as a browser recovery snapshot. Players must never receive that object. This
// module creates a narrow, explicit allow-list projection that is safe to keep
// on a player device and to use as the authority for media access.

import { readImageManifests } from "./image-media.js";
import { readCurrentPlayerReleaseRevision } from "./workspace-revisions.js";

export const PLAYER_RELEASE_SCHEMA = "bcoffense.player-release/v1";

const MAX_SCRIPTS = 200;
const MAX_PLAYS = 5000;
const MAX_SIGNALS = 2000;
const MAX_PLAY_FIELD_CHARS = 4000;
const MAX_RELEASE_SETTING_DEPTH = 8;
const MAX_RELEASE_SETTING_KEYS = 500;
const MAX_RELEASE_SETTING_ARRAY_ITEMS = 1000;
export const MAX_PLAYER_RELEASE_BYTES = 8 * 1024 * 1024;

const PLAY_FIELDS = [
  "id",
  "playbookId",
  "sourcePlayId",
  "originalPlayId",
  "mediaId",
  "sourceIdentityKey",
  "sourceGamePlanKey",
  "type",
  "personnel",
  "formation",
  "formTag1",
  "formTag2",
  "under",
  "back",
  "shift",
  "motion",
  "protection",
  "lineCall",
  "play",
  "playTag1",
  "playTag2",
  "basePlay",
  "oneWord",
  "preferredSituation",
  "preferredDown",
  "preferredDistance",
  "preferredHash",
  "preferredFieldPosition",
  "tempo",
  "practiceFront",
  "practiceDefense",
  "practiceCoverage",
  "practiceBlitz",
  "practiceStunt",
  "keyPlayer1",
  "keyPlayer2",
  "keyPlayer3",
  "keyPlayerName1",
  "keyPlayerName2",
  "keyPlayerName3",
  "constraint1",
  "constraint2",
  "constraint3",
  "hitChart1",
  "hitChart2",
  "hitChart3",
  "deadVs",
  "opponent",
  "reps",
  "respNotes",
  "playerNotes",
  "respQ",
  "respT",
  "respH",
  "respZ",
  "respX",
  "respY",
  "respLT",
  "respLG",
  "respC",
  "respRG",
  "respRT",
];

const RELEASE_VALUE_KEYS = [
  "teamName",
  "motd",
  "playerPortalBranding",
  "playerQuizSettings",
  "playerQuizSourceSettings",
  "playerSignalGameSettings",
  "playerPublishStatus",
  "playerHelmetStickerTypes",
];

function cleanString(value, max = 10000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function asObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readBackupValue(backup, key, fallback) {
  const value = backup && Object.prototype.hasOwnProperty.call(backup, key)
    ? backup[key]
    : undefined;
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return fallback;
  }
}

function isPlayerVisible(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function isHiddenFromPlayers(play) {
  return play?.playerHidden === true || play?.playerHidden === 1 ||
    play?.playerHidden === "true" || play?.hiddenFromPlayers === true ||
    play?.hiddenFromPlayers === 1 || play?.hiddenFromPlayers === "true";
}

function stablePlaySourceId(play) {
  return [play?.playbookId, play?.sourcePlayId, play?.originalPlayId, play?.id]
    .map((value) => cleanString(value, 512))
    .find(Boolean) || "";
}

function mediaIdForPlay(play) {
  const current = cleanString(play?.mediaId, 512);
  if (current) return current;
  const sourceId = stablePlaySourceId(play);
  return sourceId ? `play:${sourceId}` : "";
}

function projectSeparator(play) {
  return {
    isSeparator: true,
    id: cleanString(play?.id, 512),
    label: cleanString(play?.label, 240),
    minutes: Number.isFinite(Number(play?.minutes)) ? Number(play.minutes) : 0,
    color: cleanString(play?.color, 64),
  };
}

export function projectPlayerPlay(play, opts = {}) {
  const source = asObject(play, null);
  if (!source || isHiddenFromPlayers(source)) return null;
  if (source.isSeparator) return projectSeparator(source);

  const projected = {};
  PLAY_FIELDS.forEach((field) => {
    const value = source[field];
    if (typeof value === "string") projected[field] = cleanString(value, MAX_PLAY_FIELD_CHARS);
    else if (typeof value === "number" && Number.isFinite(value)) projected[field] = value;
    else if (typeof value === "boolean") projected[field] = value;
  });
  const mediaId = cleanString(opts.mediaId || mediaIdForPlay(source), 512);
  if (mediaId) projected.mediaId = mediaId;
  return projected;
}

function projectScript(record, index, resolveMediaId) {
  const source = asObject(record, {});
  if (!isPlayerVisible(source.playerVisible)) return null;
  const plays = asArray(source.plays)
    .map((play) => projectPlayerPlay(play, {
      mediaId: typeof resolveMediaId === "function" ? resolveMediaId(play) : "",
    }))
    .filter(Boolean);
  if (!plays.some((play) => !play.isSeparator)) return null;
  return {
    id: cleanString(source.id || `released-script-${index + 1}`, 512),
    name: cleanString(source.name || `Published Practice ${index + 1}`, 240),
    date: cleanString(source.date, 64),
    period: cleanString(source.period, 160),
    tempo: cleanString(source.tempo, 160),
    playerVisible: true,
    plays,
    savedAt: cleanString(source.savedAt, 64),
    playerPublishedAt: cleanString(source.playerPublishedAt || source.savedAt, 64),
  };
}

function projectSignal(record) {
  const source = asObject(record, null);
  if (!source || cleanString(source.visibility || "published", 32) === "draft") return null;
  const componentType = cleanString(source.componentType, 80);
  const compareKey = cleanString(source.compareKey, 240);
  if (!componentType || !compareKey) return null;
  const clipKey = cleanString(source.clipKey || `signals/${componentType}/${compareKey}`, 400);
  if (!clipKey.startsWith("signals/")) return null;
  return {
    id: cleanString(source.id || `${componentType}:${compareKey}`, 400),
    category: cleanString(source.category, 80),
    componentType,
    componentValue: cleanString(source.componentValue, 240),
    compareKey,
    clipKey,
    durationMs: Math.max(0, Number(source.durationMs) || 0),
    clipCount: Math.max(0, Number(source.clipCount) || 0),
    visibility: "published",
    updatedAt: cleanString(source.updatedAt, 64),
    // A published signal note is intentionally part of the player signal card.
    notes: cleanString(source.notes, 2000),
  };
}

function legacyClipSig(play) {
  return [play?.formation, play?.play, play?.personnel, play?.type]
    .map((value) => String(value == null ? "" : value).trim())
    .join("|");
}

function dedupePlays(plays) {
  const seen = new Set();
  const out = [];
  plays.forEach((play) => {
    if (!play || play.isSeparator) return;
    const key = play.mediaId || stablePlaySourceId(play) || JSON.stringify(play);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(play);
  });
  return out.slice(0, MAX_PLAYS);
}

function sourceReferenceCandidates(play) {
  return [play?.playbookId, play?.sourcePlayId, play?.originalPlayId, play?.id]
    .map((value) => cleanString(value, 512))
    .filter(Boolean);
}

function buildCanonicalMediaResolver(sourcePlaybook) {
  const mediaOwners = new Map();
  const sourceToMedia = new Map();
  asArray(sourcePlaybook).forEach((play) => {
    if (!play || play.isSeparator || isHiddenFromPlayers(play)) return;
    const mediaId = mediaIdForPlay(play);
    const stableSource = stablePlaySourceId(play) || cleanString(play?.id, 512);
    if (!mediaId || !stableSource) {
      throw new Error("Every player-visible source play needs a permanent media ID.");
    }
    const owner = mediaOwners.get(mediaId);
    if (owner && owner !== stableSource) {
      throw new Error("Two source plays share a media ID. Refresh the playbook so their permanent media IDs can be repaired before saving.");
    }
    mediaOwners.set(mediaId, stableSource);
    sourceReferenceCandidates(play).forEach((reference) => {
      const existing = sourceToMedia.get(reference);
      if (existing && existing !== mediaId) {
        throw new Error("Two source plays share a source reference. Repair the imported playbook before saving.");
      }
      sourceToMedia.set(reference, mediaId);
    });
  });
  return (play) => {
    const linked = sourceReferenceCandidates(play)
      .map((reference) => sourceToMedia.get(reference))
      .find(Boolean);
    return linked || mediaIdForPlay(play);
  };
}

function copyReleaseValue(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return cleanString(value, MAX_PLAY_FIELD_CHARS);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (depth >= MAX_RELEASE_SETTING_DEPTH) return null;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_RELEASE_SETTING_ARRAY_ITEMS)
      .map((item) => copyReleaseValue(item, depth + 1))
      .filter((item) => item !== null);
  }
  if (value && typeof value === "object") {
    const out = {};
    Object.entries(value).slice(0, MAX_RELEASE_SETTING_KEYS).forEach(([key, item]) => {
      const cleanKey = cleanString(key, 160);
      const cleanItem = copyReleaseValue(item, depth + 1);
      if (cleanKey && cleanItem !== null) out[cleanKey] = cleanItem;
    });
    return out;
  }
  return null;
}

export function serializePlayerRelease(release) {
  let text = "";
  try {
    text = JSON.stringify(release);
  } catch (_err) {
    throw new Error("The player release could not be serialized safely.");
  }
  const size = new TextEncoder().encode(text).byteLength;
  if (size > MAX_PLAYER_RELEASE_BYTES) {
    throw new Error("The player release exceeds the 8 MiB delivery limit. Reduce player-visible data before saving.");
  }
  return { text, size };
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function releasePayloadWithoutRevision(release) {
  const source = asObject(release, {});
  const releaseMeta = asObject(source.release, {});
  const { revision: _revision, ...releaseWithoutRevision } = releaseMeta;
  return {
    ...source,
    release: releaseWithoutRevision,
  };
}

export async function finalizePlayerRelease(release) {
  const payload = releasePayloadWithoutRevision(release);
  const teamId = cleanString(payload?.release?.teamId, 512);
  if (!teamId) throw new Error("A team ID is required to finalize a player release.");
  const revision = await sha256Hex(JSON.stringify(payload));
  const finalized = {
    ...payload,
    release: { ...payload.release, revision },
  };
  serializePlayerRelease(finalized);
  return finalized;
}

function publicDiagramVersion(mediaId, manifest) {
  return {
    mediaId,
    version: cleanString(manifest?.version, 160),
    checksum: cleanString(manifest?.checksum, 160),
    size: Math.max(0, Number(manifest?.size) || 0),
    contentType: cleanString(manifest?.contentType, 160),
    uploadedAt: cleanString(manifest?.uploadedAt, 64),
  };
}

export async function buildPlayerRelease(backup, opts = {}) {
  const source = asObject(backup, {});
  const teamId = cleanString(opts.teamId, 512);
  if (!teamId) throw new Error("A team ID is required to build a player release.");

  const sourcePlaybook = asArray(readBackupValue(source, "playbook", []));
  const resolveCanonicalMediaId = buildCanonicalMediaResolver(sourcePlaybook);
  const releasedPlaybook = sourcePlaybook
    .map((play) => projectPlayerPlay(play, { mediaId: resolveCanonicalMediaId(play) }))
    .filter((play) => play && !play.isSeparator)
    .slice(0, MAX_PLAYS);

  const scripts = asArray(readBackupValue(source, "savedScripts", []))
    .map((script, index) => projectScript(script, index, resolveCanonicalMediaId))
    .filter(Boolean)
    .slice(0, MAX_SCRIPTS);
  const scriptPlays = scripts.flatMap((script) => script.plays || []);
  const playbook = dedupePlays([...releasedPlaybook, ...scriptPlays]);

  const signals = asArray(readBackupValue(source, "signals", []))
    .map(projectSignal)
    .filter(Boolean)
    .slice(0, MAX_SIGNALS);

  const allSourcePlays = sourcePlaybook.filter((play) => play && !play.isSeparator);
  const legacyClipCounts = new Map();
  allSourcePlays.forEach((play) => {
    const sig = legacyClipSig(play);
    if (sig) legacyClipCounts.set(sig, (legacyClipCounts.get(sig) || 0) + 1);
  });

  const diagramMediaIds = [...new Set(playbook.map((play) => cleanString(play.mediaId, 512)).filter(Boolean))].sort();
  const clipSigs = new Set(diagramMediaIds);
  playbook.forEach((play) => {
    // Old tag-keyed clip manifests are allowed only when the tag identifies
    // exactly one play in the full source playbook. New clip uploads use the
    // permanent media ID above.
    const legacySig = legacyClipSig(play);
    if (legacySig && legacyClipCounts.get(legacySig) === 1) clipSigs.add(legacySig);
  });
  signals.forEach((record) => {
    if (record.clipCount > 0 && record.clipKey) clipSigs.add(record.clipKey);
  });

  const values = {};
  RELEASE_VALUE_KEYS.forEach((key) => {
    const value = copyReleaseValue(readBackupValue(source, key, null));
    if (value !== null) values[key] = value;
  });

  const updatedAt = cleanString(opts.updatedAt || source.exportDate || "", 64);
  const diagramManifestMap = opts.env?.DB
    ? await readImageManifests(opts.env, teamId, diagramMediaIds)
    : new Map();
  const diagrams = diagramMediaIds
    .map((mediaId) => {
      const manifest = diagramManifestMap.get(mediaId);
      return manifest?.version ? publicDiagramVersion(mediaId, manifest) : null;
    })
    .filter(Boolean);

  const withoutRevision = {
    schema: PLAYER_RELEASE_SCHEMA,
    release: { teamId, updatedAt },
    team: {
      name: cleanString(values.teamName, 240),
      motd: cleanString(values.motd, 2000),
      branding: asObject(values.playerPortalBranding, {}),
    },
    scripts,
    playbook,
    signals,
    settings: {
      playerQuizSettings: asObject(values.playerQuizSettings, {}),
      playerQuizSourceSettings: asObject(values.playerQuizSourceSettings, {}),
      playerSignalGameSettings: asObject(values.playerSignalGameSettings, {}),
      playerPublishStatus: asObject(values.playerPublishStatus, {}),
      playerHelmetStickerTypes: asArray(values.playerHelmetStickerTypes),
    },
    media: {
      diagramMediaIds,
      // This is a release-time metadata snapshot for diagnostics/prefetch.
      // Authorization is the permanent media ID; the authenticated diagram
      // manifest endpoint always resolves the current team-scoped version.
      // That lets a coach replacement reach players immediately without a
      // high-contention rewrite of the whole release record.
      diagrams,
      clipSigs: [...clipSigs].sort(),
    },
  };
  return finalizePlayerRelease(withoutRevision);
}

export function isPlayerRelease(value, teamId = "") {
  return Boolean(
    value &&
    value.schema === PLAYER_RELEASE_SCHEMA &&
    value.release &&
    (!teamId || value.release.teamId === teamId) &&
    typeof value.release.revision === "string" &&
    Array.isArray(value.media?.diagramMediaIds) &&
    Array.isArray(value.media?.diagrams) &&
    Array.isArray(value.media?.clipSigs),
  );
}

export async function readCanonicalPlayerRelease(env, teamId) {
  const result = await readCurrentPlayerReleaseRevision(env, env?.CLIPS, teamId);
  if (!result?.metadata || !result?.payload) return null;
  let text = "";
  try {
    text = typeof result.payload.text === "function"
      ? await result.payload.text()
      : await new Response(result.payload.body).text();
  } catch (_err) {
    throw new Error("The current player release bytes could not be read.");
  }
  const checksum = await sha256Hex(text);
  if (checksum !== String(result.metadata.checksum || "").trim().toLowerCase()) {
    throw new Error("The current player release did not match its immutable checksum.");
  }
  let release = null;
  try { release = JSON.parse(text); } catch (_err) { return null; }
  return isPlayerRelease(release, teamId) ? release : null;
}

// Compatibility export retained for media-access callers. It reads the D1/R2
// release pointer, so every player request sees the same committed release as
// the player portal.
export async function readStoredPlayerRelease(env, teamId) {
  return readCanonicalPlayerRelease(env, teamId);
}

export function releaseAllowsDiagram(release, mediaId) {
  const id = cleanString(mediaId, 512);
  return Boolean(id && asArray(release?.media?.diagramMediaIds).includes(id));
}

export function releaseAllowsClip(release, sig) {
  const id = cleanString(sig, 400);
  return Boolean(id && asArray(release?.media?.clipSigs).includes(id));
}
