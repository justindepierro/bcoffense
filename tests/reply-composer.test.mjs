/**
 * Reply Composer Tests — Phase 8B.3 / 8B.18
 * Tests attachment state management, pending attachment lifecycle,
 * count limits, caption moderation bypass, and composer reset.
 *
 * Run with: node tests/reply-composer.test.mjs
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

// ── Pending Attachment State ─────────────────────────────────────────────────
// Mirror the _discPendingAttachments Map<composerId, attachment> from play-discussion.js

class MockPendingAttachments {
  constructor() { this._map = new Map(); }
  set(composerId, attachment) { this._map.set(composerId, attachment); }
  get(composerId) { return this._map.get(composerId) || null; }
  has(composerId) { return this._map.has(composerId); }
  delete(composerId) { return this._map.delete(composerId); }
  size() { return this._map.size; }
  clear() { this._map.clear(); }
}

describe("Pending attachment state — CRUD", () => {
  const pending = new MockPendingAttachments();

  assert(pending.size() === 0, "starts empty");
  assert(!pending.has("composer-1"), "composer-1 has no attachment initially");

  pending.set("composer-1", { id: "att1", type: "markup", r2_key: "disc-attachments/att1.jpg" });
  assert(pending.has("composer-1"), "composer-1 has pending attachment after set");
  assert(pending.get("composer-1").id === "att1", "retrieves correct attachment");

  pending.delete("composer-1");
  assert(!pending.has("composer-1"), "attachment removed after delete");
  assert(pending.size() === 0, "map empty after delete");
});

describe("Pending attachment state — composer isolation", () => {
  const pending = new MockPendingAttachments();

  pending.set("root-composer", { id: "att1", type: "image" });
  pending.set("reply-composer-p1", { id: "att2", type: "markup" });

  assert(pending.get("root-composer").id === "att1", "root composer attachment isolated");
  assert(pending.get("reply-composer-p1").id === "att2", "reply composer attachment isolated");
  assert(pending.size() === 2, "two independent composers tracked");

  pending.delete("root-composer");
  assert(!pending.has("root-composer"), "root composer cleared independently");
  assert(pending.has("reply-composer-p1"), "reply composer unaffected by root clear");
});

describe("Pending attachment state — clear on submit", () => {
  const pending = new MockPendingAttachments();
  pending.set("c1", { id: "att1", type: "markup" });

  // Simulate submit
  const attachData = pending.get("c1");
  pending.delete("c1");

  assert(attachData !== null, "attachment retrieved before submit");
  assert(!pending.has("c1"), "pending cleared after submit");
});

// ── Attachment Count Limits ──────────────────────────────────────────────────
// Max 1 attachment per post/reply

describe("Attachment count limit — one attachment per reply", () => {
  const MAX_ATTACHMENTS_PER_POST = 1;

  function canAddAttachment(existing) {
    return existing.length < MAX_ATTACHMENTS_PER_POST;
  }

  assert(canAddAttachment([]), "no attachments — can add");
  assert(!canAddAttachment([{ id: "a1" }]), "one attachment — cannot add another");
  assert(!canAddAttachment([{ id: "a1" }, { id: "a2" }]), "two attachments — cannot add (edge)");
});

describe("Attachment count limit — new upload replaces pending", () => {
  const pending = new MockPendingAttachments();

  // First upload
  pending.set("c1", { id: "att1", type: "markup", r2_key: "disc-attachments/att1.jpg" });
  assert(pending.get("c1").id === "att1", "first attachment stored");

  // Second upload replaces (set overwrites)
  pending.set("c1", { id: "att2", type: "image", r2_key: "disc-attachments/att2.jpg" });
  assert(pending.get("c1").id === "att2", "second attachment overwrites first");
  assert(pending.size() === 1, "still only one pending attachment per composer");
});

// ── Caption Validation ───────────────────────────────────────────────────────

describe("Caption validation — length", () => {
  const MAX_CAPTION_LEN = 500;

  function sanitizeCaption(raw) {
    if (!raw || typeof raw !== "string") return null;
    const trimmed = raw.trim().slice(0, MAX_CAPTION_LEN);
    return trimmed.length > 0 ? trimmed : null;
  }

  assert(sanitizeCaption("") === null, "empty string returns null");
  assert(sanitizeCaption("  ") === null, "whitespace-only returns null");
  assert(sanitizeCaption("Good caption") === "Good caption", "valid caption preserved");
  assert(sanitizeCaption("a".repeat(600)).length === 500, "long caption truncated to 500");
  assert(sanitizeCaption(null) === null, "null returns null");
  assert(sanitizeCaption(undefined) === null, "undefined returns null");
});

describe("Caption validation — moderation check mirrors upload endpoint", () => {
  // Mirrors moderateContent outcome check in upload.js
  function shouldBlockCaption(outcome) {
    return outcome === "block";
  }

  assert(!shouldBlockCaption("allow"),        "clean caption allowed");
  assert(!shouldBlockCaption("warn"),         "warned caption still allowed");
  assert(!shouldBlockCaption("pending_review"), "review-flagged caption allowed (coach)");
  assert(shouldBlockCaption("block"),          "blocked outcome rejects caption");
});

// ── Composer Reset ───────────────────────────────────────────────────────────

describe("Composer reset — after successful submit", () => {
  // Simulate composer state object
  const composer = {
    body: "Great question, here's the answer...",
    pendingAttach: { id: "att1", type: "markup" },
    isSubmitting: false,
  };

  function resetComposer(c) {
    return { body: "", pendingAttach: null, isSubmitting: false };
  }

  const fresh = resetComposer(composer);
  assert(fresh.body === "", "body cleared after reset");
  assert(fresh.pendingAttach === null, "pending attachment cleared");
  assert(fresh.isSubmitting === false, "submitting flag cleared");
});

describe("Composer reset — cancel clears pending attachment", () => {
  const pending = new MockPendingAttachments();
  pending.set("c1", { id: "att1", r2_key: "disc-attachments/att1.jpg" });

  function cancelComposer(composerId) {
    pending.delete(composerId);
  }

  cancelComposer("c1");
  assert(!pending.has("c1"), "pending attachment removed on cancel");
});

// ── Attachment Type Handling ─────────────────────────────────────────────────

describe("Attachment type — markup vs image distinction", () => {
  function buildAttachmentPayload(type, r2Key, sourcePlayId, caption) {
    if (type !== "markup" && type !== "image") return null;
    return {
      id: "test-uuid",
      type,
      r2_key: r2Key,
      sourcePlayId: type === "markup" ? sourcePlayId : null,
      caption: caption || null,
    };
  }

  const markup = buildAttachmentPayload("markup", "disc-attachments/m1.jpg", "play-123", "See this route");
  assert(markup !== null,                    "markup attachment built");
  assert(markup.type === "markup",           "type is markup");
  assert(markup.sourcePlayId === "play-123", "markup carries sourcePlayId");

  const image = buildAttachmentPayload("image", "disc-attachments/i1.jpg", "play-123", "Photo");
  assert(image !== null,              "image attachment built");
  assert(image.type === "image",      "type is image");
  assert(image.sourcePlayId === null, "image does not carry sourcePlayId");

  const invalid = buildAttachmentPayload("video", "disc-attachments/v1.mp4", null, null);
  assert(invalid === null, "invalid type returns null");
});

// ── File Size Gate (client-side mirror) ─────────────────────────────────────

describe("File size gate — client-side validation", () => {
  const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

  function validateSize(bytes) {
    if (bytes < 100) return "empty";
    if (bytes > MAX_BYTES) return "too_large";
    return "ok";
  }

  assert(validateSize(50) === "empty",       "< 100 bytes rejected as empty");
  assert(validateSize(9 * 1024 * 1024) === "too_large", "9 MB rejected");
  assert(validateSize(MAX_BYTES) === "ok",   "8 MB exactly accepted");
  assert(validateSize(1024 * 1024) === "ok", "1 MB accepted");
  assert(validateSize(100) === "ok",         "exactly 100 bytes accepted");
});

// ── Markup Overlay State ─────────────────────────────────────────────────────

describe("Markup overlay — tool state management", () => {
  const TOOLS = ["pen", "arrow", "circle", "eraser"];

  let activeTool = "pen";
  function setTool(tool) {
    if (!TOOLS.includes(tool)) return false;
    activeTool = tool;
    return true;
  }

  assert(setTool("arrow"),    "arrow tool selected");
  assert(activeTool === "arrow", "active tool is arrow");
  assert(setTool("eraser"),   "eraser selected");
  assert(!setTool("text"),    "unsupported tool rejected");
  assert(activeTool === "eraser", "active tool unchanged after invalid selection");
});

describe("Markup overlay — undo stack", () => {
  const strokes = [
    { points: [[0, 0], [1, 1]], color: "#ff0000" },
    { points: [[5, 5], [10, 10]], color: "#0000ff" },
    { points: [[20, 20], [25, 25]], color: "#00ff00" },
  ];

  function undo(stack) {
    if (stack.length === 0) return stack;
    return stack.slice(0, -1);
  }

  let stack = [...strokes];
  assert(stack.length === 3, "3 strokes in stack");
  stack = undo(stack);
  assert(stack.length === 2, "undo removes last stroke");
  stack = undo(stack);
  assert(stack.length === 1, "second undo removes another stroke");
  stack = undo(stack);
  assert(stack.length === 0, "third undo clears stack");
  stack = undo(stack);
  assert(stack.length === 0, "undo on empty stack is safe");
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
