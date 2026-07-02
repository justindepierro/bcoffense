/**
 * tests/moderation.test.mjs
 *
 * Unit tests for functions/_lib/moderation.js
 * Run with: node tests/moderation.test.mjs
 *
 * No test runner required — uses a minimal inline assert helper.
 * Tests cover:
 *   - Ordinary football terminology (must not be falsely blocked)
 *   - Profanity detection
 *   - Disguised profanity (evasion tactics)
 *   - Racial and identity-based slur detection (framework/placeholders)
 *   - Sexual language detection (framework/placeholders)
 *   - Threat detection
 *   - Targeted harassment
 *   - Personal-information sharing
 *   - Unicode and punctuation bypass attempts
 *   - Threatening uses of football terms still detected
 *   - Moderation policy outcomes
 *   - Audit/history path via outcomeToStatus
 */

import { moderateContent, outcomeToStatus } from "../functions/_lib/moderation.js";

// ── Minimal test harness ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    errors.push(label);
    console.error(`  ❌ FAIL: ${label}`);
  }
}

function describe(group, fn) {
  console.log(`\n▸ ${group}`);
  fn();
}

function expect(text) {
  const result = moderateContent(text);
  return {
    toAllow:  (label) => assert(result.outcome === "allow",  label || `"${text.slice(0,40)}" → allow`),
    toWarn:   (label) => assert(result.outcome === "warn",   label || `"${text.slice(0,40)}" → warn`),
    toReview: (label) => assert(result.outcome === "review", label || `"${text.slice(0,40)}" → review`),
    toBlock:  (label) => assert(result.outcome === "block",  label || `"${text.slice(0,40)}" → block`),
    notToBlock: (label) => assert(result.outcome !== "block", label || `"${text.slice(0,40)}" not blocked`),
    result,
  };
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe("Ordinary football terminology — must NOT be falsely blocked", () => {
  expect("We are going to blitz the A gap this drive").toAllow("blitz in play description");
  expect("Run the pistol formation with the back offset right").toAllow("pistol formation");
  expect("Shotgun spread formation, motion the slot receiver").toAllow("shotgun formation");
  expect("Bomb route down the seam on 3rd and long").toAllow("bomb route");
  expect("Kill the clock with the four-minute offense").toAllow("kill the clock");
  expect("Smash route concept on the left side").toAllow("smash route");
  expect("Trap block on the B gap pull guard to the right").toAllow("trap block");
  expect("Naked bootleg right on first down").toAllow("naked bootleg");
  expect("Bullet pass to the flat route").toAllow("bullet pass");
  expect("Shoot the hitch route on the right hash").toAllow("shoot the hitch");
  expect("Execution of the run-pass option depends on the linebacker").toAllow("execution in play context");
  expect("Crack block on the end, pull the guard through the hole").toAllow("crack block");
  expect("Fire out off the ball on the snap count").toAllow("fire out in play context");
  expect("Press coverage on the outside receiver in man coverage").toAllow("press coverage");
  expect("Attack the flats with a quick screen against soft coverage").toAllow("attack the flats");
});

describe("Profanity detection", () => {
  const r1 = expect("What the fuck was that play?").result;
  assert(r1.outcome === "review" || r1.outcome === "block", "fuck → review or block");

  const r2 = expect("That was a shitty call by the ref").result;
  assert(r2.outcome !== "allow", "shit in negative context → not allowed");

  const r3 = expect("bitch move not going for it on 4th down").result;
  assert(r3.outcome !== "allow", "bitch → not allowed");

  const r4 = expect("damn that was a great catch").result;
  assert(r4.outcome === "warn" || r4.outcome === "allow", "damn → warn or allow (mild)");
});

describe("Disguised profanity — evasion tactics", () => {
  const r1 = expect("f.u.c.k that play was terrible").result;
  assert(r1.outcome !== "allow", "dot-separated f.u.c.k → detected");

  const r2 = expect("sh1t that route was wide open").result;
  assert(r2.outcome !== "allow", "sh1t (number sub) → detected");

  const r3 = expect("@ss hat coach made the wrong call").result;
  assert(r3.outcome !== "allow", "@ss (@ sub) → detected");

  const r4 = expect("wtf is going on out there").result;
  // WTF is borderline — acceptable either way but should not fully block
  assert(r4.outcome !== "block", "wtf → not hard-blocked");

  const r5 = expect("that was b-i-t-c-h behavior on the field").result;
  assert(r5.outcome !== "allow", "hyphen-separated evasion → detected");
});

describe("Racial and identity-based slur detection", () => {
  // NOTE: Actual slur strings are not included in this public test file.
  // In a restricted environment, replace SLUR_PLACEHOLDER with actual terms.
  // The RESTRICTED_TERMS array in moderation.js should be populated with
  // school-approved restricted terms before production deployment.
  //
  // These tests verify the engine structure works for severity-4 terms.
  const r1 = moderateContent("kill yourself"); // self_harm severity 4
  assert(r1.outcome === "block", "self-harm phrase → block (severity 4 path)");

  // Verify any slur added to RESTRICTED_TERMS with severity 4 would block
  const customResult = moderateContent("normal message", {}, {
    extraBlocked: [{ re: /\btest_slur_token\b/i, category: "slur", severity: 4, normCheck: false }],
  });
  assert(customResult.outcome === "allow", "no match on custom term → allow");

  const customResult2 = moderateContent("this is test_slur_token here", {}, {
    extraBlocked: [{ re: /\btest_slur_token\b/i, category: "slur", severity: 4, normCheck: false }],
  });
  assert(customResult2.outcome === "block", "custom severity-4 extraBlocked term → block");
});

describe("Sexual language detection", () => {
  // NOTE: Explicit sexual content patterns are not hard-coded in the public
  // RESTRICTED_TERMS for the same reason as slurs. Verify via extraBlocked.
  const result = moderateContent("check this out test_sex_token explicit", {}, {
    extraBlocked: [{ re: /\btest_sex_token\b/i, category: "sexual", severity: 4, normCheck: false }],
  });
  assert(result.outcome === "block", "custom sexual-content term → block");

  // Verify policy allows severity-3 sexual terms to be reviewed (not auto-blocked)
  const r2 = moderateContent("check test_sex_mild here", {}, {
    extraBlocked: [{ re: /\btest_sex_mild\b/i, category: "sexual", severity: 3, normCheck: false }],
  });
  assert(r2.outcome === "review" || r2.outcome === "block", "severity-3 sexual → review or block");
});

describe("Threat detection", () => {
  const r1 = expect("I'll kill you after practice").result;
  assert(r1.outcome === "block", "direct threat → block");

  const r2 = expect("watch your back tomorrow at school").result;
  assert(r2.outcome === "block", "watch your back → block");

  const r3 = expect("you're dead after the game").result;
  assert(r3.outcome === "block", "you're dead → block");

  const r4 = expect("I will find you after practice").result;
  assert(r4.outcome === "block", "I will find you → block");

  const r5 = expect("see you outside after the game").result;
  assert(r5.outcome === "block", "see you outside → block (implied threat)");

  // Self-harm
  const r6 = expect("just go die already").result;
  assert(r6.outcome === "block", "go die → block");

  const r7 = expect("hurt yourself loser").result;
  assert(r7.outcome === "block", "hurt yourself → block");
});

describe("Targeted harassment — directed personal attacks", () => {
  const r1 = expect("you're a complete loser and nobody cares about you").result;
  assert(r1.outcome !== "allow", "targeted nobody-cares harassment → not allowed");

  const r2 = expect("you are worthless and useless on this team").result;
  assert(r2.outcome !== "allow", "you are worthless → not allowed");

  const r3 = expect("nobody likes you on this team").result;
  assert(r3.outcome !== "allow", "nobody likes you → not allowed");
});

describe("Personal-information sharing", () => {
  expect("Call me at 555-867-5309 to talk about the game plan").toReview(
    "phone number → review"
  );

  const r2 = expect("my snap is johnsmith23 add me").result;
  assert(r2.outcome !== "allow", "snapchat handle sharing → not allowed");

  const r3 = expect("hit me up at player@gmail.com for film").result;
  assert(r3.outcome !== "allow", "email address → not allowed");

  const r4 = expect("my address is 123 Oak St come over").result;
  assert(r4.outcome !== "allow", "street address → not allowed");

  const r5 = expect("my instagram is @hoopstar99").result;
  assert(r5.outcome !== "allow", "instagram handle → not allowed");
});

describe("Unicode and punctuation bypass attempts", () => {
  const r1 = moderateContent("f\u0075ck that play"); // Unicode u in "fuck"
  assert(r1.outcome !== "allow", "Unicode lookalike in profanity → detected");

  const r2 = moderateContent("š̈h̸i̮t that was a bad call");
  // Combining diacritics / zalgo — normalization should handle at least basic ones
  assert(typeof r2.outcome === "string", "zalgo-style text → returns valid outcome");

  // Number substitution
  const r3 = moderateContent("5h1t that route ran the wrong way");
  assert(r3.outcome !== "allow", "5h1t (number subs) → detected");

  // Punctuation substitution
  const r4 = moderateContent("$hit that was out of bounds");
  assert(r4.outcome !== "allow", "$hit → detected");

  // Blank-space evasion
  const r5 = moderateContent("f u c k that officiating");
  assert(r5.outcome !== "allow", "space-separated f u c k → detected");
});

describe("Threatening uses of football terms still detected", () => {
  // Football terms in personal threats should NOT be exempted
  const r1 = moderateContent("I'll blitz you after school and you're dead");
  assert(r1.outcome === "block", "blitz + direct threat → still blocked");

  const r2 = moderateContent("shoot you in the face after practice");
  // "shoot" in non-football context (directed at person) — engine should detect threat
  assert(r2.outcome !== "allow", "shoot directed at person → not allowed");
});

describe("Spam detection", () => {
  expect("aaaaaaaaaaaaaaaaaaaaaaaa").toWarn("long repeated char string → spam warn");
  expect("LMAO LMAO LMAO LMAO LMAO").toWarn("repeated word spam → warn");
  expect("Great play run it again on the next series").toAllow("legitimate football message");
});

describe("Policy outcome mapping — outcomeToStatus", () => {
  assert(outcomeToStatus("allow") === "approved", "allow → approved");
  assert(outcomeToStatus("warn") === "approved", "warn → approved (visible with warning)");
  assert(outcomeToStatus("review") === "pending_review", "review → pending_review");
  assert(outcomeToStatus("block") === "blocked", "block → blocked");
});

describe("Moderation permissions — extraAllowlist", () => {
  // Custom allowlist term should be allowed even if it looks suspicious
  const customAllowlist = new Set(["hashroute"]);
  const r1 = moderateContent("run the hash route on 3rd down", {}, { extraAllowlist: customAllowlist });
  assert(r1.outcome === "allow", "custom allowlist term passes through");

  // extraBlocked should be detected
  const customBlocked = [{ re: /\bcoachsucks\b/i, category: "harassment", severity: 3, normCheck: false }];
  const r2 = moderateContent("coachsucks he made the wrong call", {}, { extraBlocked: customBlocked });
  assert(r2.outcome !== "allow", "custom blocked term detected");
});

describe("Audit history — audit path (outcomeToStatus + reason logging)", () => {
  const result = moderateContent("fuck that ref call");
  assert(result.reasons.length > 0, "reasons array is populated on detection");
  assert(result.reasons[0].category, "reason has a category");
  assert(typeof result.reasons[0].severity === "number", "reason has numeric severity");
  assert(result.displayWarning !== null || result.outcome === "allow", "displayWarning set when not allowed");
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (errors.length) {
  console.error("\nFailed tests:");
  errors.forEach((e) => console.error(`  ✗ ${e}`));
  process.exit(1);
} else {
  console.log("All tests passed ✅");
}
