/**
 * Tenant-boundary contract checks for the D1 discussion surface.
 *
 * These are intentionally source-level checks: Pages Functions use the
 * Cloudflare runtime, while this repository's lightweight unit suite runs in
 * plain Node. The assertions make it difficult to accidentally remove the
 * required team join when a route or helper is refactored.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function source(relativePath) {
  return readFile(new URL(relativePath, `file://${root}/`), "utf8");
}

const threads = await source("functions/_lib/d1-threads.js");
const postsRoute = await source("functions/api/posts/[postId].js");
const reactionsRoute = await source("functions/api/posts/[postId]/react.js");
const repliesRoute = await source("functions/api/threads/[playId]/replies.js");
const moderationRoute = await source("functions/api/moderation/[postId]/index.js");
const likesRoute = await source("functions/api/plays/[playId]/like.js");
const notifications = await source("functions/_lib/d1-notifications.js");
const migration = await source("migrations/0015_discussion_status_and_team_integrity.sql");

assert.match(
  threads,
  /export async function getTeamScopedPost[\s\S]*JOIN play_threads t ON t\.id = p\.thread_id[\s\S]*t\.team_id = \?/,
  "every post mutation has a reusable team-scoped lookup",
);
assert.match(
  threads,
  /parentPostId[\s\S]*WHERE id = \? AND thread_id = \? AND deleted_at IS NULL/,
  "a reply parent must belong to the destination thread",
);
assert.match(
  threads,
  /export async function getPostReplies\(db, teamId, playId, rootPostId[\s\S]*t\.team_id = \?[\s\S]*t\.play_id = \?/,
  "reply expansion proves both team and play ownership",
);
assert.match(postsRoute, /deletePost\(env\.DB, teamId, postId, session\)/, "post delete passes team scope");
assert.match(postsRoute, /editPost\(env\.DB, teamId, postId, body\.body, session\)/, "post edit passes team scope");
assert.match(postsRoute, /setQuestionState\(env\.DB, teamId, postId, newState, session\)/, "question state passes team scope");
assert.match(reactionsRoute, /toggleReaction\(env\.DB, teamId, postId, userId, reactionKey\)/, "reactions pass team scope");
assert.match(repliesRoute, /getPostReplies\(env\.DB, teamId, playId, rootPostId/, "reply route passes team and play scope");
assert.match(moderationRoute, /moderatePostAction\(env\.DB, teamId, postId/, "moderation passes team scope");
assert.doesNotMatch(likesRoute, /\|\| "default"/, "likes cannot fall back to a shared default team");
assert.doesNotMatch(notifications, /team_id = \? OR team_id IS NULL/, "team broadcasts cannot include unassigned accounts");
assert.match(migration, /'pending_review', 'blocked'/, "D1 schema permits runtime moderation states");
assert.doesNotMatch(
  migration,
  /REFERENCES discussion_posts_v15\(id\)/,
  "the rebuilt discussion table must keep valid final-table self references",
);

console.log("team-scope contract: 14 assertions passed");
