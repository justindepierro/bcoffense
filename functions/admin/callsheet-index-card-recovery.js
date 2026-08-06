// Admin-only, record-scoped Index Card recovery from immutable workspace history.
// It deliberately restores one card configuration, never an entire older workspace.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";
import { buildPlayerRelease, serializePlayerRelease } from "../_lib/player-release.js";
import { resolveSessionTeamId } from "../_lib/team-context.js";
import { commitWorkspaceAndPlayerRelease, readCurrentWorkspaceRevision, readWorkspaceRevision } from "../_lib/workspace-revisions.js";
import { sanitizeTeamWorkspace } from "../workspace/revision.js";

const SEARCH_LIMIT = 100;
const REVISION_PATTERN = /^[a-f0-9]{64}$/i;

function parseStoredJson(value, fallback) {
  if (value && typeof value === "object") return value;
  try { return typeof value === "string" ? JSON.parse(value) : fallback; } catch (_err) { return fallback; }
}

function cardsFromWorkspace(workspace) {
  const settings = parseStoredJson(workspace?.callSheetSettings, {});
  return Array.isArray(settings?.indexCards) ? settings.indexCards.filter((card) => card && card.id) : [];
}

function cardSummary(card, sourceRevision, createdAt) {
  const count = (side) => Array.isArray(side) ? side.length : 0;
  return { cardId: String(card.id), name: String(card.name || "Game Day Call Card"), sourceRevision, historicalRevisionAt: Number(createdAt || 0), frontBuckets: count(card.front), backBuckets: count(card.back) };
}

async function requireAdmin(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || session.role !== "admin") return { error: authJson({ ok: false, error: "Only an admin can recover Index Cards." }, { status: 403 }) };
  const teamId = await resolveSessionTeamId(session, context.env);
  if (!teamId || !context.env?.DB || !context.env?.CLIPS) return { error: authJson({ ok: false, error: "Canonical workspace storage is not configured." }, { status: 503 }) };
  return { session, teamId };
}

async function parseWorkspacePayload(payload) {
  try { return payload ? JSON.parse(await payload.text()) : null; } catch (_err) { return null; }
}

export async function onRequestGet(context) {
  const principal = await requireAdmin(context);
  if (principal.error) return principal.error;
  const cardId = String(new URL(context.request.url).searchParams.get("cardId") || "").trim();
  if (!cardId || cardId.length > 160) return authJson({ ok: false, error: "Choose an Index Card to search cloud history." }, { status: 400 });
  try {
    const current = await readCurrentWorkspaceRevision(context.env, context.env.CLIPS, principal.teamId);
    const currentWorkspace = await parseWorkspacePayload(current?.payload);
    const currentCard = cardsFromWorkspace(currentWorkspace).find((card) => String(card.id) === cardId);
    const cardName = String(currentCard?.name || "").trim().toLowerCase();
    const rows = await context.env.DB.prepare("SELECT revision, created_at FROM team_workspace_revisions WHERE team_id = ? ORDER BY created_at DESC LIMIT ?").bind(principal.teamId, SEARCH_LIMIT).all();
    const candidates = [];
    for (const row of rows?.results || []) {
      const revision = String(row?.revision || "");
      if (!REVISION_PATTERN.test(revision) || revision === current?.pointer?.workspaceRevision) continue;
      const historical = await readWorkspaceRevision(context.env, context.env.CLIPS, principal.teamId, revision);
      const card = cardsFromWorkspace(await parseWorkspacePayload(historical?.payload)).find((item) => String(item.id) === cardId || (cardName && String(item.name || "").trim().toLowerCase() === cardName));
      if (card) candidates.push(cardSummary(card, revision, row.created_at));
      if (candidates.length >= 12) break;
    }
    return authJson({ ok: true, candidates }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (err) {
    console.error("Index Card cloud recovery search failed", err);
    return authJson({ ok: false, error: "Index Card cloud history could not be searched." }, { status: 502 });
  }
}

export async function onRequestPost(context) {
  const principal = await requireAdmin(context);
  if (principal.error) return principal.error;
  let input = null;
  try { input = await context.request.json(); } catch (_err) { /* validated below */ }
  const sourceRevision = String(input?.sourceRevision || "").trim();
  const cardId = String(input?.cardId || "").trim();
  if (!REVISION_PATTERN.test(sourceRevision) || !cardId || cardId.length > 160) return authJson({ ok: false, error: "The selected Index Card recovery record is invalid." }, { status: 400 });
  try {
    const current = await readCurrentWorkspaceRevision(context.env, context.env.CLIPS, principal.teamId);
    const rawCurrent = await parseWorkspacePayload(current?.payload);
    const normalizedCurrent = sanitizeTeamWorkspace(rawCurrent);
    if (!current?.pointer || !normalizedCurrent.ok) return authJson({ ok: false, error: "The current workspace needs recovery before this Index Card can be restored." }, { status: 502 });
    const historical = await readWorkspaceRevision(context.env, context.env.CLIPS, principal.teamId, sourceRevision);
    const sourceCard = cardsFromWorkspace(await parseWorkspacePayload(historical?.payload)).find((card) => String(card.id) === cardId);
    if (!sourceCard) return authJson({ ok: false, error: "That Index Card is no longer available in the selected cloud revision." }, { status: 404 });
    const workspace = normalizedCurrent.workspace;
    const rawSettings = parseStoredJson(workspace.callSheetSettings, {});
    const cards = Array.isArray(rawSettings.indexCards) ? rawSettings.indexCards : [];
    const nextCard = JSON.parse(JSON.stringify(sourceCard));
    const targetIndex = cards.findIndex((card) => String(card?.id) === cardId);
    if (targetIndex >= 0) cards[targetIndex] = nextCard; else cards.push(nextCard);
    const nextSettings = { ...rawSettings, indexCards: cards };
    workspace.callSheetSettings = typeof workspace.callSheetSettings === "string" ? JSON.stringify(nextSettings) : nextSettings;
    const updatedAt = new Date().toISOString();
    const release = await buildPlayerRelease(workspace, { teamId: principal.teamId, updatedAt, env: context.env });
    const committed = await commitWorkspaceAndPlayerRelease(context.env, context.env.CLIPS, { teamId: principal.teamId, expectedWorkspaceRevision: current.pointer.workspaceRevision, workspacePayload: JSON.stringify(workspace), playerReleasePayload: serializePlayerRelease(release).text, actorId: principal.session.d1UserId || null, workspaceContentType: "application/json; charset=utf-8", playerReleaseContentType: "application/json; charset=utf-8" });
    if (!committed.committed) return authJson({ ok: false, error: "The workspace changed while restoring. Search again and retry.", current: committed.current || null }, { status: 409 });
    // Return the actual card configuration as well as its summary. The caller
    // must replace its local copy immediately; otherwise a stale browser
    // workspace can continue displaying (or later republish) the old card.
    return authJson({ ok: true, card: cardSummary(nextCard, sourceRevision, 0), restoredCard: nextCard, workspaceRevision: committed.current.workspaceRevision }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (err) {
    console.error("Index Card cloud recovery failed", err);
    return authJson({ ok: false, error: "The Index Card could not be restored. Retry safely." }, { status: 502 });
  }
}
