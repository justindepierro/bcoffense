/**
 * Question Lifecycle Tests — Phase 9
 * Tests question state transitions, category validation, pin behavior,
 * position context lookups, deep-link URL generation, and coaching filters.
 *
 * Run with: node tests/questions.test.mjs
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

// ── Question State Machine ───────────────────────────────────────────────────

const VALID_STATES = ["open", "answered", "resolved", "reopened"];
const VALID_TRANSITIONS = {
  open:     ["answered", "resolved"],
  answered: ["resolved", "reopened"],
  resolved: ["reopened"],
  reopened: ["answered", "resolved"],
};

function canTransition(from, to) {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

describe("Question state machine — valid transitions", () => {
  assert(canTransition("open",     "answered"), "open → answered (coach posts official reply)");
  assert(canTransition("open",     "resolved"), "open → resolved (coach marks resolved)");
  assert(canTransition("answered", "resolved"), "answered → resolved");
  assert(canTransition("answered", "reopened"), "answered → reopened (player requests)");
  assert(canTransition("resolved", "reopened"), "resolved → reopened");
  assert(canTransition("reopened", "answered"), "reopened → answered");
});

describe("Question state machine — invalid transitions", () => {
  assert(!canTransition("open",     "open"),     "open → open invalid");
  assert(!canTransition("open",     "reopened"), "open → reopened invalid (use answered first)");
  assert(!canTransition("resolved", "answered"), "resolved → answered invalid");
  assert(!canTransition("reopened", "open"),     "reopened → open invalid");
  assert(!canTransition("answered", "open"),     "answered → open invalid");
});

describe("Question state machine — state badge display", () => {
  function stateBadge(state) {
    const MAP = {
      open:     { label: "Open",     cls: "disc-q-state--open"     },
      answered: { label: "Answered", cls: "disc-q-state--answered" },
      resolved: { label: "Resolved", cls: "disc-q-state--resolved" },
      reopened: { label: "Reopened", cls: "disc-q-state--reopened" },
    };
    return MAP[state] || null;
  }

  assert(stateBadge("open")?.label === "Open",         "open badge label");
  assert(stateBadge("answered")?.label === "Answered", "answered badge label");
  assert(stateBadge("resolved")?.label === "Resolved", "resolved badge label");
  assert(stateBadge("reopened")?.label === "Reopened", "reopened badge label");
  assert(stateBadge("unknown") === null,               "unknown state has no badge");
});

// ── Question Categories ──────────────────────────────────────────────────────

const VALID_CATEGORIES = [
  "assignment", "technique", "front", "coverage",
  "motion",     "protection", "read", "general",
];

describe("Question categories — valid set", () => {
  function isValidCategory(cat) {
    return VALID_CATEGORIES.includes(cat) || !cat; // empty = general
  }

  assert(isValidCategory("assignment"),  "assignment valid");
  assert(isValidCategory("technique"),   "technique valid");
  assert(isValidCategory("front"),       "front valid");
  assert(isValidCategory("coverage"),    "coverage valid");
  assert(isValidCategory("motion"),      "motion valid");
  assert(isValidCategory("protection"),  "protection valid");
  assert(isValidCategory("read"),        "read valid");
  assert(isValidCategory("general"),     "general valid");
  assert(isValidCategory(""),            "empty → treated as general");
  assert(!isValidCategory("video"),      "video not a valid category");
  assert(!isValidCategory("random"),     "random not a valid category");
  assert(VALID_CATEGORIES.length === 8,  "exactly 8 base categories");
});

// ── Official Answer Pinning ──────────────────────────────────────────────────

describe("Official answer — single pin per question", () => {
  // Simulate a question thread: only one reply can be is_official at a time
  const replies = [
    { id: "r1", is_official: false, body: "First reply" },
    { id: "r2", is_official: false, body: "Second reply" },
    { id: "r3", is_official: false, body: "Third reply" },
  ];

  function setOfficial(replies, targetId) {
    return replies.map((r) => ({ ...r, is_official: r.id === targetId }));
  }

  let pinned = setOfficial(replies, "r2");
  const officialCount = pinned.filter((r) => r.is_official).length;
  assert(officialCount === 1,                   "exactly one official reply");
  assert(pinned.find((r) => r.id === "r2")?.is_official, "r2 is pinned");
  assert(!pinned.find((r) => r.id === "r1")?.is_official, "r1 not pinned");

  // Replace: set r3 as official
  pinned = setOfficial(pinned, "r3");
  assert(pinned.find((r) => r.id === "r3")?.is_official,  "r3 is now pinned");
  assert(!pinned.find((r) => r.id === "r2")?.is_official, "r2 unpinned after replacement");
  assert(pinned.filter((r) => r.is_official).length === 1, "still exactly one official");
});

describe("Official answer — previous answer preserved in history", () => {
  // When a new reply is pinned, the old one is un-marked but still present in DB
  const history = [
    { id: "r1", is_official: false, was_official_at: 1000 },
    { id: "r2", is_official: true,  was_official_at: null },
  ];

  // After switching to r3, r2 is un-pinned but still in history
  const newHistory = history.map((r) => ({
    ...r,
    is_official: r.id === "r3",
    was_official_at: r.is_official ? Date.now() : r.was_official_at,
  }));

  assert(newHistory.find((r) => r.id === "r1") !== undefined, "r1 preserved in history");
  assert(newHistory.find((r) => r.id === "r2") !== undefined, "r2 preserved in history");
  assert(!newHistory.find((r) => r.is_official), "no pin set (r3 not in array here)");
});

// ── Player Position Context ──────────────────────────────────────────────────

describe("Player position context — roster lookup", () => {
  function getPlayerPosition(user, roster) {
    if (!user || user.role !== "player") return null;
    const label = (user.label || user.username || "").toLowerCase();
    const entry = roster.find((p) => p.name && p.name.toLowerCase() === label);
    return entry?.position ? String(entry.position).toUpperCase() : null;
  }

  const roster = [
    { name: "Justin Player",  position: "QB",  positionGroup: "skill"   },
    { name: "Marcus Run",     position: "RB",  positionGroup: "skill"   },
    { name: "Big Block",      position: "OT",  positionGroup: "linemen" },
    { name: "No Position",    position: "",    positionGroup: ""        },
  ];

  assert(getPlayerPosition({ role: "player",  label: "Justin Player" }, roster) === "QB",  "QB found by label");
  assert(getPlayerPosition({ role: "player",  label: "Marcus Run"    }, roster) === "RB",  "RB found by label");
  assert(getPlayerPosition({ role: "player",  label: "Big Block"     }, roster) === "OT",  "OT found by label");
  assert(getPlayerPosition({ role: "player",  label: "No Position"   }, roster) === null,  "empty position returns null");
  assert(getPlayerPosition({ role: "player",  label: "Unknown Name"  }, roster) === null,  "unmatched name returns null");
  assert(getPlayerPosition({ role: "coach",   label: "Justin Player" }, roster) === null,  "coach returns null");
  assert(getPlayerPosition({ role: "admin",   label: "Justin Player" }, roster) === null,  "admin returns null");
  assert(getPlayerPosition(null, roster) === null, "null user returns null");
});

describe("Player position context — case insensitive match", () => {
  function getPlayerPosition(user, roster) {
    if (!user || user.role !== "player") return null;
    const label = (user.label || user.username || "").toLowerCase();
    const entry = roster.find((p) => p.name && p.name.toLowerCase() === label);
    return entry?.position ? String(entry.position).toUpperCase() : null;
  }

  const roster = [{ name: "MARCUS RUN", position: "rb" }];
  assert(
    getPlayerPosition({ role: "player", label: "marcus run" }, roster) === "RB",
    "case-insensitive name match; position uppercased",
  );
});

// ── Deep Link URL Generation ─────────────────────────────────────────────────

describe("Deep link URL generation", () => {
  function makeQuestionLink(origin, pathname, playId, postId) {
    if (!playId || !postId) return null;
    return `${origin}${pathname}?disc=${encodeURIComponent(playId)}&post=${encodeURIComponent(postId)}`;
  }

  const url = makeQuestionLink("https://bcoffense.pages.dev", "/", "play-Gun-Trips-Y-Cross", "post-uuid-123");
  assert(url !== null, "URL generated");
  assert(url.includes("?disc="), "has ?disc= param");
  assert(url.includes("&post="), "has &post= param");
  assert(url.includes("play-Gun-Trips-Y-Cross"), "play ID in URL");
  assert(url.includes("post-uuid-123"), "post ID in URL");

  const nullUrl = makeQuestionLink("https://bcoffense.pages.dev", "/", null, "post-123");
  assert(nullUrl === null, "returns null when playId missing");

  const specialUrl = makeQuestionLink("https://example.com", "/", "play with spaces", "post/123");
  assert(specialUrl.includes("play%20with%20spaces"), "play ID URI-encoded");
  assert(specialUrl.includes("post%2F123"), "post ID URI-encoded");
});

describe("Deep link URL parsing", () => {
  function parseDeepLink(search) {
    try {
      const p = new URLSearchParams(search);
      return { playId: p.get("disc") || null, postId: p.get("post") || null };
    } catch (_) {
      return { playId: null, postId: null };
    }
  }

  const r1 = parseDeepLink("?disc=play-123&post=post-abc");
  assert(r1.playId === "play-123", "playId parsed from ?disc");
  assert(r1.postId === "post-abc", "postId parsed from ?post");

  const r2 = parseDeepLink("?tab=playbook");
  assert(r2.playId === null, "no disc param → null playId");
  assert(r2.postId === null, "no post param → null postId");

  const r3 = parseDeepLink("");
  assert(r3.playId === null, "empty search → null playId");
});

// ── Ask Coach Pre-selection ──────────────────────────────────────────────────

describe("Ask Coach button — question type pre-selection", () => {
  // Simulate the discAskCoachQuestion DOM operation
  const mockSelects = new Map();
  const mockTextareas = new Map();

  function mockComposer(playId, currentType = "comment") {
    mockSelects.set(playId, { value: currentType, eventFired: false });
    mockTextareas.set(playId, { focused: false, placeholder: "" });
  }

  function discAskCoachQuestion(playId) {
    const sel = mockSelects.get(playId);
    const ta  = mockTextareas.get(playId);
    if (sel) { sel.value = "question"; sel.eventFired = true; }
    if (ta)  { ta.focused = true; ta.placeholder = "What's your question? (Ctrl+Enter to post)"; }
  }

  mockComposer("play-test-1");
  discAskCoachQuestion("play-test-1");

  assert(mockSelects.get("play-test-1").value === "question",     "type select set to question");
  assert(mockSelects.get("play-test-1").eventFired === true,      "change event dispatched");
  assert(mockTextareas.get("play-test-1").focused === true,       "textarea focused");
  assert(
    mockTextareas.get("play-test-1").placeholder.includes("question"),
    "placeholder updated",
  );
});

// ── Coach Authorization ──────────────────────────────────────────────────────

describe("Coach authorization — who can post official answers", () => {
  function canMarkOfficial(role) {
    return role === "coach" || role === "admin";
  }

  assert(canMarkOfficial("coach"),  "coach can mark official");
  assert(canMarkOfficial("admin"),  "admin can mark official");
  assert(!canMarkOfficial("player"), "player cannot mark official");
  assert(!canMarkOfficial("guest"),  "guest cannot mark official");
  assert(!canMarkOfficial(null),     "null role cannot mark official");
});

describe("Coach authorization — who can resolve questions", () => {
  function canResolve(role) {
    return role === "coach" || role === "admin";
  }

  function canReopen(role, isAuthor) {
    // Players can request reopen on their own question; coaches can reopen any
    if (role === "coach" || role === "admin") return true;
    return isAuthor;
  }

  assert(canResolve("coach"),  "coach can resolve");
  assert(!canResolve("player"), "player cannot resolve");
  assert(canReopen("coach", false),  "coach can reopen");
  assert(canReopen("player", true),  "author player can reopen own question");
  assert(!canReopen("player", false), "non-author player cannot reopen");
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
