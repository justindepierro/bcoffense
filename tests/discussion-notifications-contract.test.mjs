/**
 * Discussion → staff notification contract.
 *
 * Pages Functions run in the Cloudflare runtime, so these source-level checks
 * protect the durable notification path without requiring a D1 emulator.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [notifications, threads, threadRoute, countRoute, indexRoute, itemRoute, client, discussionClient, discussionMedia, discussionOutbox, playbookCss, presentationCss, indexHtml, cloudSync, playerPublish] = await Promise.all([
  source("functions/_lib/d1-notifications.js"),
  source("functions/_lib/d1-threads.js"),
  source("functions/api/threads/[playId].js"),
  source("functions/api/notifications/count.js"),
  source("functions/api/notifications/index.js"),
  source("functions/api/notifications/[id].js"),
  source("js/app-notifications.js"),
  source("js/play-discussion.js"),
  source("js/discussion-media.js"),
  source("js/discussion-outbox.js"),
  source("css/playbook.css"),
  source("css/play-presentation.css"),
  source("index.html"),
  source("js/cloud-sync.js"),
  source("js/script-player.js"),
]);

assert.match(
  notifications,
  /export async function notifyTeamStaffOfPlayerPost[\s\S]*status = 'active'[\s\S]*role IN \('admin', 'coach', 'assistant', 'assistant_coach'\)/,
  "player discussion alerts target every active team staff account",
);
assert.match(
  notifications,
  /postType === "question"[\s\S]*player_\$\{kind\}/,
  "questions and ordinary comments receive distinct staff notification types",
);
assert.match(
  notifications,
  /export async function ensureNotificationUser[\s\S]*INSERT INTO users/,
  "static staff accounts get a durable notification identity automatically",
);
assert.match(
  threadRoute,
  /if \(!isIdempotentRetry && !isStaff && modInfo\.outcome !== "block"\)[\s\S]*await notifyTeamStaffOfPlayerPost/,
  "every deliverable player post invokes staff notification delivery",
);
assert.match(threadRoute, /playId,[\s\S]*playLabel: playSig,[\s\S]*body: postBody/, "staff alerts include a play deep link and post context");
assert.match(notifications, /DISCUSSION_COMMENT_DEDUPE_SECONDS = 15 \* 60/, "repeat player comments coalesce into one fresh staff alert");
assert.match(notifications, /createOrRefreshDiscussionCommentNotification/, "discussion comment notifications use their focused dedupe helper");
assert.match(notifications, /skipStaffRecipient && STAFF_NOTIFICATION_ROLES\.includes\(post\.role\)/, "staff do not receive a duplicate direct reply after player activity already reaches the staff feed");
assert.match(threadRoute, /if \(!isIdempotentRetry && isStaff && !parentPostId\)/, "only a new top-level coach note fans out to prior thread participants");
assert.match(threadRoute, /notificationType: isStaff \? "coach_reply" : "reply"/, "direct coach replies retain a clear coach-reply receipt for the addressed player");
assert.match(threadRoute, /skipPlayerRecipient: isCoachVisualReply/, "marked-up coach replies avoid a second generic reply receipt");
assert.match(threads, /role IN \('coach', 'admin', 'assistant', 'assistant_coach'\)/, "legacy assistant staff are included in discussion safety escalation recipients");
assert.match(threads, /DELETE FROM reactions WHERE post_id = \? AND user_id = \?/, "a new reaction replaces an older reaction from the same person on that post");
assert.match(threads, /UPDATE discussion_posts SET updated_at = \? WHERE id = \?/, "reaction changes advance the discussion revision used by fresh readers");
assert.match(threads, /clientPostId = null/, "discussion posts accept a client-owned retry identifier");
assert.match(threads, /_idempotent: true/, "a replayed client post returns its original durable row");
assert.match(threadRoute, /clientPostId,/, "the thread route passes the retry identifier to durable post creation");
assert.match(threadRoute, /isIdempotentRetry/, "replayed messages do not fan out duplicate notifications or workflow changes");
assert.match(threadRoute, /If-None-Match/, "thread reads accept a conditional revision from an already-open panel");
assert.match(threadRoute, /status: 304/, "an unchanged thread avoids re-sending the full discussion payload");
for (const route of [countRoute, indexRoute, itemRoute]) {
  assert.match(route, /ensureNotificationUser\(env\.DB, session\)/, "all notification endpoints resolve static staff consistently");
}
assert.match(client, /player_comment: "💬"/, "the bell has an icon for player comments");
assert.match(client, /player_question: "❓"/, "the bell has an icon for player questions");
assert.match(client, /player_reply: "↩️"/, "the bell has an icon for player replies");
assert.match(client, /getCurrentAuthUser === "function" \? getCurrentAuthUser\(\) : null/, "the unread poll waits for a verified session before calling its protected endpoint");
assert.match(client, /credentials: "same-origin"[\s\S]*cache: "no-store"/, "notification reads use the current same-site session and never reuse a stale count");
assert.match(client, /const _NOTIF_CONVERSATION_TYPES = new Set/, "discussion alerts are explicitly classified as conversation work");
assert.match(client, /function _notifGroupItems\(items\)/, "repeated practice publish receipts are grouped in the feed");
assert.match(client, /_NOTIF_STAFF_INBOX_TYPES/, "staff discussion activity has a dedicated coach-inbox classification");
assert.match(client, /Coach follow-up/, "the notification drawer clearly labels player activity requiring staff review");
assert.match(client, /function setNotifFilter\(filter = "all"\)/, "the mobile drawer can focus on messages or practice work");
assert.match(client, /Promise\.all\(notifIds\.map/, "opening a grouped update acknowledges every collapsed receipt");
assert.match(client, /closeNotifDrawer\(\);[\s\S]*if \(deepLink === "script"/, "opening an alert closes the mobile drawer before routing to its destination");
assert.match(client, /openLayer\(drawer, \{[\s\S]*id: "notification-drawer"/, "the notification drawer uses the shared modal and scroll-lock contract");
assert.match(client, /function _openPlayerDiscussionForPlayId\(playId\)[\s\S]*openPresentationDiscussion/, "player discussion alerts reopen the notified play in Swipe View instead of the coach editor");
assert.match(notifications, /script_published: 24 \* 60 \* 60/, "script publish alerts coalesce for a full day");
assert.match(notifications, /media_update: 24 \* 60 \* 60/, "media alerts coalesce for a full day");
assert.match(notifications, /team_update: 20 \* 60/, "one player-facing team update coalesces a publish burst");
assert.match(client, /team_update: "🏈"/, "the bell gives a grouped team update a clear icon");
assert.match(client, /deepLink === "dashboard"/, "a grouped team update routes players to Home");
assert.match(indexHtml, /class="notif-filter-bar"/, "notification filters are present in the shell");
assert.match(cloudSync, /function requestImmediateTeamPublish\(reason = "substantial-update", opts = \{\}\)/, "substantial player-facing changes bypass the routine autosave delay");
assert.match(playerPublish, /window\.requestImmediateTeamPublish\(kind, \{/, "media, script, and quiz publish receipts request an immediate team update");
assert.match(discussionClient, /role === "assistant_coach"/, "the discussion UI recognizes managed assistant coaches as staff");
assert.match(discussionClient, /function _discCanFetchRemote\(\)/, "discussion count reads wait for a verified session instead of racing secure startup");
assert.match(discussionClient, /function _discFetchBatchCounts\(playIds\)/, "script, game-plan, and call-sheet badges share one authenticated count boundary");
assert.match(discussionClient, /credentials: "same-origin"[\s\S]*cache: "no-store"/, "discussion badge reads use the active same-site session and avoid stale counts");
assert.match(discussionClient, /_REACTION_QUICK_PICKER_ORDER/, "the reaction picker keeps the core communication choices prominent");
assert.match(discussionClient, /disc-picker-more/, "secondary reactions are intentionally tucked behind a More control");
assert.match(discussionClient, /function _discEnsureScope\(container\)/, "each discussion surface receives a stable local interaction scope");
assert.match(discussionClient, /const _discThreadCache = new Map\(\)/, "recent thread data is kept only in memory for an instant, authenticated reopen");
assert.match(discussionClient, /const _discLoadControllers = new WeakMap\(\)/, "an older thread request can be cancelled before it paints a reused panel");
assert.match(discussionClient, /signal: controller\.signal/, "thread fetches are attached to their panel cancellation signal");
assert.match(discussionClient, /function _discPostInScope\(scopeRoot, postId\)/, "reply and reaction updates resolve inside the panel that initiated them");
assert.match(discussionClient, /section\.querySelector\("\.disc-body"\)/, "Game Plan and Playbook discussions do not reuse a document-global discussion body");
assert.match(discussionClient, /data-disc-posts/, "discussion post lists are addressed through their local scope rather than a repeated global ID");
assert.match(discussionClient, /function _discComposerKey\(composer\)/, "attachment drafts are scoped to the visible composer, not only the play");
assert.match(discussionClient, /function _discSendDurable\(payload\)/, "new comments and replies use the durable send boundary");
assert.match(discussionClient, /discussion-outbox-delivered/, "a delayed message replaces only its own optimistic card when delivered");
assert.match(discussionOutbox, /indexedDB\.open\(DB_NAME, VERSION\)/, "the outbox persists pending discussion work across app restarts");
assert.match(discussionOutbox, /client_post_id: job\.id/, "outbox retries carry a stable idempotency identifier");
assert.match(discussionOutbox, /window\.addEventListener\("online"/, "pending messages resume automatically when connectivity returns");
assert.doesNotMatch(discussionClient, /id="discCompose-\$\{/, "multiple discussion surfaces do not emit duplicate composer IDs");
assert.doesNotMatch(discussionClient, /id="disc-pending-\$\{/, "pending attachment previews do not collide across open surfaces");
assert.match(discussionClient, /discReactionPickerOverlay/, "mobile reaction sheets shield the background from accidental taps");
assert.match(discussionClient, /id: "discussion-reaction-picker"[\s\S]*blocking: true/, "phone reaction choices use the shared blocking-layer contract");
assert.match(discussionClient, /id: "discussion-reply-sheet"[\s\S]*scrollElement: sheet[\s\S]*blocking: true/, "mobile replies own one safe, locked sheet instead of a loose overlay pair");
assert.match(discussionClient, /id: "game-plan-discussion"[\s\S]*scrollElement: body[\s\S]*blocking: true/, "Game Plan and Wristband discussion use the shared modal lifecycle");
assert.match(discussionMedia, /id: "discussion-markup"[\s\S]*scrollElement: overlay\.querySelector\("\.disc-markup-panel"\)[\s\S]*blocking: true/, "diagram markup uses the shared modal lifecycle without closing its reply composer");
assert.match(discussionMedia, /discAttachmentViewerOverlay[\s\S]*id: "discussion-attachment-viewer"[\s\S]*blocking: true/, "attachment viewing is a registered, safe blocking layer");
assert.match(discussionMedia, /overlay\.addEventListener\("keydown", \(event\) => \{[\s\S]*event\.key !== "Escape"/, "discussion blocking layers provide an explicit Escape dismissal path");
assert.match(discussionMedia, /const _discPendingAttachments = new Map\(\)/, "attachment drafts are owned with the attachment and markup runtime");
assert.match(discussionMedia, /function _discWireAttachmentInputs\(container\)/, "composer attachment inputs are wired by the media owner");
assert.doesNotMatch(discussionClient, /const _discPendingAttachments = new Map\(\)/, "thread runtime does not retain attachment state after the media split");
assert.match(discussionClient, /function switchDiscComposerType\(arg\)/, "discussion composers support a direct touch-friendly Comment or Ask question choice");
assert.match(discussionClient, /disc-composer-mode-btn/, "the native post-type dropdown is backed by visible composer mode buttons");
assert.match(discussionClient, /assistant_coach/, "managed assistant coaches receive the same visual treatment as other staff in discussions");
assert.match(playbookCss, /\.disc-composer-mode \{[\s\S]*border-radius: var\(--radius-pill\)/, "composer mode choices are styled as compact segmented controls");
assert.match(discussionClient, /container\.classList\.toggle\("pp-discussion-body", isPresentationDrawer\)/, "the presentation discussion renderer identifies its dedicated scroll layout");
assert.match(playbookCss, /\.disc-post \{[\s\S]*grid-template-columns: 28px minmax\(0, 1fr\)/, "discussion posts use a stable avatar-plus-content grid instead of a horizontal reply flex row");
assert.match(playbookCss, /\.disc-post > \.disc-reply-composer-slot,[\s\S]*grid-column: 2/, "reply composers and reply trees sit below their parent content");
assert.match(presentationCss, /\.pp-disc-drawer-body\.pp-discussion-body \{[\s\S]*flex-direction: column/, "presentation discussion uses a contained column layout");
assert.match(presentationCss, /\.pp-disc-drawer-body\.pp-discussion-body \.disc-posts \{[\s\S]*overflow-y: auto/, "only the presentation message list scrolls while the composer remains available");
assert.match(playbookCss, /\.disc-reaction-picker-overlay\.visible/, "mobile reaction picker has a dedicated interaction-blocking backdrop");

console.log("discussion notification contract: notification delivery, scoped thread, and mobile feed contracts passed");
