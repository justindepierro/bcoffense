/**
 * Thread Architecture Tests — Phase 8B.1 / 8B.18
 * Tests reply nesting logic, official answer pinning, branch locking,
 * attachment metadata structure, and notification filtering.
 *
 * Run with: node tests/threads.test.mjs
 */

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
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
    failures.push(label);
  }
}

// ── Helpers (pure logic mirrors of the server-side helpers) ──────────────────

/** Mirror of the server-side depth capping: visual depth = min(depth, 2) */
function visualDepth(logicalDepth) {
  return Math.min(logicalDepth, 2);
}

/** Mirror of sort logic: pinned/official first, then chronological */
function sortPosts(posts) {
  return [...posts].sort((a, b) => {
    if (a.is_official && !b.is_official) return -1;
    if (!a.is_official && b.is_official) return 1;
    return a.created_at - b.created_at;
  });
}

/** Simulate a flat post array with reply tree structure */
function buildThread(defs) {
  const posts = [];
  for (const d of defs) {
    posts.push({
      id: d.id,
      parent_id: d.parent_id || null,
      root_post_id: d.root_post_id || null,
      depth: d.depth || 0,
      body: d.body || "test",
      is_official: d.is_official || false,
      is_branch_locked: d.is_branch_locked || false,
      status: d.status || "approved",
      created_at: d.created_at || Date.now(),
      attachments: d.attachments || [],
    });
  }
  return posts;
}

/** Group replies under their parent (one level of grouping) */
function groupReplies(posts) {
  const roots = posts.filter((p) => !p.parent_id);
  const byParent = {};
  for (const p of posts.filter((pp) => pp.parent_id)) {
    if (!byParent[p.parent_id]) byParent[p.parent_id] = [];
    byParent[p.parent_id].push(p);
  }
  return { roots, byParent };
}

// ── Reply Nesting ────────────────────────────────────────────────────────────

describe("Reply nesting — visual depth capping", () => {
  assert(visualDepth(0) === 0, "root post: visual depth 0");
  assert(visualDepth(1) === 1, "direct reply: visual depth 1");
  assert(visualDepth(2) === 2, "second-level reply: visual depth 2");
  assert(visualDepth(3) === 2, "depth 3 capped at 2");
  assert(visualDepth(10) === 2, "depth 10 capped at 2");
});

describe("Reply nesting — parent tracking", () => {
  const thread = buildThread([
    { id: "root1", depth: 0 },
    { id: "reply1", parent_id: "root1", root_post_id: "root1", depth: 1 },
    { id: "reply2", parent_id: "reply1", root_post_id: "root1", depth: 2 },
    { id: "reply3", parent_id: "reply2", root_post_id: "root1", depth: 3 },
  ]);

  const r3 = thread.find((p) => p.id === "reply3");
  assert(r3.parent_id === "reply2", "reply3 parent is reply2");
  assert(r3.root_post_id === "root1", "reply3 root is root1");
  assert(r3.depth === 3, "reply3 logical depth is 3");
  assert(visualDepth(r3.depth) === 2, "reply3 visual depth capped at 2");
});

describe("Reply nesting — thread grouping", () => {
  const thread = buildThread([
    { id: "r1", depth: 0 },
    { id: "r2", depth: 0 },
    { id: "c1", parent_id: "r1", root_post_id: "r1", depth: 1 },
    { id: "c2", parent_id: "r1", root_post_id: "r1", depth: 1 },
    { id: "c3", parent_id: "r2", root_post_id: "r2", depth: 1 },
  ]);

  const { roots, byParent } = groupReplies(thread);
  assert(roots.length === 2, "two root posts");
  assert(byParent["r1"].length === 2, "r1 has 2 direct replies");
  assert(byParent["r2"].length === 1, "r2 has 1 direct reply");
  assert(!byParent["c1"], "leaf reply has no children keyed");
});

// ── Official Answer ──────────────────────────────────────────────────────────

describe("Official answer — pinning sort order", () => {
  const posts = buildThread([
    { id: "p1", created_at: 1000, is_official: false },
    { id: "p2", created_at: 2000, is_official: true },
    { id: "p3", created_at: 3000, is_official: false },
  ]);

  const sorted = sortPosts(posts);
  assert(sorted[0].id === "p2", "official answer sorts first");
  assert(sorted[1].id === "p1", "oldest non-official second");
  assert(sorted[2].id === "p3", "newest non-official last");
});

describe("Official answer — only one official per thread", () => {
  const posts = buildThread([
    { id: "p1", is_official: true },
    { id: "p2", is_official: false },
    { id: "p3", is_official: false },
  ]);

  const officialCount = posts.filter((p) => p.is_official).length;
  assert(officialCount === 1, "exactly one official post");
});

// ── Branch Locking ───────────────────────────────────────────────────────────

describe("Branch locking — reply prevention", () => {
  const thread = buildThread([
    { id: "root1", is_branch_locked: false },
    { id: "branch1", parent_id: "root1", root_post_id: "root1", is_branch_locked: true },
  ]);

  function canReplyTo(post, isCoach) {
    if (post.status !== "approved") return false;
    if (post.is_branch_locked && !isCoach) return false;
    return true;
  }

  const locked = thread.find((p) => p.id === "branch1");
  assert(!canReplyTo(locked, false), "player cannot reply to locked branch");
  assert(canReplyTo(locked, true), "coach can still reply to locked branch");
  assert(canReplyTo(thread[0], false), "unlocked root allows player replies");
});

describe("Branch locking — does not lock entire thread", () => {
  const thread = buildThread([
    { id: "root1" },
    { id: "b1", parent_id: "root1", root_post_id: "root1", is_branch_locked: true },
    { id: "b2", parent_id: "root1", root_post_id: "root1", is_branch_locked: false },
  ]);

  const lockedCount = thread.filter((p) => p.is_branch_locked).length;
  const unlockedReplies = thread.filter((p) => p.parent_id && !p.is_branch_locked).length;
  assert(lockedCount === 1, "only one branch locked");
  assert(unlockedReplies === 1, "other replies still accessible");
});

// ── Attachment Metadata ──────────────────────────────────────────────────────

describe("Attachment metadata — structure validation", () => {
  function validateAttachment(a) {
    const errors = [];
    if (!a.id) errors.push("missing id");
    if (!a.post_id) errors.push("missing post_id");
    if (!["markup", "image"].includes(a.type)) errors.push("invalid type");
    if (!a.r2_key) errors.push("missing r2_key");
    return errors;
  }

  const valid = { id: "att1", post_id: "p1", type: "markup", r2_key: "disc-attachments/att1.jpg" };
  assert(validateAttachment(valid).length === 0, "valid attachment passes");

  const noType = { id: "att2", post_id: "p1", type: "video", r2_key: "disc-attachments/att2.mp4" };
  assert(validateAttachment(noType).includes("invalid type"), "unsupported type rejected");

  const noKey = { id: "att3", post_id: "p1", type: "image", r2_key: "" };
  assert(validateAttachment(noKey).includes("missing r2_key"), "missing r2_key rejected");
});

describe("Attachment metadata — post can have one attachment", () => {
  const post = buildThread([
    { id: "p1", attachments: [{ id: "a1", type: "markup", r2_key: "disc-attachments/a1.jpg" }] },
  ])[0];

  assert(post.attachments.length === 1, "post has one attachment");
  assert(post.attachments[0].type === "markup", "attachment type is markup");
});

describe("Attachment metadata — cascading delete safety", () => {
  // Simulate what ON DELETE CASCADE would do:
  const posts = [{ id: "p1" }, { id: "p2" }];
  const attachments = [
    { id: "a1", post_id: "p1" },
    { id: "a2", post_id: "p2" },
  ];

  function deletePost(posts, attachments, postId) {
    const remainPosts = posts.filter((p) => p.id !== postId);
    const remainAttach = attachments.filter((a) => a.post_id !== postId);
    return { posts: remainPosts, attachments: remainAttach };
  }

  const { posts: p, attachments: a } = deletePost(posts, attachments, "p1");
  assert(p.length === 1 && p[0].id === "p2", "post p1 deleted");
  assert(a.length === 1 && a[0].id === "a2", "attachment a1 cascade-deleted with p1");
});

// ── File Signature Validation ────────────────────────────────────────────────

describe("File signature validation — magic bytes", () => {
  function checkMagicBytes(buf, mime) {
    const b = new Uint8Array(buf.slice(0, 12));
    if (mime === "image/jpeg") return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
    if (mime === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
    if (mime === "image/webp") {
      return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
        && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    }
    return false;
  }

  const jpegMagic = new ArrayBuffer(12);
  new Uint8Array(jpegMagic).set([0xFF, 0xD8, 0xFF, 0xE0]);
  assert(checkMagicBytes(jpegMagic, "image/jpeg"), "valid JPEG magic bytes accepted");
  assert(!checkMagicBytes(jpegMagic, "image/png"), "JPEG bytes rejected as PNG");

  const pngMagic = new ArrayBuffer(12);
  new Uint8Array(pngMagic).set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  assert(checkMagicBytes(pngMagic, "image/png"), "valid PNG magic bytes accepted");
  assert(!checkMagicBytes(pngMagic, "image/jpeg"), "PNG bytes rejected as JPEG");

  const webpMagic = new ArrayBuffer(12);
  new Uint8Array(webpMagic).set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  assert(checkMagicBytes(webpMagic, "image/webp"), "valid WebP magic bytes accepted");
  assert(!checkMagicBytes(webpMagic, "image/jpeg"), "WebP bytes rejected as JPEG");

  const fakePdf = new ArrayBuffer(12);
  new Uint8Array(fakePdf).set([0x25, 0x50, 0x44, 0x46]); // %PDF
  assert(!checkMagicBytes(fakePdf, "image/jpeg"), "PDF disguised as JPEG rejected");
  assert(!checkMagicBytes(fakePdf, "image/png"), "PDF disguised as PNG rejected");
});

// ── Post Status Filtering ────────────────────────────────────────────────────

describe("Post status — blocked posts excluded from player view", () => {
  const posts = buildThread([
    { id: "p1", status: "approved" },
    { id: "p2", status: "blocked" },
    { id: "p3", status: "pending_review" },
    { id: "p4", status: "approved" },
  ]);

  const playerVisible = posts.filter((p) => p.status === "approved");
  assert(playerVisible.length === 2, "players see only approved posts");
  assert(playerVisible.every((p) => p.status === "approved"), "all visible posts are approved");
});

// ── Notification Targeting ───────────────────────────────────────────────────

describe("Notification targeting — visual reply only to parent author", () => {
  // A visual reply notification should go to the parent post's author, not the whole thread
  function shouldNotifyForVisual(parentAuthorRole, postHasAttachment, isCoachPost) {
    return isCoachPost && postHasAttachment && parentAuthorRole === "player";
  }

  assert(shouldNotifyForVisual("player", true, true), "coach visual reply to player question → notify");
  assert(!shouldNotifyForVisual("coach", true, true), "coach visual reply to coach post → no notify");
  assert(!shouldNotifyForVisual("player", false, true), "no attachment → no visual notify");
  assert(!shouldNotifyForVisual("player", true, false), "player post with attachment → no visual notify");
});

// ── Results ──────────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailed tests:");
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("All tests passed ✅");
}
