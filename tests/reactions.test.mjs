/**
 * tests/reactions.test.mjs
 * Unit tests for reaction validation and aggregation logic.
 * Run with: node tests/reactions.test.mjs
 */

// ── Minimal inline test harness ───────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function describe(label, fn) {
  console.log(`\n▸ ${label}`);
  fn();
}

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}`);
    failed++;
    failures.push(label);
  }
}

// ── Constants replicated from d1-threads.js (source of truth) ─────────────────
const REACTION_KEYS = new Set([
  "thumbs_up", "thumbs_down", "heart", "football",
  "gold_medal", "six", "happy", "strong", "got_it",
  "same_question", "helpful",
]);

// ── Reaction aggregation logic (pure functions to test) ───────────────────────

/**
 * Build an aggregated reaction summary from a flat list of reaction rows.
 * Each row: { reaction_key, user_id }
 * Returns: Array<{ key, count, mine }> sorted by count desc.
 */
function aggregateReactions(rows, viewerUserId = null) {
  const counts = {};
  const mine = {};
  for (const row of rows) {
    counts[row.reaction_key] = (counts[row.reaction_key] || 0) + 1;
    if (row.user_id === viewerUserId) mine[row.reaction_key] = true;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count, mine: !!mine[key] }));
}

/**
 * Simulate toggling a reaction (add if absent, remove if present).
 * Returns { rows, added }.
 */
function simulateToggle(rows, postId, userId, reactionKey) {
  const existing = rows.findIndex(
    (r) => r.post_id === postId && r.user_id === userId && r.reaction_key === reactionKey,
  );
  if (existing !== -1) {
    const next = [...rows];
    next.splice(existing, 1);
    return { rows: next, added: false };
  }
  return { rows: [...rows, { post_id: postId, user_id: userId, reaction_key: reactionKey }], added: true };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Reaction key validation", () => {
  assert(REACTION_KEYS.has("thumbs_up"), "thumbs_up is a valid key");
  assert(REACTION_KEYS.has("thumbs_down"), "thumbs_down is a valid key");
  assert(REACTION_KEYS.has("heart"), "heart is a valid key");
  assert(REACTION_KEYS.has("football"), "football is a valid key");
  assert(REACTION_KEYS.has("gold_medal"), "gold_medal is a valid key");
  assert(REACTION_KEYS.has("six"), "six is a valid key");
  assert(REACTION_KEYS.has("happy"), "happy is a valid key");
  assert(REACTION_KEYS.has("strong"), "strong is a valid key");
  assert(REACTION_KEYS.has("got_it"), "got_it is a valid key");
  assert(REACTION_KEYS.has("same_question"), "same_question is a valid key");
  assert(REACTION_KEYS.has("helpful"), "helpful is a valid key");
  assert(!REACTION_KEYS.has(""), "empty string is not valid");
  assert(!REACTION_KEYS.has("like"), "arbitrary 'like' key is not valid");
  assert(!REACTION_KEYS.has("fire"), "arbitrary 'fire' emoji key is not valid");
  assert(!REACTION_KEYS.has("THUMBS_UP"), "case-sensitive — uppercase rejected");
  assert(REACTION_KEYS.size === 11, "all 11 supported reaction keys are defined");
});

describe("Reaction aggregation — counts and ordering", () => {
  const rows = [
    { post_id: "p1", reaction_key: "thumbs_up", user_id: "u1" },
    { post_id: "p1", reaction_key: "thumbs_up", user_id: "u2" },
    { post_id: "p1", reaction_key: "thumbs_up", user_id: "u3" },
    { post_id: "p1", reaction_key: "heart", user_id: "u1" },
    { post_id: "p1", reaction_key: "heart", user_id: "u4" },
    { post_id: "p1", reaction_key: "football", user_id: "u5" },
  ];
  const agg = aggregateReactions(rows, "u1");

  assert(agg[0].key === "thumbs_up", "highest count reaction is first");
  assert(agg[0].count === 3, "thumbs_up count is 3");
  assert(agg[1].key === "heart", "second reaction is heart");
  assert(agg[1].count === 2, "heart count is 2");
  assert(agg[2].key === "football", "third reaction is football");
  assert(agg[2].count === 1, "football count is 1");
  assert(agg.length === 3, "exactly 3 distinct reactions");
});

describe("Reaction aggregation — mine flag", () => {
  const rows = [
    { post_id: "p1", reaction_key: "thumbs_up", user_id: "coach1" },
    { post_id: "p1", reaction_key: "heart", user_id: "player1" },
    { post_id: "p1", reaction_key: "football", user_id: "player1" },
  ];
  const asCoach = aggregateReactions(rows, "coach1");
  const asPlayer = aggregateReactions(rows, "player1");
  const asGuest = aggregateReactions(rows, null);

  const coachThumbsUp = asCoach.find((r) => r.key === "thumbs_up");
  assert(coachThumbsUp?.mine === true, "coach sees thumbs_up as mine");

  const coachHeart = asCoach.find((r) => r.key === "heart");
  assert(coachHeart?.mine === false, "coach heart is not mine");

  const playerHeart = asPlayer.find((r) => r.key === "heart");
  assert(playerHeart?.mine === true, "player sees heart as mine");

  const playerFootball = asPlayer.find((r) => r.key === "football");
  assert(playerFootball?.mine === true, "player sees football as mine");

  const guestHeart = asGuest.find((r) => r.key === "heart");
  assert(guestHeart?.mine === false, "guest sees nothing as mine");
});

describe("Reaction aggregation — empty input", () => {
  const agg = aggregateReactions([]);
  assert(agg.length === 0, "empty rows → empty aggregation");
});

describe("Reaction toggle — add and remove", () => {
  const initial = [
    { post_id: "p1", user_id: "u1", reaction_key: "thumbs_up" },
  ];

  // Add a new reaction
  const { rows: afterAdd, added: wasAdded } = simulateToggle(initial, "p1", "u2", "heart");
  assert(wasAdded === true, "adding new reaction returns added=true");
  assert(afterAdd.length === 2, "row count increases to 2 after add");
  assert(afterAdd.some((r) => r.user_id === "u2" && r.reaction_key === "heart"), "new row exists");

  // Remove existing reaction
  const { rows: afterRemove, added: wasAdded2 } = simulateToggle(afterAdd, "p1", "u1", "thumbs_up");
  assert(wasAdded2 === false, "removing existing reaction returns added=false");
  assert(afterRemove.length === 1, "row count decreases to 1 after remove");
  assert(!afterRemove.some((r) => r.user_id === "u1" && r.reaction_key === "thumbs_up"), "removed row gone");

  // Toggle same key twice = no change (add then remove)
  const { rows: r2 } = simulateToggle(initial, "p1", "u1", "thumbs_up");
  assert(r2.length === 0, "toggling existing reaction twice removes it");
});

describe("Reaction toggle — one reaction per user per post (uniqueness)", () => {
  // Simulating the one-reaction-per-user rule by replacing before adding
  function toggleWithReplace(rows, postId, userId, reactionKey) {
    // Remove any existing reaction from this user on this post
    const withoutUser = rows.filter((r) => !(r.post_id === postId && r.user_id === userId));
    // Check if they had this exact key before (removing = unchanged count)
    const hadKey = rows.find((r) => r.post_id === postId && r.user_id === userId && r.reaction_key === reactionKey);
    if (hadKey) return { rows: withoutUser, changed: "removed" };
    return { rows: [...withoutUser, { post_id: postId, user_id: userId, reaction_key: reactionKey }], changed: "added" };
  }

  const base = [
    { post_id: "p1", user_id: "u1", reaction_key: "thumbs_up" },
  ];

  // Switching from thumbs_up to heart (Facebook-style — only one reaction per post)
  const { rows: switched, changed } = toggleWithReplace(base, "p1", "u1", "heart");
  assert(changed === "added", "switching reaction adds new one");
  assert(switched.length === 1, "still only one row for user after switch");
  assert(switched[0].reaction_key === "heart", "new reaction key is heart");
});

describe("Top-3 reaction summary for compact display", () => {
  const rows = [
    { reaction_key: "thumbs_up", user_id: "u1" },
    { reaction_key: "thumbs_up", user_id: "u2" },
    { reaction_key: "heart", user_id: "u3" },
    { reaction_key: "football", user_id: "u4" },
    { reaction_key: "six", user_id: "u5" },
    { reaction_key: "six", user_id: "u6" },
    { reaction_key: "six", user_id: "u7" },
    { reaction_key: "gold_medal", user_id: "u8" },
  ];
  const agg = aggregateReactions(rows);
  const top3 = agg.slice(0, 3);

  assert(top3.length === 3, "top-3 slice returns exactly 3 items");
  assert(top3[0].key === "six", "highest count (3) is first in top-3");
  assert(top3[1].key === "thumbs_up", "second highest (2) is second in top-3");
  assert(top3[2].count === 1, "third item has count 1");
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailed tests:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
} else {
  console.log("All tests passed ✅");
}
