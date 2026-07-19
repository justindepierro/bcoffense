// Exact source-key validation for archived diagram recovery.
//
// Historic diagram bytes are recoverable only through their original R2 key.
// Never turn a user-provided fragment into an R2 key by prepending a prefix:
// that loses provenance and makes it too easy to read the wrong object.

export const LEGACY_DIAGRAM_SOURCE_PREFIXES = Object.freeze([
  "images/",
  "media/plays/",
]);

const MAX_LEGACY_DIAGRAM_SOURCE_KEY_LENGTH = 1000;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
const ENCODED_TRAVERSAL_SEGMENT = /(?:^|\/)%2e(?:%2e)?(?:\/|$)/i;

/**
 * Return an exact, allowlisted historic R2 key or an empty string.
 *
 * Keys are intentionally not decoded or normalized: R2 keys are opaque. A
 * recovery record must retain the exact source that was inventoried, while
 * traversal-like/ambiguous input is rejected before it can reach R2.
 */
export function normalizeLegacyDiagramSourceKey(value, maxLength = MAX_LEGACY_DIAGRAM_SOURCE_KEY_LENGTH) {
  const key = String(value ?? "");
  const limit = Math.max(1, Number(maxLength) || MAX_LEGACY_DIAGRAM_SOURCE_KEY_LENGTH);
  if (!key || key !== key.trim() || key.length > limit || CONTROL_CHARACTERS.test(key) || key.includes("\\")) {
    return "";
  }
  const prefix = LEGACY_DIAGRAM_SOURCE_PREFIXES.find((candidate) => key.startsWith(candidate));
  if (!prefix) return "";

  const suffix = key.slice(prefix.length);
  if (!suffix || suffix.startsWith("/") || suffix.endsWith("/") || ENCODED_TRAVERSAL_SEGMENT.test(suffix)) {
    return "";
  }
  const segments = suffix.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return "";
  return key;
}

export function isLegacyDiagramSourceKey(value) {
  return Boolean(normalizeLegacyDiagramSourceKey(value));
}
