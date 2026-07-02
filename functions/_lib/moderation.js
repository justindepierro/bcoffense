/**
 * functions/_lib/moderation.js
 *
 * Server-side content moderation for team communications.
 * All rules run server-side — never expose restricted-term logic to clients.
 *
 * Outcomes:
 *   "allow"  — publish immediately
 *   "warn"   — publish but surface a warning to the author (mild profanity)
 *   "review" — hold for coach review (potential violation)
 *   "block"  — reject immediately (clear policy violation)
 */

// ── Default policy ────────────────────────────────────────────────────────────

const DEFAULT_POLICY = {
  mild_profanity: "warn",   // "warn" | "review" | "block"
  profanity: "review",      // severity 2
  slur: "block",            // always block
  sexual: "block",          // always block
  threat: "block",          // always block
  harassment: "review",     // severity 2-3
  self_harm: "block",
  personal_info: "review",
  spam: "warn",
};

// ── Normalization pipeline ────────────────────────────────────────────────────

/**
 * Normalize text for comparison — strips evasion tactics without destroying
 * legitimate football terminology for context checks.
 */
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    // Unicode accent normalization (visual lookalikes)
    .replace(/[àáâãäå]/g, "a").replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i").replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u").replace(/ñ/g, "n").replace(/ç/g, "c")
    .replace(/ß/g, "ss").replace(/ø/g, "o").replace(/æ/g, "ae")
    // Control characters (includes \n, \r — handles words split across lines)
    .replace(/[\x00-\x1F\x7F]/g, " ")
    // Number-for-letter substitutions
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
    .replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/8/g, "b")
    // Punctuation-for-letter substitutions
    .replace(/@/g, "a").replace(/!/g, "i").replace(/\$/g, "s")
    .replace(/\+/g, "t").replace(/\|/g, "i")
    // Collapse separating spaces and common punctuation
    .replace(/[\s\-_.,!?*|'"`;:~^]/g, "")
    // Collapse runs of 3+ repeated chars (s h i i i t → s h i t)
    .replace(/(.)\1{2,}/g, "$1$1");
}

/**
 * Strict normalization — same as normalize() but collapses ALL repeated chars
 * to 1. Catches repeat-padding evasion like "fuuuck" → "fuk" or "shhiit" → "shit".
 * Used as a secondary check alongside the standard normalize() path.
 */
function normalizeStrict(text) {
  return normalize(text).replace(/(.)\1+/g, "$1");
}

/**
 * Normalize each word individually while keeping spaces between them.
 * This catches dot/dash/special-char evasion within single words:
 *   "f.u.c.k" → "fuck"  (normalize strips dots)
 *   "$hit"    → "shit"  (normalize converts $ → s)
 *   "b-i-t-c-h" → "bitch" (normalize strips dashes)
 * The result can still be tested with word-boundary regexes.
 */
function normalizeWords(text) {
  return String(text || "")
    .split(/\s+/)
    .map((w) => normalize(w))
    .join(" ")
    .trim();
}

/** Strip \b word-boundary anchors from a regex for no-boundary substring matching. */
function noBoundaryRegex(re) {
  return new RegExp(re.source.replace(/\\b/g, ""), re.flags);
}

/** Normalize but keep spaces — for phrase and context matching. */
function normalizeSoft(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[àáâãäå]/g, "a").replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i").replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u").replace(/ñ/g, "n").replace(/ç/g, "c")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
    .replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/8/g, "b")
    .replace(/@/g, "a").replace(/!/g, "i").replace(/\$/g, "s")
    .replace(/\+/g, "t")
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/[\n\r]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Fuzzy matching ────────────────────────────────────────────────────────────

/**
 * Levenshtein distance between two strings.
 * Only checks up to distance maxDist for performance (returns maxDist+1 early).
 */
function levenshtein(a, b, maxDist = 2) {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const la = a.length, lb = b.length;
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    prev = curr;
  }
  return prev[lb];
}

/**
 * High-severity terms (severity 4) in their normalized form.
 * Used for fuzzy 1-edit-distance matching to catch deliberate misspellings.
 * Safeguard: words must be ≥ 4 chars and the edit distance must be exactly 1.
 *
 * NOTE: Actual slur terms must be maintained in restricted admin config and
 * are represented here as placeholders. Expand with school-approved list
 * before production deployment. Never commit actual slur terms to public repos.
 */
const FUZZY_BLOCKED = [
  // Format: { word: normalizedString, category: string, severity: 4 }
  // Only include severity-4 terms where 1-char misspellings are a known evasion.
  // { word: "...", category: "slur", severity: 4 },
];

/**
 * Check individual words from text for fuzzy proximity to high-severity terms.
 * Returns an array of matching { category, severity } objects.
 * Safeguards: min word length 4, max edit distance 1, word must not be in FOOTBALL_TERMS.
 */
function fuzzyCheckWords(text, extraAllowlist = new Set()) {
  if (!FUZZY_BLOCKED.length) return [];
  const matches = [];
  // Extract words (4+ chars) from the normalized text, keeping word boundaries
  const words = normalizeSoft(text).split(/\s+/).filter((w) => /^[a-z]{4,}$/.test(w));
  for (const raw of words) {
    const word = normalize(raw);
    if (!word || word.length < 4) continue;
    const strictWord = normalizeStrict(raw);
    // Skip if this word is in the football allowlist
    if (FOOTBALL_TERMS.has(word) || FOOTBALL_TERMS.has(strictWord) ||
        extraAllowlist.has(word) || extraAllowlist.has(strictWord)) continue;
    for (const entry of FUZZY_BLOCKED) {
      if (Math.abs(word.length - entry.word.length) > 1) continue; // length guard
      const dist = levenshtein(word, entry.word, 1);
      if (dist <= 1 && dist > 0) { // dist > 0 means it wasn't an exact match (already caught)
        matches.push({ category: entry.category, severity: entry.severity, pattern: `fuzzy:${entry.word}` });
        break;
      }
      // Also check the strict-normalized form (repeat-padding evasion)
      if (strictWord !== word && Math.abs(strictWord.length - entry.word.length) <= 1) {
        const strictDist = levenshtein(strictWord, entry.word, 1);
        if (strictDist <= 1) {
          matches.push({ category: entry.category, severity: entry.severity, pattern: `fuzzy-strict:${entry.word}` });
          break;
        }
      }
    }
  }
  return matches;
}

// ── Football context allowlist ────────────────────────────────────────────────

/**
 * Terms that appear commonly in football contexts.
 * When these appear in a PLAY DESCRIPTION context (no personal target), they
 * bypass the restricted-term check. When directed at a person, they do not.
 */
const FOOTBALL_TERMS = new Set([
  "blitz", "blitzkrieg", "pistol", "shotgun", "gun",
  "bomb", "bombard", "bullet", "bulletpass",
  "kill", "killtheclock", "killshot",
  "smash", "smashroute", "smashmouth",
  "crack", "crackblock", "cracksweep",
  "trap", "trapblock", "traprun",
  "naked", "nakedbootleg", "nakedpa",
  "shoot", "shooting", "shootout",
  "execution", "execute",
  "attack", "blitzing", "assassin",
  "destroy", "destruction",
  "murder", "murderedout",
  "hammer", "hammer route",
  "axe", "axeblock",
  "spike", "spikedplay",
  "slash", "slasher",
  "cutthroat", "cutblock",
  "spread", "spread offense",
  "press", "press coverage",
  "fire", "fireout", "hotroute",
  "reload", "shotgun reload",
  "torpedo", "rocket", "missile",
]);

/** Check if text is about football plays/formations, not directed at a person. */
function hasFootballContext(text) {
  const lower = text.toLowerCase();
  // Likely a play description or formation call
  const playCues = [
    /\b(formation|package|play|route|coverage|defense|front|motion|shift|call|protection|block|run|pass|rollout|bootleg|option|sweep|counter|draw|screen|corner|dig|cross|slant|hitch|curl|flat|seam)\b/i,
    /\b(first down|second down|third down|fourth down|red zone|goal line|two minute|two-minute)\b/i,
    /\b(quarterback|qb|rb|wr|te|ol|dl|lb|db|safety|corner|linebacker)\b/i,
    /\b(period|practice|drill|reps|install|game plan|script)\b/i,
  ];
  return playCues.some((re) => re.test(lower));
}

// ── Threat pattern detection ──────────────────────────────────────────────────

const THREAT_PATTERNS = [
  // Direct second-person threats
  /\b(i('ll|'m\s+gonna|'m\s+going\s+to|will|gonna))\s+\w{0,10}\s*(kill|hurt|beat\s+(?:up|down)|destroy|end|mess\s+(?:you|u)\s+up|jump)\s+(you|u)\b/i,
  /\b(you('re|re|r)\s+)(dead|done|finished|gonna\s+get\s+it|going\s+down|catching\s+these\s+hands)\b/i,
  /\bwatch\s+(your|ur)\s+back\b/i,
  /\bi('ll|'m\s+gonna|\s+will)\s+find\s+(you|u)\b/i,
  /\bcome\s+(for|after|get)\s+(you|u)\b/i,
  /\bsee\s+(you|u)\s+(outside|after|tomorrow|irl|in\s+real\s+life)\b/i,
  /\bdon('t|t)\s+show\s+up\s+(tomorrow|to\s+practice|at\s+school)\b/i,
  /\bshoot\s+(you|u|him|her)\b/i,   // "shoot you" directed at a person (not a route)
];

function detectThreat(text) {
  return THREAT_PATTERNS.some((p) => p.test(text));
}

// ── Personal information detection ───────────────────────────────────────────

const PI_PATTERNS = [
  /\b\d{3}[\-.\s]\d{3}[\-.\s]\d{4}\b/,          // phone number
  /\b\d{3}[\-.\s]\d{2}[\-.\s]\d{4}\b/,           // SSN pattern
  /\b\d{1,5}\s+[A-Za-z]+\s+(st|ave|blvd|rd|dr|ln|way|ct|pl)\b/i, // address
  /\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b/i,  // email
  /\b(snap|snapchat|insta|instagram|ig|twitter|tiktok|discord)\s*[:=@]\s*\w+/i,
  /\b(my\s+)?(number|address|snap|insta|ig|discord)\s+(is|:)\s*\S+/i,
  /\b(instagram|snap|ig|insta|tiktok|twitter|discord)\s+is\s+@?\w+/i, // "instagram is @handle"
];

function detectPersonalInfo(text) {
  return PI_PATTERNS.some((p) => p.test(text));
}

// ── Spam detection ────────────────────────────────────────────────────────────

function detectSpam(text) {
  const trimmed = text.trim();
  // All-same character repeated 15+ times (e.g. "aaaaaaaaaaaaaaaaaa")
  if (/^(.)\1{14,}$/.test(trimmed)) return true;
  // Repeated substring (3+ chars) appearing 4+ times
  if (/(.{3,})\1{3,}/i.test(trimmed)) return true;
  // Very long run of caps with few real words
  const wordsArr = trimmed.split(/\s+/);
  const capWords = wordsArr.filter((w) => /^[A-Z]+$/.test(w) && w.length > 1);
  if (capWords.length > 0 && capWords.length / wordsArr.length > 0.8 && wordsArr.length < 5) return true;
  return false;
}

// ── Restricted term dictionary ────────────────────────────────────────────────
// Terms are tested against both the original text and normalized form.
// Category options: profanity | slur | sexual | harassment | self_harm
// Severity: 1=mild warn, 2=warn/review, 3=review, 4=block

const RESTRICTED_TERMS = [
  // ── Profanity (severity 1-2) ─────────────────────────────────────────────
  { re: /\bfuck(ing|er|ed|s)?\b/i, category: "profanity", severity: 2, normCheck: true },
  { re: /\bsh[i!1]t(ty|s)?\b/i, category: "profanity", severity: 2, normCheck: true },
  { re: /\bb[i!1]tch(es|y)?\b/i, category: "profanity", severity: 2, normCheck: true },
  { re: /\ba(ss?)(hole|hat)?\b/i, category: "profanity", severity: 2, normCheck: true },
  { re: /\bdamn\b/i, category: "profanity", severity: 1, normCheck: false },
  { re: /\bcrap\b/i, category: "profanity", severity: 1, normCheck: false },
  { re: /\bpiss(ed|ing)?\b/i, category: "profanity", severity: 1, normCheck: false },
  { re: /\bcunt\b/i, category: "profanity", severity: 3, normCheck: true },
  { re: /\bdick(head)?\b/i, category: "profanity", severity: 2, normCheck: true },
  { re: /\bcock\b/i, category: "profanity", severity: 2, normCheck: true },

  // ── Slurs — identity-based (severity 4, always block) ───────────────────
  // NOTE: The actual slur list should be maintained in a restricted admin config.
  // The patterns below are representative. Expand with school/admin review before
  // production deployment. Never commit actual slur terms to public repositories.
  // { re: /\b<SLUR>\b/i, category: "slur", severity: 4, normCheck: true },

  // ── Sexual content (severity 3-4) ───────────────────────────────────────
  // NOTE: Explicit sexual content patterns should be maintained in a restricted
  // admin config. The engine supports them via the RESTRICTED_TERMS array.

  // ── Harassment / targeted insults (severity 2-3) ─────────────────────────
  { re: /\b(you('re|re|r|(\s+are?))\s+(a\s+)?(loser|moron|idiot|retard|worthless|useless|pathetic|garbage|trash))\b/i, category: "harassment", severity: 2, normCheck: true },
  { re: /\b(fat|ugly|nasty)\s+(pig|cow|dog|slob|piece\s+of|excuse\s+for)\b/i, category: "harassment", severity: 3, normCheck: true },
  { re: /\b(kill|hurt)\s+(yourself|urself)\b/i, category: "self_harm", severity: 4, normCheck: true },
  { re: /\b(go\s+die|hope\s+you\s+die)\b/i, category: "self_harm", severity: 4, normCheck: false },
  { re: /\b(nobody\s+)?(likes|cares\s+about)\s+(you|u)\b/i, category: "harassment", severity: 2, normCheck: false },
];

// ── Main moderation function ──────────────────────────────────────────────────

/**
 * Analyze text and return a moderation result.
 *
 * @param {string} text         — the raw post body
 * @param {object} [policy]     — override DEFAULT_POLICY keys
 * @param {object} [opts]       — runtime extensions
 *   opts.extraAllowlist  Set<string>  — normalized terms added to the football allowlist
 *   opts.extraBlocked    Array<{re,category,severity,normCheck?}> — additional restricted terms
 * @returns {{ outcome, category, severity, reasons, displayWarning }}
 *
 * outcome: "allow" | "warn" | "review" | "block"
 */
export function moderateContent(text, policy = {}, opts = {}) {
  const p = { ...DEFAULT_POLICY, ...policy };
  const extraAllowlist = opts.extraAllowlist instanceof Set ? opts.extraAllowlist : new Set();
  const extraBlocked = Array.isArray(opts.extraBlocked) ? opts.extraBlocked : [];
  const reasons = [];

  // ── 1. Length and spam ──────────────────────────────────────────────────
  if (!text || !text.trim()) {
    return { outcome: "allow", category: null, severity: 0, reasons: [], displayWarning: null };
  }

  if (detectSpam(text)) {
    reasons.push({ category: "spam", severity: 1, pattern: "repeated content" });
  }

  // ── 2. Personal information ─────────────────────────────────────────────
  if (detectPersonalInfo(text)) {
    reasons.push({ category: "personal_info", severity: 3, pattern: "personal information detected" });
  }

  // ── 3. Direct threat patterns ───────────────────────────────────────────
  if (detectThreat(text)) {
    reasons.push({ category: "threat", severity: 4, pattern: "direct threat detected" });
  }

  // ── 4. Football context check ───────────────────────────────────────────
  const isFootballContext = hasFootballContext(text);
  const normText = normalize(text);
  const strictText = normalizeStrict(text);
  const softText = normalizeSoft(text);

  // ── 5. Restricted term scan (standard + strict normalization) ────────────
  const wordNormText = normalizeWords(text); // each word normalized, spaces preserved
  const noBoundaryNormRe = new Map(); // lazy cache for no-boundary variants
  for (const entry of RESTRICTED_TERMS) {
    const testText = entry.normCheck ? normText : softText;
    const hitStandard = entry.re.test(testText) || entry.re.test(text);

    // For normCheck terms: also test normalizeWords (catches f.u.c.k, $hit, b-i-t-c-h)
    // and the joined normText with no word boundaries (catches space-separated f u c k).
    // The no-boundary match requires ≥ 4 chars to prevent matching short substrings
    // like "as" in "pass", "smash", "hash" — which would cause false positives.
    let hitWordNorm = false;
    let hitNoBoundary = false;
    if (entry.normCheck && !hitStandard) {
      hitWordNorm = entry.re.test(wordNormText);
      if (!hitWordNorm) {
        // Joined normText with word boundaries stripped (space-separated evasion)
        if (!noBoundaryNormRe.has(entry.re)) {
          noBoundaryNormRe.set(entry.re, noBoundaryRegex(entry.re));
        }
        const nbRe = noBoundaryNormRe.get(entry.re);
        const nbMatch = normText.match(nbRe);
        // Only accept if matched text is at least 4 chars (avoids "as" in "pass")
        if (nbMatch && nbMatch[0].length >= 4) hitNoBoundary = true;
      }
    }

    // Secondary check: strictly-normalized text catches repeat-padding evasion
    // e.g. "fuuuck" → normalizeStrict → "fuk"... only for normCheck terms
    const hitStrict = entry.normCheck && !hitStandard && !hitWordNorm && !hitNoBoundary
      && entry.re.test(strictText);
    if (!hitStandard && !hitWordNorm && !hitNoBoundary && !hitStrict) continue;

    // Football context exemption: allow severity < 4 football terms in play context
    if (entry.severity < 4 && isFootballContext) {
      const match = (text.match(entry.re) || normText.match(entry.re) || [""])[0];
      const matchNorm = normalize(match).replace(/\s/g, "");
      if (FOOTBALL_TERMS.has(matchNorm) || extraAllowlist.has(matchNorm)) continue;
    }

    reasons.push({ category: entry.category, severity: entry.severity, pattern: entry.category });
  }

  // ── 5b. Extra blocked terms (admin custom list) ──────────────────────────
  for (const entry of extraBlocked) {
    if (!entry.re || !entry.category || !entry.severity) continue;
    const testText = entry.normCheck ? normText : softText;
    if (!entry.re.test(testText) && !entry.re.test(text)) continue;
    if (entry.severity < 4 && isFootballContext) {
      const match = (text.match(entry.re) || normText.match(entry.re) || [""])[0];
      const matchNorm = normalize(match).replace(/\s/g, "");
      if (FOOTBALL_TERMS.has(matchNorm) || extraAllowlist.has(matchNorm)) continue;
    }
    reasons.push({ category: entry.category, severity: entry.severity, pattern: `custom:${entry.category}` });
  }

  // ── 5c. Fuzzy matching for deliberate misspellings (severity-4 terms only) ─
  if (!reasons.some((r) => r.severity >= 4)) {
    const fuzzyMatches = fuzzyCheckWords(text, extraAllowlist);
    for (const fm of fuzzyMatches) reasons.push(fm);
  }

  // ── 6. Determine outcome ────────────────────────────────────────────────
  if (!reasons.length) {
    return { outcome: "allow", category: null, severity: 0, reasons: [], displayWarning: null };
  }

  // Highest severity drives the outcome
  const maxSeverity = Math.max(...reasons.map((r) => r.severity));
  const primaryReason = reasons.find((r) => r.severity === maxSeverity);
  const category = primaryReason.category;

  let outcome;
  if (maxSeverity >= 4) {
    outcome = "block";
  } else if (maxSeverity === 3) {
    const policyOutcome = p[category] || "review";
    outcome = policyOutcome === "block" ? "block" : "review";
  } else if (maxSeverity === 2) {
    const policyOutcome = p[category] || "review";
    outcome = (policyOutcome === "block") ? "block" : (policyOutcome === "review" ? "review" : "warn");
  } else {
    // severity 1
    const policyOutcome = p[category] || "warn";
    outcome = policyOutcome === "block" ? "review" : "warn";
  }

  // Generate neutral display warning (doesn't reveal what was detected)
  let displayWarning = null;
  if (outcome === "warn") {
    displayWarning = "Your message may not meet team communication standards. Please review it before others see it.";
  } else if (outcome === "review") {
    displayWarning = "Your message is being reviewed before it's posted.";
  } else if (outcome === "block") {
    displayWarning = "Your message could not be posted because it violates team communication standards.";
  }

  return { outcome, category, severity: maxSeverity, reasons, displayWarning };
}

/**
 * Map moderation outcome to moderation_status column value.
 *
 * allow/warn → "approved" (visible immediately)
 * review     → "pending_review" (held for coach)
 * block      → "blocked" (never visible)
 */
export function outcomeToStatus(outcome) {
  if (outcome === "review") return "pending_review";
  if (outcome === "block") return "blocked";
  return "approved";
}
