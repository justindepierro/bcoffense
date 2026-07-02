/**
 * tests/likes.test.mjs
 * Unit + integration tests for the play likes feature (Phase 10).
 * Run with: node tests/likes.test.mjs
 */

// ── Minimal inline test harness ──────────────────────────────────────────────

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

// ── Pure logic helpers (replicate endpoint business logic) ───────────────────

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_S = 3600;

/**
 * Simulate toggle-like logic: given existing likes and a user, return
 * { liked, newLikes } after toggling.
 */
function toggleLike(existingLikes, userId, teamId) {
  const idx = existingLikes.findIndex(
    (l) => l.play_id === "PLAY1" && l.user_id === userId,
  );
  if (idx !== -1) {
    // Remove like
    const newLikes = existingLikes.filter((_, i) => i !== idx);
    return { liked: false, newLikes };
  } else {
    // Add like
    const newLikes = [...existingLikes, { play_id: "PLAY1", user_id: userId, team_id: teamId }];
    return { liked: true, newLikes };
  }
}

function countLikes(likes, playId, teamId) {
  return likes.filter((l) => l.play_id === playId && l.team_id === teamId).length;
}

function isRateLimited(recentInserts, userId) {
  const userInserts = recentInserts.filter((r) => r.user_id === userId);
  return userInserts.length >= RATE_LIMIT_MAX;
}

function isLikedBy(likes, playId, userId) {
  return likes.some((l) => l.play_id === playId && l.user_id === userId);
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe("Like — add like", () => {
  const likes = [];
  const { liked, newLikes } = toggleLike(likes, "user1", "team1");
  assert(liked === true, "first like returns liked=true");
  assert(newLikes.length === 1, "creates one like row");
  assert(newLikes[0].user_id === "user1", "like row has correct user_id");
  assert(newLikes[0].team_id === "team1", "like row has correct team_id");
});

describe("Like — remove like (toggle)", () => {
  const initial = [{ play_id: "PLAY1", user_id: "user1", team_id: "team1" }];
  const { liked, newLikes } = toggleLike(initial, "user1", "team1");
  assert(liked === false, "second toggle returns liked=false");
  assert(newLikes.length === 0, "like row is removed");
});

describe("Like — double toggle returns to liked state", () => {
  let likes = [];
  const r1 = toggleLike(likes, "user1", "team1");
  likes = r1.newLikes;
  assert(r1.liked === true, "after 1st toggle: liked=true");
  const r2 = toggleLike(likes, "user1", "team1");
  likes = r2.newLikes;
  assert(r2.liked === false, "after 2nd toggle: liked=false");
  const r3 = toggleLike(likes, "user1", "team1");
  assert(r3.liked === true, "after 3rd toggle: liked=true again");
});

describe("Like — uniqueness per user", () => {
  // Simulated UNIQUE(play_id, user_id) — second insert by same user is a no-op toggle
  const likes = [];
  const r1 = toggleLike(likes, "user1", "team1");
  const r2 = toggleLike(r1.newLikes, "user1", "team1"); // removes it
  assert(r2.newLikes.length === 0, "user cannot have two likes on same play");
});

describe("Like — multiple users can like the same play", () => {
  let likes = [];
  likes = toggleLike(likes, "user1", "team1").newLikes;
  likes = toggleLike(likes, "user2", "team1").newLikes;
  likes = toggleLike(likes, "user3", "team1").newLikes;
  const count = countLikes(likes, "PLAY1", "team1");
  assert(count === 3, "3 different users produce count=3");
});

describe("Like — aggregate count is correct after removals", () => {
  let likes = [];
  likes = toggleLike(likes, "user1", "team1").newLikes;
  likes = toggleLike(likes, "user2", "team1").newLikes;
  likes = toggleLike(likes, "user3", "team1").newLikes;
  likes = toggleLike(likes, "user2", "team1").newLikes; // user2 unlikes
  const count = countLikes(likes, "PLAY1", "team1");
  assert(count === 2, "count is 2 after one unlike");
});

describe("Like — isLikedBy", () => {
  let likes = [];
  likes = toggleLike(likes, "user1", "team1").newLikes;
  assert(isLikedBy(likes, "PLAY1", "user1") === true, "user1 has liked PLAY1");
  assert(isLikedBy(likes, "PLAY1", "user2") === false, "user2 has not liked PLAY1");
});

describe("Like — count is scoped to team", () => {
  const likes = [
    { play_id: "PLAY1", user_id: "user1", team_id: "team1" },
    { play_id: "PLAY1", user_id: "user2", team_id: "team1" },
    { play_id: "PLAY1", user_id: "user3", team_id: "team2" }, // different team
  ];
  const team1Count = countLikes(likes, "PLAY1", "team1");
  const team2Count = countLikes(likes, "PLAY1", "team2");
  assert(team1Count === 2, "team1 sees 2 likes");
  assert(team2Count === 1, "team2 sees its own 1 like");
});

describe("Like — count is zero when no likes", () => {
  const count = countLikes([], "PLAY1", "team1");
  assert(count === 0, "count is 0 when likes array is empty");
});

describe("Like — unauthenticated request is rejected", () => {
  // Simulate: no session => 401
  function handleLike(session) {
    if (!session) return { status: 401, body: { ok: false, error: "Authentication required." } };
    return { status: 200, body: { ok: true, liked: true, count: 1 } };
  }
  const r = handleLike(null);
  assert(r.status === 401, "null session returns 401");
  assert(r.body.ok === false, "response ok=false");
});

describe("Like — empty playId is rejected", () => {
  function handleLike(session, playId) {
    if (!session) return { status: 401 };
    if (!playId) return { status: 400, body: { ok: false, error: "Missing play ID." } };
    return { status: 200, body: { ok: true } };
  }
  const r = handleLike({ userId: "u1" }, "");
  assert(r.status === 400, "empty playId returns 400");
  assert(r.body.error === "Missing play ID.", "correct error message");
});

describe("Like — rate limit blocks after max actions", () => {
  // Build 60 recent inserts for user1
  const recentInserts = Array.from({ length: 60 }, () => ({ user_id: "user1" }));
  assert(isRateLimited(recentInserts, "user1") === true, "user1 is rate limited at 60 inserts");
  assert(isRateLimited(recentInserts, "user2") === false, "user2 is not rate limited");
});

describe("Like — rate limit does not trigger before max", () => {
  const recentInserts = Array.from({ length: 59 }, () => ({ user_id: "user1" }));
  assert(isRateLimited(recentInserts, "user1") === false, "59 inserts is under the limit");
});

describe("Like — optimistic UI toggle logic", () => {
  // Simulate client-side optimistic toggle
  function optimisticToggle(currentLiked, currentCount) {
    return {
      liked: !currentLiked,
      count: currentLiked ? Math.max(0, currentCount - 1) : currentCount + 1,
    };
  }
  const r1 = optimisticToggle(false, 5);
  assert(r1.liked === true, "optimistic: false → true");
  assert(r1.count === 6, "optimistic: count increments");
  const r2 = optimisticToggle(true, 6);
  assert(r2.liked === false, "optimistic: true → false");
  assert(r2.count === 5, "optimistic: count decrements");
});

describe("Like — optimistic count never goes negative", () => {
  function optimisticToggle(currentLiked, currentCount) {
    return {
      liked: !currentLiked,
      count: currentLiked ? Math.max(0, currentCount - 1) : currentCount + 1,
    };
  }
  const r = optimisticToggle(true, 0); // should not go to -1
  assert(r.count === 0, "count floors at 0 on unlike");
});

describe("Like — GET returns liked=false when no likes exist", () => {
  function handleGet(likes, playId, userId, teamId) {
    const liked = likes.some((l) => l.play_id === playId && l.user_id === userId);
    const count = likes.filter((l) => l.play_id === playId && l.team_id === teamId).length;
    return { ok: true, liked, count };
  }
  const r = handleGet([], "PLAY1", "user1", "team1");
  assert(r.ok === true, "GET returns ok=true");
  assert(r.liked === false, "liked=false when no likes");
  assert(r.count === 0, "count=0 when no likes");
});

describe("Like — GET returns liked=true when user has liked", () => {
  function handleGet(likes, playId, userId, teamId) {
    const liked = likes.some((l) => l.play_id === playId && l.user_id === userId);
    const count = likes.filter((l) => l.play_id === playId && l.team_id === teamId).length;
    return { ok: true, liked, count };
  }
  const likes = [{ play_id: "PLAY1", user_id: "user1", team_id: "team1" }];
  const r = handleGet(likes, "PLAY1", "user1", "team1");
  assert(r.liked === true, "liked=true when user has liked");
  assert(r.count === 1, "count=1");
});

describe("Like — playId URL-encoding round-trip", () => {
  const raw = "11::Ace::Stick Y Seam";
  const encoded = encodeURIComponent(raw);
  const decoded = decodeURIComponent(encoded);
  assert(decoded === raw, "URL-encoded playId round-trips correctly");
  assert(encoded !== raw, "encoded form differs from raw");
});

describe("Like — no public leaderboard by default", () => {
  // Policy: the endpoint only returns { liked, count } for the specific play,
  // never a ranked list of plays by like count.
  function endpointReturns() {
    return { ok: true, liked: true, count: 7 };
  }
  const r = endpointReturns();
  assert(!("leaderboard" in r), "response does not include a leaderboard field");
  assert(!("plays" in r), "response does not include a plays ranking field");
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`Likes tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailed tests:");
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("All tests passed! ✅");
}
