// ============================================================
// GAME PLAN CONSTRAINTS — Evaluation Engine
// Evaluates each call sheet bucket against your offensive vision.
//
// Toggle off entirely: set CONSTRAINTS_ENABLED = false
// Extend mappings: edit CALLSHEET_CONSTRAINTS below (no other changes needed)
// ============================================================

const CONSTRAINTS_ENABLED = true;

// ─────────────────────────────────────────────────────────────────────────────
// MASTER CONFIG — edit these to adjust rules and mappings
// ─────────────────────────────────────────────────────────────────────────────
const CALLSHEET_CONSTRAINTS = {
  // ── Global philosophy ──────────────────────────────────────────────────────
  global: {
    idealFeaturedCount: 10, // target plays per bucket ("top shelf")
    maxFeaturedCount: 14, // warning if bucket exceeds this
    minFeaturedCount: 4, // warning if bucket is too thin
  },

  // ── Role → player name mapping ─────────────────────────────────────────────
  // Keys match play.keyPlayer1/2/3 OR can match within basePlay/play strings.
  // Add new roles freely.
  roleMap: {
    X: "Marco", // X receiver → Marco
    H: "Jayce", // H / Slot → Jayce
    Z: "Jayce", // Z treated as Jayce/slot
    TE: "Danny", // TE / HB leak → Danny
    HB: "Danny", // HB checkdown → Danny
    QB: "Lucas", // QB keep / run play
  },

  // ── Play family keyword maps ───────────────────────────────────────────────
  // Each entry: { keywords: [...], family, category }
  // category: "quick" | "screen" | "dropback" | "pa" | "run" | "rpo" | "shot"
  familyMap: [
    // Quick game (high-percentage short passing)
    {
      keywords: ["smaug", "slant-flat", "slant flat"],
      family: "Smaug",
      category: "quick",
    },
    {
      keywords: ["syracuse", "double slant"],
      family: "Syracuse",
      category: "quick",
    },
    {
      keywords: ["queens", "mets", "spacing", "whip"],
      family: "Queens",
      category: "quick",
    },
    // Screens
    { keywords: ["whopper"], family: "Whopper", category: "screen" },
    {
      keywords: ["big mac", "bigmac", "double screen"],
      family: "Big Mac",
      category: "screen",
    },
    {
      keywords: ["michigan", "middle screen"],
      family: "Michigan",
      category: "screen",
    },
    // Dropback concepts
    { keywords: ["cross", "mesh"], family: "Cross", category: "dropback" },
    { keywords: ["sooners", "snag"], family: "Sooners", category: "dropback" },
    {
      keywords: ["pirate", "4 vert", "4vert", "four vert"],
      family: "Pirate",
      category: "dropback",
    },
    { keywords: ["warp", "whip rail"], family: "Warp", category: "dropback" },
    // Play action → can be shots if tagged
    { keywords: ["pa over", "p.a. over"], family: "PA Over", category: "pa" },
    { keywords: ["pa sail", "p.a. sail"], family: "PA Sail", category: "pa" },
    // Run families
    {
      keywords: ["golden state", "warriors", "curry", "klay"],
      family: "Wide Zone",
      category: "run",
    },
    { keywords: ["toronto", "raptors"], family: "Toss", category: "run" },
    { keywords: ["hulk", "batman"], family: "Power", category: "run" },
    { keywords: ["irish", "lucky"], family: "Counter", category: "run" },
    { keywords: ["packers"], family: "Packers", category: "run" },
    { keywords: ["toledo"], family: "Toledo", category: "run" },
    { keywords: ["alpha"], family: "Alpha", category: "run" },
    { keywords: ["laredo", "maverick"], family: "Jet", category: "run" },
    { keywords: ["hammer", "mallet"], family: "Hammer", category: "run" },
    { keywords: ["trash", "lid"], family: "Trash", category: "run" },
    { keywords: ["crab", "claw"], family: "Crab", category: "run" },
    { keywords: ["deer", "lizard"], family: "Keeper", category: "run" },
    { keywords: ["follow"], family: "Follow", category: "run" },
    // RPO
    { keywords: ["rpo"], family: "RPO", category: "rpo" },
  ],

  // ── Shot marriage rule ─────────────────────────────────────────────────────
  // Shots (PA, deep dropback) are ideally "married" to these run families.
  // Warn if shots appear far from their partner in 1st down / 2nd medium.
  shotPartnerFamilies: ["Wide Zone", "Power"],

  // ── Plays that indicate a QB run (for Lucas touch tracking) ───────────────
  qbRunKeywords: [
    "keeper",
    "keep",
    "qb draw",
    "qb sneak",
    "deer",
    "lizard",
    "nakd",
    "naked",
    "boot",
    "rollout",
  ],

  // ── Weighted touch distribution ────────────────────────────────────────────
  // Key Player 1 = primary read / ball carrier (highest weight)
  // Key Player 2 = secondary read / option
  // Key Player 3 = tertiary option / check-down
  touchWeights: [3, 2, 1], // KP1, KP2, KP3 point values

  // ── Per-bucket rules ───────────────────────────────────────────────────────
  // Each entry can override any global default.
  // targetRun/targetThrow are ratios (not counts); both should sum to 10
  // maxScreens: maximum number of screen plays before a warning fires
  // required: array of required checks (see CONSTRAINT_CHECKS below)
  // philosophy: free-text description shown in the UI
  bucketRules: {
    "1st-down": {
      targetRun: 6,
      targetThrow: 4,
      maxScreens: 2,
      wantShots: true,
      philosophy:
        "Ground it. Win the down. 1 shot concept married to run game.",
      required: ["marco", "jayce", "danny", "lucas-run", "shot-paired"],
    },
    "p-and-10": {
      targetRun: 6,
      targetThrow: 4,
      maxScreens: 2,
      philosophy: "Treat like 1st down principles.",
      required: ["marco", "jayce", "danny"],
    },
    "2nd-medium": {
      targetRun: 5,
      targetThrow: 5,
      maxScreens: 2,
      wantShots: false,
      philosophy: "Balance. Keep the offense moving. Screens can live here.",
      required: ["marco", "jayce", "danny"],
    },
    "2nd-long": {
      targetRun: 4,
      targetThrow: 6,
      maxScreens: 1,
      philosophy:
        "Attack with quick game and RPOs. Limit screens as primary plan.",
      required: ["marco", "jayce"],
    },
    "3rd-short-1-3": {
      targetRun: 7,
      targetThrow: 3,
      maxScreens: 1,
      philosophy: "Power the ball. Short yardage. QB sneak / power run leads.",
      required: ["lucas-run"],
    },
    "3rd-short-2down": {
      targetRun: 7,
      targetThrow: 3,
      maxScreens: 1,
      philosophy: "Same as 3rd & short. Must have QB run or power concept.",
      required: ["lucas-run"],
    },
    "3rd-medium": {
      targetRun: 2,
      targetThrow: 8,
      maxScreens: 0,
      requireCross: true,
      philosophy:
        "Cross (mesh) is the identity play. Need Smaug (Cover 0 answer). No screens.",
      required: ["cross-concept", "cover0-answer", "marco"],
    },
    "3rd-long": {
      targetRun: 1,
      targetThrow: 9,
      maxScreens: 1,
      philosophy:
        "Move the chains with quick / RPO. Screens are OK but not primary.",
      required: ["marco", "jayce"],
    },
    "2-minute": {
      targetRun: 1,
      targetThrow: 9,
      maxScreens: 2,
      philosophy: "Uptempo pass. Quick game, short completions, get OOB.",
      required: ["marco", "jayce", "danny"],
    },
    "4-minute": {
      targetRun: 8,
      targetThrow: 2,
      maxScreens: 1,
      philosophy: "Kill the clock. Run heavy. Low risk.",
      required: ["lucas-run"],
    },
    "rz-20": {
      targetRun: 5,
      targetThrow: 5,
      maxScreens: 1,
      philosophy: "Balanced RZ attack. Open things up with motion.",
    },
    "rz-10": {
      targetRun: 5,
      targetThrow: 5,
      maxScreens: 1,
      philosophy: "Condensed space. High-percentage throws. Power runs.",
      required: ["marco", "danny"],
    },
    "rz-5": {
      targetRun: 6,
      targetThrow: 4,
      maxScreens: 0,
      philosophy: "Score. Power / QB sneak available. Quick WR to end zone.",
      required: ["marco", "lucas-run"],
    },
    "goal-line": {
      targetRun: 8,
      targetThrow: 2,
      maxScreens: 0,
      philosophy: "Power the ball. Must have QB sneak option.",
      required: ["lucas-run"],
    },
    "backed-up": {
      targetRun: 5,
      targetThrow: 5,
      maxScreens: 0,
      philosophy: "Low risk. Stay away from own end zone. No gadgets.",
    },
    saigon: {
      targetRun: 0,
      targetThrow: 10,
      maxScreens: 0,
      philosophy: "Hail Mary / miracle plays only.",
    },
    openers: {
      targetRun: 5,
      targetThrow: 5,
      maxScreens: 1,
      wantShots: true,
      philosophy:
        "Set the tone. Best play from every family. A shot/PA opener is a plus.",
    },
    "must-haves": {
      targetRun: 5,
      targetThrow: 5,
      maxScreens: 2,
      philosophy:
        "Core identity plays. Should reflect your whole offensive philosophy.",
      required: ["marco", "jayce", "danny", "lucas-run"],
    },
    "short-yardage": {
      targetRun: 8,
      targetThrow: 2,
      maxScreens: 0,
      philosophy: "Physical short-yardage. Power / QB run leads.",
      required: ["lucas-run"],
    },
    "4th-down": {
      targetRun: 4,
      targetThrow: 6,
      maxScreens: 0,
      philosophy: "Must-convert plays. Best versions of every weapon.",
      required: ["marco", "jayce", "lucas-run"],
    },
    "perimeter-screens": {
      targetRun: 0,
      targetThrow: 10,
      maxScreens: 99,
      philosophy: "Screen-specific bucket. All plays should be screens.",
    },
    screen: {
      targetRun: 0,
      targetThrow: 10,
      maxScreens: 99,
      philosophy: "Screen-specific bucket.",
    },
    "base-run": {
      targetRun: 10,
      targetThrow: 0,
      maxScreens: 0,
      philosophy: "Run-only bucket. All runs.",
    },
    "run-options": {
      targetRun: 8,
      targetThrow: 2,
      maxScreens: 0,
      philosophy: "Run options / RPO zone.",
    },
    "base-pass": {
      targetRun: 0,
      targetThrow: 10,
      maxScreens: 1,
      philosophy: "Dropback pass bucket.",
    },
    quick: {
      targetRun: 0,
      targetThrow: 10,
      maxScreens: 0,
      philosophy: "Quick game only. Smaug and Syracuse leads.",
      required: ["cover0-answer"],
    },
    "play-action": {
      targetRun: 0,
      targetThrow: 10,
      maxScreens: 0,
      wantShots: true,
      philosophy: "PA concepts married to run game.",
      required: ["shot-paired"],
    },
    rpos: {
      targetRun: 0,
      targetThrow: 10,
      maxScreens: 0,
      philosophy: "RPO only bucket.",
    },
    movement: {
      targetRun: 0,
      targetThrow: 10,
      maxScreens: 0,
      philosophy: "Movement pass / sprint-out bucket.",
    },
    // Player-specific buckets use player name keys below
    player1: {
      targetRun: 3,
      targetThrow: 7,
      maxScreens: 1,
      philosophy: "Lucas-specific plays. QB run options required.",
      required: ["lucas-run"],
    },
    player2: {
      targetRun: 2,
      targetThrow: 8,
      maxScreens: 1,
      philosophy: "Marco-specific plays. Needs variety of routes.",
      required: ["marco"],
    },
    player3: {
      targetRun: 2,
      targetThrow: 8,
      maxScreens: 1,
      philosophy: "Receiver-specific plays.",
    },
    player4: {
      targetRun: 2,
      targetThrow: 8,
      maxScreens: 1,
      philosophy: "Danny-specific plays. Checkdown / TE concepts.",
      required: ["danny"],
    },
    player5: {
      targetRun: 2,
      targetThrow: 8,
      maxScreens: 1,
      philosophy: "Slot-specific plays.",
    },
    "2-point": {
      targetRun: 4,
      targetThrow: 6,
      maxScreens: 0,
      philosophy: "Must-score 2-point plays.",
    },
    gbot: {
      targetRun: 5,
      targetThrow: 5,
      maxScreens: 0,
      philosophy: "Gadget / trick / special plays.",
    },
    "last-plays": {
      targetRun: 3,
      targetThrow: 7,
      maxScreens: 0,
      philosophy: "Emergency plays — last-chance scripts.",
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PLAY CATEGORIZATION
// Takes a call sheet play object and returns a rich classification object.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a string for keyword matching.
 * @param {string|undefined} s
 * @returns {string}
 */
function _normalize(s) {
  return (s || "").toLowerCase().trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// VISION-MODE OVERLAY
// When Vision Mode is on, swap roleMap and extend familyMap from VISION_2026.
// All other constraints behavior is unchanged unless a rule explicitly opts in.
// ─────────────────────────────────────────────────────────────────────────────
function _visionOn() {
  return typeof isVisionMode === "function" && isVisionMode();
}

// Active role map (vision swaps positions: X=Diego, Y=Alex, Z=Jayce, T=Marco, H=Danny)
function _activeRoleMap() {
  if (!_visionOn() || typeof VISION_2026 === "undefined")
    return CALLSHEET_CONSTRAINTS.roleMap;
  const v = VISION_2026.yellow && VISION_2026.yellow.bodies;
  if (!v) return CALLSHEET_CONSTRAINTS.roleMap;
  return {
    X: v.X || "Diego",
    Y: v.Y || "Alex",
    Z: v.Z || "Jayce",
    T: v.T || "Marco",
    H: v.H || "Danny",
    TE: v.H || "Danny",
    HB: v.H || "Danny",
    QB: CALLSHEET_CONSTRAINTS.roleMap.QB || "Lucas",
  };
}

// Active family map — vision adds picture-tagged entries from VISION_2026.pictures
let _VISION_FAMILY_CACHE = null;
function _activeFamilyMap() {
  if (!_visionOn()) return CALLSHEET_CONSTRAINTS.familyMap;
  if (_VISION_FAMILY_CACHE) return _VISION_FAMILY_CACHE;
  if (typeof VISION_2026 === "undefined")
    return CALLSHEET_CONSTRAINTS.familyMap;
  // Picture-tagged keyword extensions (in addition to base familyMap entries)
  const visionAdds = [
    // Wide Zone Picture
    { keywords: ["worm", "wolf"], family: "Wide Zone", category: "run", picture: "wideZone" },
    { keywords: ["split wz", "slice wz"], family: "Wide Zone", category: "run", picture: "wideZone" },
    { keywords: ["naked", "boot", "waggle"], family: "Movement Pass", category: "pa", picture: "wideZone" },
    { keywords: ["sail", "flood"], family: "Sail/Flood", category: "dropback", picture: "wideZone" },
    // Pullers / Counter Picture
    { keywords: ["rebel"], family: "Counter", category: "run", picture: "pullers" },
    { keywords: ["bash"], family: "BASH", category: "run", picture: "pullers" },
    { keywords: ["rodgers", "lamar"], family: "Tunnel/Influence", category: "screen", picture: "pullers" },
    // Downhill / ISO / Wrap Picture
    { keywords: ["beaver", "beetle"], family: "ISO/Wrap", category: "run", picture: "downhill" },
    { keywords: ["cavs"], family: "Cavs", category: "run", picture: "downhill" },
    { keywords: ["golf"], family: "Golf", category: "run", picture: "downhill" },
    // Anti-front Picture
    { keywords: ["crunch", "san fran", "niners"], family: "Crunch", category: "run", picture: "antiFront" },
    // X-Middle as a screen
    { keywords: ["x middle", "xmiddle"], family: "X Middle", category: "screen" },
  ];
  _VISION_FAMILY_CACHE = [...visionAdds, ...CALLSHEET_CONSTRAINTS.familyMap];
  return _VISION_FAMILY_CACHE;
}

// Vision "why this works here" notes per bucket
const _VISION_BUCKET_NOTES = {
  "1st-down":
    "Win the down on the ground. Wide Zone spine + 1 earned shot married to run.",
  "p-and-10": "Treat like 1st down — Wide Zone spine, conflict throw built in.",
  "2nd-medium":
    "Balance: keep the offense moving. Conflict throws (Golden State / Irish) live here.",
  "2nd-long":
    "Quick game and RPOs to stay on schedule. Limit screens as primary plan.",
  "3rd-short-1-3":
    "Power the ball. QB run threat (Crab/Rebel/Cavs) and Toledo trap.",
  "3rd-short-2down":
    "Same as 3rd & short — must have QB run or downhill power.",
  "3rd-medium":
    "Cross / Trail / Railroad family is the identity. Earned Smaug for Cover 0.",
  "3rd-long":
    "Crow / Mets / Queens and Dagger / Sail / Bench. Max protect 'outside wins.'",
  "2-minute":
    "Uptempo Yellow personnel: Crow, Warp, Trail. Get OOB. Don't tip pass.",
  "4-minute": "Kill clock. Wide Zone spine + Toledo / Maverick anti-front.",
  "rz-20":
    "Fringe (25–20). Balanced — open it up with motion, condense the field.",
  "rz-10":
    "High Red Zone. High-percentage throws + downhill power. Earned PA shot.",
  "rz-5":
    "Low Red Zone. Quick to end zone, power, QB sneak option.",
  "goal-line":
    "5 and in. Power the ball. QB sneak option and Crab/Rebel must exist.",
  "backed-up": "Saigon: stay safe. No gadgets. Wide Zone + Naked/Boot only.",
  saigon: "-1 to -10. Get out. Low risk, no dropback longer than 3-step.",
  openers:
    "Set the tone. One shot from the Four Pictures. Earned Variation if rep'd.",
  "must-haves":
    "Reflect the whole offense: WZ, Counter, Downhill, Anti-front + screens.",
  "short-yardage":
    "Crab, Rebel, Cavs, Toledo. QB run or downhill power must lead.",
  "4th-down":
    "Best version of every weapon. Yellow conversions live here.",
  "perimeter-screens":
    "Big Mac / Whopper / Rodgers / Lamar. Weekly screen package.",
  screen:
    "Big Mac / Whopper / Rodgers / Lamar / Michigan / X Middle. Plus optional trap-pass.",
  "base-run": "Wide Zone spine first. Then Counter, Downhill, Anti-front.",
  "run-options": "RPO module: Hulk, Packers, Lucky/Irish, Golf, Maverick, Toledo.",
  "base-pass": "Cross / Trail / Railroad / Crow / Queens / Dagger / Sail.",
  quick: "Smaug + Hawaii leads. Variations called only after they're earned.",
  "play-action":
    "Married to Wide Zone or Power. Naked/Boot/Waggle live here.",
  rpos: "Hulk, Packers, Lucky/Irish, Golf, Maverick, Toledo.",
  movement: "Naked/Boot/Waggle + Sprint protections. Movement pass only.",
};

/**
 * Detect base→variation pairs and earned-shot violations.
 * Returns array of warning strings.
 */
function _visionVariationWarnings(plays) {
  if (!_visionOn() || typeof VISION_2026 === "undefined") return [];
  const warnings = [];
  const text = plays
    .map((p) =>
      [p.play, p.basePlay, p.playTag1, p.playTag2, p.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    )
    .join(" || ");
  // Smaug/Hawaii base→variation rules
  const pairs = [
    {
      variationKw: ["sluggo", "smaug variation", "smaug var"],
      baseKw: ["smaug", "slant-arrow", "slant arrow"],
      label: "Smaug Variation (Sluggo–Seam–Wheel)",
      base: "Smaug (Slant–Arrow)",
    },
    {
      variationKw: ["hitch-and-go", "hitch and go", "hawaii variation"],
      baseKw: ["hawaii", "all hitch"],
      label: "Hawaii Variation (Hitch-and-go)",
      base: "Hawaii (All Hitch)",
    },
    {
      variationKw: ["stutter-go", "stutter go", "eagles pump"],
      baseKw: ["eagles", "bubble"],
      label: "Eagles pump stutter-go",
      base: "Eagles (bubble)",
    },
  ];
  pairs.forEach((p) => {
    const hasVar = p.variationKw.some((k) => text.includes(k));
    const hasBase = p.baseKw.some((k) => text.includes(k));
    if (hasVar && !hasBase) {
      warnings.push(
        `⚠️ ${p.label} called without its base (${p.base}) — Variation must be earned`,
      );
    }
  });
  return warnings;
}

/**
 * Detect directional gap-rule duplicates (right-handed offense).
 * If both a rule's base call and its mirror direction appear, warn.
 */
function _visionDirectionalWarnings(plays) {
  if (!_visionOn() || typeof VISION_2026 === "undefined") return [];
  const warnings = [];
  const allText = plays
    .map((p) =>
      [p.play, p.basePlay, p.playTag1, p.playTag2]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    )
    .join(" || ");
  // Right-handed: warn if Power LEFT or Counter RIGHT appears as a base call
  const wrongDir = [
    { kw: ["power left", "georgia left"], expected: "Power → right (Georgia)" },
    { kw: ["counter right", "ali right"], expected: "Counter → left (Ali)" },
    { kw: ["deer left"], expected: "Deer → right (hammer run)" },
  ];
  wrongDir.forEach((w) => {
    if (w.kw.some((k) => allText.includes(k))) {
      warnings.push(
        `⚠️ Directional rule: ${w.expected}. Dress up direction via formation/motion instead.`,
      );
    }
  });
  return warnings;
}

/**
 * Check a list of keyword strings against a set of text fields from a play.
 * @param {string[]} keywords
 * @param {string[]} texts - lower-cased play text fields
 * @returns {boolean}
 */
function _matchesKeywords(keywords, texts) {
  return keywords.some((kw) => texts.some((t) => t.includes(kw)));
}

/**
 * Categorize a single play into its family, risk level, and touch targets.
 * @param {Object} play - a call sheet play object
 * @returns {Object} classification
 */
function categorizePlay(play) {
  const textFields = [
    _normalize(play.play),
    _normalize(play.basePlay),
    _normalize(play.playTag1),
    _normalize(play.playTag2),
    _normalize(play.formation),
    _normalize(play.notes),
  ];

  const typeRaw = _normalize(play.type || "");

  // ── Determine family ───────────────────────────────────────────────────────
  let matchedFamily = "unknown";
  let matchedCategory = "unknown";
  for (const entry of _activeFamilyMap()) {
    if (_matchesKeywords(entry.keywords, textFields)) {
      matchedFamily = entry.family;
      matchedCategory = entry.category;
      break;
    }
  }

  // Fallback to play.type if family still unknown
  if (matchedCategory === "unknown") {
    if (typeRaw.includes("run")) matchedCategory = "run";
    else if (typeRaw.includes("screen")) matchedCategory = "screen";
    else if (typeRaw.includes("quick")) matchedCategory = "quick";
    else if (typeRaw.includes("rpo")) matchedCategory = "rpo";
    else if (typeRaw.includes("play action") || typeRaw.includes("pa"))
      matchedCategory = "pa";
    else if (typeRaw.includes("pass") || typeRaw.includes("drop"))
      matchedCategory = "dropback";
  }

  // ── Is it a run? ───────────────────────────────────────────────────────────
  const isRun = matchedCategory === "run" || typeRaw.includes("run");
  const isScreen = matchedCategory === "screen" || typeRaw.includes("screen");
  const isPA =
    matchedCategory === "pa" ||
    typeRaw.includes("play action") ||
    typeRaw.includes("p.a.");
  const isQuick = matchedCategory === "quick" || typeRaw.includes("quick");
  const isRPO = matchedCategory === "rpo" || typeRaw.includes("rpo");
  const isShot =
    isPA ||
    (typeRaw.includes("drop") &&
      textFields.some(
        (t) =>
          t.includes("pirate") ||
          t.includes("4 vert") ||
          t.includes("seam") ||
          t.includes("post") ||
          t.includes("go") ||
          t.includes("corner shot"),
      ));

  // ── Is it a QB run? ───────────────────────────────────────────────────────
  const isQBRun = CALLSHEET_CONSTRAINTS.qbRunKeywords.some((kw) =>
    textFields.some((t) => t.includes(kw)),
  );

  // ── Touch inference ───────────────────────────────────────────────────────
  // Look at keyPlayer1/2/3 and map to role names via roleMap
  const touches = new Set();
  const roleMap = _activeRoleMap();
  [play.keyPlayer1, play.keyPlayer2, play.keyPlayer3].forEach((kp) => {
    if (!kp) return;
    const k = kp.trim().toUpperCase();
    if (roleMap[k]) touches.add(roleMap[k]);
    // Also accept direct player names
    Object.values(roleMap).forEach((v) => {
      if (_normalize(kp).includes(_normalize(v))) touches.add(v);
    });
  });

  // Also scan play name for role keywords
  Object.entries(roleMap).forEach(([role, player]) => {
    if (textFields.some((t) => t.includes(role.toLowerCase()))) {
      touches.add(player);
    }
  });

  // Mark QB touch
  if (isQBRun) touches.add(roleMap["QB"] || "Lucas");

  // ── Weighted touch distribution ───────────────────────────────────────────
  // Uses keyPlayerName1/2/3 directly (more reliable), with position→roleMap
  // fallback. Each priority slot has a different weight.
  const weights = CALLSHEET_CONSTRAINTS.touchWeights || [3, 2, 1];
  const weightedTouches = {}; // { playerName: totalWeight }
  const kpSlots = [
    { pos: play.keyPlayer1, name: play.keyPlayerName1, w: weights[0] || 3 },
    { pos: play.keyPlayer2, name: play.keyPlayerName2, w: weights[1] || 2 },
    { pos: play.keyPlayer3, name: play.keyPlayerName3, w: weights[2] || 1 },
  ];
  kpSlots.forEach(({ pos, name, w }) => {
    // Resolve player name: prefer keyPlayerName, fall back to pos→roleMap
    let player = (name || "").trim();
    if (!player && pos) {
      const k = pos.trim().toUpperCase();
      player = roleMap[k] || "";
    }
    if (player) {
      weightedTouches[player] = (weightedTouches[player] || 0) + w;
    }
  });
  // QB runs get KP1-level weight
  if (isQBRun) {
    const qbName = roleMap["QB"] || "Lucas";
    weightedTouches[qbName] = (weightedTouches[qbName] || 0) + weights[0];
  }

  // ── Is it a Cross / Cover-0 answer? ───────────────────────────────────────
  const isCross = matchedFamily === "Cross";
  const isCover0Ans = matchedFamily === "Smaug" || isQuick;

  return {
    family: matchedFamily,
    category: matchedCategory,
    isRun,
    isScreen,
    isPA,
    isQuick,
    isRPO,
    isShot,
    isQBRun,
    isCross,
    isCover0Ans,
    touches: [...touches],
    weightedTouches,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BUCKET EVALUATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a single bucket (e.g. "1st-down") and return a detailed report.
 *
 * @param {string} bucketKey - e.g. "1st-down"
 * @param {{ left: Object[], right: Object[] }} bucketObj
 * @returns {Object} report
 */
function evaluateBucket(bucketKey, bucketObj) {
  const rules = CALLSHEET_CONSTRAINTS.bucketRules[bucketKey];
  const global = CALLSHEET_CONSTRAINTS.global;

  // Collect all plays (left + right combined)
  const all = [...(bucketObj.left || []), ...(bucketObj.right || [])];
  const total = all.length;

  // Categorize each play
  const cats = all.map(categorizePlay);

  // Counts
  const runCount = cats.filter((c) => c.isRun && !c.isScreen).length;
  const screenCount = cats.filter((c) => c.isScreen).length;
  const throwCount = total - runCount - screenCount; // throw = everything except runs and screens
  const paCount = cats.filter((c) => c.isPA).length;
  const shotCount = cats.filter((c) => c.isShot).length;
  const crossCount = cats.filter((c) => c.isCross).length;
  const cover0Count = cats.filter((c) => c.isCover0Ans).length;
  const qbRunCount = cats.filter((c) => c.isQBRun).length;

  // Touch counts per player name (flat — each key-player slot = 1)
  const touchCounts = {};
  cats.forEach((c) => {
    c.touches.forEach((player) => {
      touchCounts[player] = (touchCounts[player] || 0) + 1;
    });
  });

  // Weighted touch counts (KP1 > KP2 > KP3)
  const weightedTouchCounts = {};
  cats.forEach((c) => {
    if (c.weightedTouches) {
      Object.entries(c.weightedTouches).forEach(([player, w]) => {
        weightedTouchCounts[player] = (weightedTouchCounts[player] || 0) + w;
      });
    }
  });

  const warnings = [];
  const errors = [];
  const successes = [];

  if (total === 0) {
    return {
      bucketKey,
      total,
      runCount,
      throwCount,
      screenCount,
      paCount,
      shotCount,
      crossCount,
      cover0Count,
      qbRunCount,
      touchCounts,
      weightedTouchCounts,
      warnings: [],
      errors: ["⛔ Bucket is empty"],
      successes: [],
      score: 0,
      status: "empty",
      philosophy: rules?.philosophy || "",
    };
  }

  // ── Count check ────────────────────────────────────────────────────────────
  if (total > global.maxFeaturedCount) {
    warnings.push(
      `⚠️ ${total} plays — consider trimming to ${global.maxFeaturedCount} featured`,
    );
  } else if (total < global.minFeaturedCount) {
    warnings.push(
      `⚠️ Only ${total} plays — target at least ${global.minFeaturedCount}`,
    );
  } else {
    successes.push(`✅ Play count: ${total}`);
  }

  if (!rules) {
    return {
      bucketKey,
      total,
      runCount,
      throwCount,
      screenCount,
      paCount,
      shotCount,
      crossCount,
      cover0Count,
      qbRunCount,
      touchCounts,
      weightedTouchCounts,
      warnings,
      errors,
      successes,
      score: successes.length > 0 ? 50 : 0,
      status: successes.length > 0 ? "ok" : "warn",
      philosophy: "",
    };
  }

  // ── Run/Throw ratio ────────────────────────────────────────────────────────
  const targetRun = rules.targetRun ?? 5;
  const targetThrow = rules.targetThrow ?? 5;
  const targetTotal = targetRun + targetThrow;

  // Tolerate ±2 of the expected ratio (scaled to actual total)
  const expectedRun = Math.round((targetRun / targetTotal) * total);
  const runDiff = Math.abs(runCount - expectedRun);

  if (runDiff <= 2) {
    successes.push(`✅ Run/Throw ratio: ${runCount}R / ${throwCount}T`);
  } else if (runCount > expectedRun) {
    warnings.push(
      `⚠️ Run-heavy: ${runCount}R / ${throwCount}T (target ~${targetRun}:${targetThrow})`,
    );
  } else {
    warnings.push(
      `⚠️ Pass-heavy: ${runCount}R / ${throwCount}T (target ~${targetRun}:${targetThrow})`,
    );
  }

  // ── Screen check ──────────────────────────────────────────────────────────
  const maxScreens = rules.maxScreens ?? 2;
  if (maxScreens === 99) {
    // Screen bucket — skip warning
  } else if (screenCount > maxScreens) {
    errors.push(
      `🚨 Too many screens: ${screenCount} (max ${maxScreens} for this situation)`,
    );
  } else if (screenCount === 0 && maxScreens === 0) {
    successes.push(`✅ No screens (correct for this situation)`);
  } else {
    successes.push(`✅ Screen count: ${screenCount}`);
  }

  // ── Required checks ────────────────────────────────────────────────────────
  const required = rules.required || [];

  if (required.includes("marco")) {
    const marcoPlayer = _activeRoleMap()["X"] || "Marco";
    const cnt = touchCounts[marcoPlayer] || 0;
    if (cnt >= 2) successes.push(`✅ ${marcoPlayer} touches: ${cnt}`);
    else errors.push(`🚨 Need ≥2 ${marcoPlayer} (X) options — have ${cnt}`);
  }

  if (required.includes("jayce")) {
    const jaycePlayer = _activeRoleMap()["H"] || "Jayce";
    const cnt = touchCounts[jaycePlayer] || 0;
    if (cnt >= 2) successes.push(`✅ ${jaycePlayer} touches: ${cnt}`);
    else
      errors.push(`🚨 Need ≥2 ${jaycePlayer} (H/Z slot) options — have ${cnt}`);
  }

  if (required.includes("danny")) {
    const dannyPlayer = _activeRoleMap()["TE"] || "Danny";
    const cnt = touchCounts[dannyPlayer] || 0;
    if (cnt >= 1) successes.push(`✅ ${dannyPlayer} (TE) option present`);
    else warnings.push(`⚠️ No ${dannyPlayer} (TE/HB leak) option`);
  }

  if (required.includes("lucas-run")) {
    if (qbRunCount >= 1) successes.push(`✅ QB run / keeper option present`);
    else errors.push(`🚨 No QB run / keeper option for this situation`);
  }

  if (required.includes("cross-concept")) {
    if (crossCount >= 1) successes.push(`✅ Cross (mesh) concept present`);
    else
      errors.push(`🚨 Missing Cross (mesh) — identity play for 3rd & medium`);
  }

  if (required.includes("cover0-answer")) {
    if (cover0Count >= 1)
      successes.push(`✅ Cover-0 quick answer (Smaug/quick) present`);
    else errors.push(`🚨 No Cover-0 answer (need Smaug/quick concept)`);
  }

  if (required.includes("shot-paired")) {
    const paired = cats.filter(
      (c) =>
        c.isShot &&
        CALLSHEET_CONSTRAINTS.shotPartnerFamilies.some((f) =>
          cats.some((r) => r.family === f),
        ),
    );
    if (shotCount === 0) {
      errors.push(`🚨 No shot play — need PA or deep concept for explosives`);
    } else if (paired.length === 0) {
      warnings.push(
        `⚠️ Shot exists but not married to ${CALLSHEET_CONSTRAINTS.shotPartnerFamilies.join(" or ")}`,
      );
    } else {
      successes.push(`✅ Shot paired to run game`);
    }
  }

  // ── 3rd & medium: extra Cross check ───────────────────────────────────────
  if (rules.requireCross && crossCount === 0) {
    errors.push(`🚨 3rd & medium identity: Cross concept missing`);
  }

  // ── Vision Mode: variation & directional warnings ─────────────────────────
  if (_visionOn()) {
    _visionVariationWarnings(all).forEach((w) => warnings.push(w));
    _visionDirectionalWarnings(all).forEach((w) => warnings.push(w));
  }

  // ── Scoring ───────────────────────────────────────────────────────────────
  const checkTotal = successes.length + warnings.length + errors.length;
  const score =
    checkTotal === 0 ? 100 : Math.round((successes.length / checkTotal) * 100);

  let status;
  if (errors.length > 0) status = "error";
  else if (warnings.length > 0) status = "warn";
  else status = "ok";

  return {
    bucketKey,
    total,
    runCount,
    throwCount,
    screenCount,
    paCount,
    shotCount,
    crossCount,
    cover0Count,
    qbRunCount,
    touchCounts,
    weightedTouchCounts,
    warnings,
    errors,
    successes,
    score,
    status,
    philosophy:
      (_visionOn() && _VISION_BUCKET_NOTES[bucketKey]
        ? _VISION_BUCKET_NOTES[bucketKey] + " "
        : "") + (rules.philosophy || ""),
  };
}

/**
 * Evaluate the entire call sheet and return a full report.
 *
 * @param {Object} cs - the callSheet object { bucketKey: { left, right } }
 * @returns {Object} { overallScore, bucketReports, summary }
 */
function evaluateCallSheet(cs) {
  if (!cs || typeof cs !== "object") {
    return {
      overallScore: 0,
      bucketReports: {},
      summary: "No call sheet data.",
    };
  }

  const bucketReports = {};
  let totalScore = 0;
  let bucketCount = 0;

  // Global aggregated weighted touch counts across all buckets
  const globalWeightedTouches = {};
  const globalFlatTouches = {};

  Object.entries(cs).forEach(([key, bucket]) => {
    const report = evaluateBucket(key, bucket);
    bucketReports[key] = report;
    if (report.status !== "empty") {
      totalScore += report.score;
      bucketCount++;

      // Aggregate weighted touches
      if (report.weightedTouchCounts) {
        Object.entries(report.weightedTouchCounts).forEach(([player, w]) => {
          globalWeightedTouches[player] =
            (globalWeightedTouches[player] || 0) + w;
        });
      }
      // Aggregate flat touches
      if (report.touchCounts) {
        Object.entries(report.touchCounts).forEach(([player, c]) => {
          globalFlatTouches[player] = (globalFlatTouches[player] || 0) + c;
        });
      }
    }
  });

  const overallScore =
    bucketCount === 0 ? 0 : Math.round(totalScore / bucketCount);

  const errorBuckets = Object.values(bucketReports).filter(
    (r) => r.status === "error",
  ).length;
  const warnBuckets = Object.values(bucketReports).filter(
    (r) => r.status === "warn",
  ).length;
  const okBuckets = Object.values(bucketReports).filter(
    (r) => r.status === "ok",
  ).length;
  const emptyBuckets = Object.values(bucketReports).filter(
    (r) => r.status === "empty",
  ).length;

  const summary = `${overallScore}% overall — ${okBuckets} ✅ ${warnBuckets} ⚠️ ${errorBuckets} 🚨 ${emptyBuckets} empty`;

  return {
    overallScore,
    bucketReports,
    summary,
    globalWeightedTouches,
    globalFlatTouches,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAY SUGGESTIONS
// Suggests plays from the playbook that would satisfy a bucket's missing reqs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rank a play by label priority (CORE > SITUATION > ANSWER > other)
 * @param {Object} play
 * @returns {number} sort order (lower = higher priority)
 */
function _playRank(play) {
  const tags = [
    play.playTag1,
    play.playTag2,
    play.constraint1,
    play.constraint2,
    play.oneWord,
  ].map((t) => _normalize(t || ""));
  if (tags.some((t) => t.includes("core"))) return 0;
  if (tags.some((t) => t.includes("situation"))) return 1;
  if (tags.some((t) => t.includes("answer"))) return 2;
  return 3;
}

/**
 * Given a bucket's missing requirements, suggest plays from the playbook.
 *
 * @param {Object} report - result of evaluateBucket()
 * @param {Object[]} playbookPlays - array of play objects from the playbook
 * @returns {{ label: string, plays: Object[] }[]} - grouped suggestions
 */
function suggestFixesForBucket(report, playbookPlays) {
  if (!playbookPlays || playbookPlays.length === 0) return [];

  // Pre-compute categorization for all playbook plays once (avoid O(plays × groups))
  const classified = playbookPlays.map((p) => ({
    play: p,
    cat: categorizePlay(p),
  }));

  const suggestions = [];
  const allErrors = [...report.errors, ...report.warnings];

  // Helper: suggest plays matching a filter on the pre-computed classification
  const suggest = (label, filterFn) => {
    const matches = classified
      .filter(({ cat }) => filterFn(cat))
      .sort((a, b) => _playRank(a.play) - _playRank(b.play))
      .slice(0, 5)
      .map(({ play }) => play);
    if (matches.length > 0) {
      suggestions.push({ label, plays: matches });
    }
  };

  // QB run
  if (allErrors.some((e) => e.includes("QB run"))) {
    suggest("QB Run / Keeper Option", (cat) => cat.isQBRun);
  }

  // Marco
  const marcoPlayer = CALLSHEET_CONSTRAINTS.roleMap["X"] || "Marco";
  if (allErrors.some((e) => e.includes(marcoPlayer))) {
    suggest(`${marcoPlayer} Touch Plays`, (cat) =>
      cat.touches.includes(marcoPlayer),
    );
  }

  // Jayce
  const jaycePlayer = CALLSHEET_CONSTRAINTS.roleMap["H"] || "Jayce";
  if (allErrors.some((e) => e.includes(jaycePlayer))) {
    suggest(`${jaycePlayer} Touch Plays`, (cat) =>
      cat.touches.includes(jaycePlayer),
    );
  }

  // Danny
  const dannyPlayer = CALLSHEET_CONSTRAINTS.roleMap["TE"] || "Danny";
  if (allErrors.some((e) => e.includes(dannyPlayer))) {
    suggest(`${dannyPlayer} (TE/HB) Option`, (cat) =>
      cat.touches.includes(dannyPlayer),
    );
  }

  // Cross / mesh
  if (allErrors.some((e) => e.includes("Cross"))) {
    suggest("Cross (Mesh) Concept", (cat) => cat.isCross);
  }

  // Cover-0 answer
  if (allErrors.some((e) => e.includes("Cover-0"))) {
    suggest("Cover-0 / Quick Answer", (cat) => cat.isCover0Ans);
  }

  // Shot play
  if (allErrors.some((e) => e.includes("shot play") || e.includes("Shot"))) {
    suggest("Shot / PA Concept", (cat) => cat.isShot);
  }

  return suggestions;
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL TOUCH ANALYSIS ENGINE
// Computes rich per-player analytics from any array of plays.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a comprehensive touch analysis for an array of plays.
 * Used by constraints panel, offense builder, and installation report.
 *
 * @param {Object[]} playsArr - array of play objects
 * @returns {Object} analysis
 */
function computeTouchAnalysis(playsArr) {
  if (!playsArr || playsArr.length === 0) {
    return {
      players: {},
      weighted: {},
      flat: {},
      byType: {},
      bySlot: {},
      hitZones: {},
      totalPlays: 0,
      totalWeightedPts: 0,
    };
  }

  const roleMap = CALLSHEET_CONSTRAINTS.roleMap;
  const weights = CALLSHEET_CONSTRAINTS.touchWeights || [3, 2, 1];

  // Accumulators
  const weighted = {}; // player → total weighted points
  const flat = {}; // player → flat play count (at least one KP slot)
  const byType = {}; // player → { Run: n, Pass: n, Screen: n, ... }
  const bySlot = {}; // player → { kp1: n, kp2: n, kp3: n }
  const hitZones = {}; // player → { zone: count }
  const playTypes = {}; // player → { typeName: Set<playIdx> } — to dedupe

  playsArr.forEach((play, idx) => {
    const cat = categorizePlay(play);

    // ── Weighted + flat touches from categorizePlay ──
    if (cat.weightedTouches) {
      Object.entries(cat.weightedTouches).forEach(([player, w]) => {
        weighted[player] = (weighted[player] || 0) + w;
      });
    }
    if (cat.touches) {
      cat.touches.forEach((player) => {
        flat[player] = (flat[player] || 0) + 1;
      });
    }

    // ── Per-slot breakdown (KP1 / KP2 / KP3) ──
    const kpSlots = [
      { pos: play.keyPlayer1, name: play.keyPlayerName1, slot: "kp1" },
      { pos: play.keyPlayer2, name: play.keyPlayerName2, slot: "kp2" },
      { pos: play.keyPlayer3, name: play.keyPlayerName3, slot: "kp3" },
    ];
    kpSlots.forEach(({ pos, name, slot }) => {
      let player = (name || "").trim();
      if (!player && pos) {
        const k = pos.trim().toUpperCase();
        player = roleMap[k] || "";
      }
      if (player) {
        if (!bySlot[player]) bySlot[player] = { kp1: 0, kp2: 0, kp3: 0 };
        bySlot[player][slot]++;
      }
    });

    // ── Per-type breakdown ──
    const typeName = (play.type || "Other").trim();
    kpSlots.forEach(({ pos, name }) => {
      let player = (name || "").trim();
      if (!player && pos) {
        const k = pos.trim().toUpperCase();
        player = roleMap[k] || "";
      }
      if (player) {
        if (!byType[player]) byType[player] = {};
        if (!playTypes[player]) playTypes[player] = {};
        if (!playTypes[player][typeName])
          playTypes[player][typeName] = new Set();
        // Only count once per play per player per type
        if (!playTypes[player][typeName].has(idx)) {
          playTypes[player][typeName].add(idx);
          byType[player][typeName] = (byType[player][typeName] || 0) + 1;
        }
      }
    });

    // ── QB runs ──
    if (cat.isQBRun) {
      const qbName = roleMap["QB"] || "Lucas";
      if (!byType[qbName]) byType[qbName] = {};
      byType[qbName]["QB Run"] = (byType[qbName]["QB Run"] || 0) + 1;
      if (!bySlot[qbName]) bySlot[qbName] = { kp1: 0, kp2: 0, kp3: 0 };
      bySlot[qbName].kp1++;
    }

    // ── Hit chart zones per player ──
    const hcSlots = [
      { name: play.keyPlayerName1, pos: play.keyPlayer1, hc: play.hitChart1 },
      { name: play.keyPlayerName2, pos: play.keyPlayer2, hc: play.hitChart2 },
      { name: play.keyPlayerName3, pos: play.keyPlayer3, hc: play.hitChart3 },
    ];
    hcSlots.forEach(({ name, pos, hc }) => {
      if (!hc || !hc.trim()) return;
      let player = (name || "").trim();
      if (!player && pos) {
        const k = pos.trim().toUpperCase();
        player = roleMap[k] || "";
      }
      if (player) {
        if (!hitZones[player]) hitZones[player] = {};
        const zone = hc.trim();
        hitZones[player][zone] = (hitZones[player][zone] || 0) + 1;
      }
    });
  });

  // ── Build sorted player summaries ──
  const totalWeightedPts = Object.values(weighted).reduce((s, v) => s + v, 0);
  const players = {};

  Object.keys(weighted)
    .sort((a, b) => weighted[b] - weighted[a])
    .forEach((name) => {
      const w = weighted[name] || 0;
      const f = flat[name] || 0;
      const pct = totalWeightedPts > 0 ? (w / totalWeightedPts) * 100 : 0;
      const slots = bySlot[name] || { kp1: 0, kp2: 0, kp3: 0 };
      const types = byType[name] || {};
      const zones = hitZones[name] || {};

      // Sort hit zones descending
      const sortedZones = Object.entries(zones).sort((a, b) => b[1] - a[1]);

      // Sort types descending
      const sortedTypes = Object.entries(types).sort((a, b) => b[1] - a[1]);

      players[name] = {
        name,
        weightedPts: w,
        pct,
        flatCount: f,
        slots,
        types: sortedTypes,
        hitZones: sortedZones,
        primaryRate:
          slots.kp1 + slots.kp2 + slots.kp3 > 0
            ? (slots.kp1 / (slots.kp1 + slots.kp2 + slots.kp3)) * 100
            : 0,
      };
    });

  return {
    players,
    weighted,
    flat,
    byType,
    bySlot,
    hitZones,
    totalPlays: playsArr.length,
    totalWeightedPts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI — SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build HTML for a horizontal bar chart showing weighted touch distribution.
 * Sorted descending by weight. Each bar shows player name, filled portion
 * proportional to weight share, percentage, and raw points.
 *
 * @param {Object} weightedTouches - { playerName: totalWeight }
 * @param {Object} [flatTouches]   - { playerName: count } (optional, shown alongside)
 * @param {string} [title]         - Section title (falsy → no header)
 * @returns {string} HTML string
 */
function _renderTouchDistribution(weightedTouches, flatTouches, title) {
  if (!weightedTouches || Object.keys(weightedTouches).length === 0) return "";

  const entries = Object.entries(weightedTouches).sort((a, b) => b[1] - a[1]);
  const totalWeight = entries.reduce((sum, e) => sum + e[1], 0);

  const bars = entries
    .map(([player, w]) => {
      const pct = totalWeight > 0 ? (w / totalWeight) * 100 : 0;
      const flat = flatTouches ? flatTouches[player] || 0 : null;
      const flatLabel =
        flat !== null ? `<span class="cr-dist-flat">${flat} plays</span>` : "";
      return `
      <div class="cr-dist-row">
        <span class="cr-dist-name">${escapeHtml(player)}</span>
        <div class="cr-dist-bar-track">
          <div class="cr-dist-bar-fill" style="--fill-width:${pct.toFixed(1)}%"></div>
        </div>
        <span class="cr-dist-pct">${pct.toFixed(0)}%</span>
        <span class="cr-dist-pts">${Number.isInteger(w) ? w : w.toFixed(1)} pts</span>
        ${flatLabel}
      </div>`;
    })
    .join("");

  const titleHtml = title
    ? `<div class="cr-dist-title">🏈 ${escapeHtml(title)}</div>`
    : "";

  return `<div class="cr-distribution">${titleHtml}${bars}</div>`;
}

/**
 * Build a rich, expandable touch analysis panel from a computeTouchAnalysis result.
 * Shows overview bars + expandable per-player breakdown with slot, type, and hit zone detail.
 *
 * @param {Object} analysis - result from computeTouchAnalysis()
 * @param {Object} [opts]
 * @param {string} [opts.title] - panel title
 * @param {boolean} [opts.compact] - skip hit zones / use compact mode
 * @param {string} [opts.idPrefix] - unique prefix for toggle IDs
 * @returns {string} HTML string
 */
function renderTouchAnalysis(analysis, opts) {
  if (
    !analysis ||
    !analysis.players ||
    Object.keys(analysis.players).length === 0
  )
    return "";

  const {
    title = "Touch Distribution",
    compact = false,
    idPrefix = "ta",
  } = opts || {};
  const playerArr = Object.values(analysis.players);
  const totalPts = analysis.totalWeightedPts || 0;

  // Bar colors per player (cycle through a curated palette)
  const palette = [
    "var(--color-primary, #667eea)",
    "var(--color-accent, #764ba2)",
    "var(--color-success, #28a745)",
    "var(--color-warning, #f0ad4e)",
    "var(--color-danger, #dc3545)",
    "var(--color-info, #17a2b8)",
  ];

  // Overview chips
  const summaryChips = playerArr
    .map((p, i) => {
      const color = palette[i % palette.length];
      return `<span class="ta-chip" style="--ta-color:${color}"><span class="ta-chip-dot"></span>${escapeHtml(p.name)} <b>${p.pct.toFixed(0)}%</b></span>`;
    })
    .join("");

  // Player rows with expandable detail
  const rows = playerArr
    .map((p, i) => {
      const color = palette[i % palette.length];
      const id = `${idPrefix}-${i}`;

      // Slot breakdown mini-bar
      const slotTotal = p.slots.kp1 + p.slots.kp2 + p.slots.kp3;
      const kp1Pct = slotTotal > 0 ? (p.slots.kp1 / slotTotal) * 100 : 0;
      const kp2Pct = slotTotal > 0 ? (p.slots.kp2 / slotTotal) * 100 : 0;
      const kp3Pct = slotTotal > 0 ? (p.slots.kp3 / slotTotal) * 100 : 0;

      const slotBar = `
        <div class="ta-slot-bar">
          <div class="ta-slot-seg ta-seg-kp1" style="--seg-width:${kp1Pct.toFixed(0)}%" title="KP1: ${p.slots.kp1}"></div>
          <div class="ta-slot-seg ta-seg-kp2" style="--seg-width:${kp2Pct.toFixed(0)}%" title="KP2: ${p.slots.kp2}"></div>
          <div class="ta-slot-seg ta-seg-kp3" style="--seg-width:${kp3Pct.toFixed(0)}%" title="KP3: ${p.slots.kp3}"></div>
        </div>`;

      const slotLabels = `
        <div class="ta-slot-labels">
          <span class="ta-slot-label ta-lbl-kp1">KP1: ${p.slots.kp1}</span>
          <span class="ta-slot-label ta-lbl-kp2">KP2: ${p.slots.kp2}</span>
          <span class="ta-slot-label ta-lbl-kp3">KP3: ${p.slots.kp3}</span>
        </div>`;

      // Play types
      const typeChips = p.types
        .map(
          ([t, n]) =>
            `<span class="ta-type-chip">${escapeHtml(t)} <b>${n}</b></span>`,
        )
        .join("");

      // Hit zones (top 6)
      let zoneHtml = "";
      if (!compact && p.hitZones.length > 0) {
        const zoneChips = p.hitZones
          .slice(0, 6)
          .map(
            ([z, n]) =>
              `<span class="ta-zone-chip">${escapeHtml(z)} <b>${n}</b></span>`,
          )
          .join("");
        const more =
          p.hitZones.length > 6
            ? `<span class="ta-zone-more">+${p.hitZones.length - 6} more</span>`
            : "";
        zoneHtml = `<div class="ta-detail-row"><span class="ta-detail-label">🎯 Hit Zones</span><div class="ta-detail-chips">${zoneChips}${more}</div></div>`;
      }

      return `
      <div class="ta-player-row" data-action="toggleTaDetail" data-arg="${id}">
        <span class="ta-player-dot" style="--ta-color:${color}"></span>
        <span class="ta-player-name">${escapeHtml(p.name)}</span>
        <div class="cr-dist-bar-track ta-bar">
          <div class="cr-dist-bar-fill" style="--fill-width:${p.pct.toFixed(1)}%;--fill-color:${color}"></div>
        </div>
        <span class="ta-player-pct">${p.pct.toFixed(0)}%</span>
        <span class="ta-player-pts">${Number.isInteger(p.weightedPts) ? p.weightedPts : p.weightedPts.toFixed(1)} pts</span>
        <span class="ta-player-flat">${p.flatCount} plays</span>
        <span class="ta-expand-arrow">›</span>
      </div>
      <div class="ta-detail hidden" id="${id}">
        <div class="ta-detail-row"><span class="ta-detail-label">🔵 Priority Slots</span>${slotBar}${slotLabels}</div>
        <div class="ta-detail-row"><span class="ta-detail-label">🏃 Play Types</span><div class="ta-detail-chips">${typeChips || '<span class="ta-none">—</span>'}</div></div>
        ${zoneHtml}
      </div>`;
    })
    .join("");

  return `
  <div class="ta-panel">
    <div class="ta-title">🏈 ${escapeHtml(title)}</div>
    <div class="ta-summary">${summaryChips}</div>
    <div class="ta-total">${analysis.totalPlays} plays · ${totalPts} weighted pts</div>
    <div class="ta-rows">${rows}</div>
  </div>`;
}

/**
 * Toggle touch analysis detail panel visibility.
 */
function toggleTaDetail(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const isOpen = !el.classList.contains("hidden");
  el.classList.toggle("hidden", isOpen);
  const row = el.previousElementSibling;
  if (row) {
    const arrow = row.querySelector(".ta-expand-arrow");
    if (arrow) arrow.textContent = isOpen ? "›" : "⌄";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI — RENDERING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point: run the full evaluation and render the panel.
 * Called by the "Check Constraints" button.
 */
function runConstraintCheck() {
  if (!CONSTRAINTS_ENABLED) {
    showToast("Constraints module is disabled (CONSTRAINTS_ENABLED = false)");
    return;
  }

  // Show the panel
  const panel = document.getElementById("constraintPanel");
  if (!panel) return;
  panel.removeAttribute("inert");
  panel.setAttribute("aria-hidden", "false");
  panel.classList.add("visible");

  try {
    const report = evaluateCallSheet(callSheet);
    renderConstraintPanel(report);
  } catch (err) {
    console.error("Constraint check failed:", err);
    const body = document.getElementById("constraintPanelBody");
    if (body)
      body.innerHTML = `<p class="cr-loading">⚠️ Evaluation failed — check console for details.</p>`;
  }
}

/**
 * Close the constraint panel.
 */
function closeConstraintPanel() {
  const panel = document.getElementById("constraintPanel");
  if (!panel) return;
  panel.classList.remove("visible");
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("inert", "");
}

/**
 * Render the constraint panel with the full report.
 * @param {{ overallScore, bucketReports, summary, globalWeightedTouches, globalFlatTouches }} report
 */
function renderConstraintPanel(report) {
  const body = document.getElementById("constraintPanelBody");
  if (!body) return;

  const {
    overallScore,
    bucketReports,
    summary,
    globalWeightedTouches,
    globalFlatTouches,
  } = report;

  // Score colour
  const scoreClass =
    overallScore >= 80
      ? "constraint-score-ok"
      : overallScore >= 50
        ? "constraint-score-warn"
        : "constraint-score-error";

  // Build bucket rows — order: all non-empty first, then empty
  const sorted = Object.entries(bucketReports).sort((a, b) => {
    const order = { error: 0, warn: 1, ok: 2, empty: 3 };
    return (order[a[1].status] ?? 9) - (order[b[1].status] ?? 9);
  });

  const rows = sorted
    .map(([key, r]) => {
      const icon =
        r.status === "ok"
          ? "✅"
          : r.status === "warn"
            ? "⚠️"
            : r.status === "empty"
              ? "—"
              : "🚨";

      // Find human-readable bucket name
      const catDef = CALLSHEET_CATEGORIES?.find((c) => c.id === key);
      const name = catDef ? catDef.name : key;
      const safeKey = escapeHtml(key);

      return `
      <div class="cr-bucket-row cr-status-${r.status}" data-bucket="${safeKey}" data-action="toggleConstraintDetail" data-arg="${safeKey}">
        <span class="cr-bucket-icon">${icon}</span>
        <span class="cr-bucket-name">${escapeHtml(name)}</span>
        <span class="cr-bucket-count">${r.total} plays</span>
        <span class="cr-bucket-score">${r.status !== "empty" ? r.score + "%" : ""}</span>
        <span class="cr-bucket-arrow">›</span>
      </div>
      <div class="cr-bucket-detail hidden" id="cr-detail-${safeKey}">
        ${renderBucketDetail(key, r)}
      </div>
    `;
    })
    .join("");

  // Global touch distribution — rich analysis panel
  const allCsPlays = Object.values(callSheet).flatMap((b) => [
    ...(b.left || []),
    ...(b.right || []),
  ]);
  const touchAnalysis = computeTouchAnalysis(allCsPlays);
  const distHtml = renderTouchAnalysis(touchAnalysis, {
    title: "Touch Distribution",
    idPrefix: "cr-ta",
  });

  body.innerHTML = `
    <div class="cr-overview">
      <div class="cr-score ${scoreClass}">${overallScore}<span class="cr-score-pct">%</span></div>
      <div class="cr-summary">${summary}</div>
    </div>
    ${distHtml}
    <div class="cr-bucket-list">${rows || "<p class='cr-empty'>Call sheet is empty.</p>"}</div>
  `;
}

/**
 * Render the detail section for one bucket.
 */
function renderBucketDetail(key, report) {
  if (report.status === "empty") {
    return `<p class="cr-detail-empty">Bucket is empty — add plays to evaluate.</p>`;
  }

  const philHtml = report.philosophy
    ? `<div class="cr-philosophy">💡 ${escapeHtml(report.philosophy)}</div>`
    : "";

  const statsHtml = `
    <div class="cr-stats">
      <span class="cr-stat"><b>${report.runCount}</b> Run</span>
      <span class="cr-stat"><b>${report.throwCount}</b> Throw</span>
      <span class="cr-stat"><b>${report.screenCount}</b> Screen</span>
      <span class="cr-stat"><b>${report.shotCount}</b> Shot</span>
    </div>
  `;

  // Per-bucket touch distribution — rich analysis
  const bucketPlays = callSheet[key]
    ? [...(callSheet[key].left || []), ...(callSheet[key].right || [])]
    : [];
  const bucketAnalysis = computeTouchAnalysis(bucketPlays);
  const bucketDistHtml = renderTouchAnalysis(bucketAnalysis, {
    compact: true,
    idPrefix: `cr-ta-${key}`,
  });

  const errorItems = report.errors
    .map((e) => `<li class="cr-item cr-item-error">${escapeHtml(e)}</li>`)
    .join("");
  const warnItems = report.warnings
    .map((w) => `<li class="cr-item cr-item-warn">${escapeHtml(w)}</li>`)
    .join("");
  const okItems = report.successes
    .map((s) => `<li class="cr-item cr-item-ok">${escapeHtml(s)}</li>`)
    .join("");

  const listHtml = `<ul class="cr-check-list">${errorItems}${warnItems}${okItems}</ul>`;

  const safeKey = escapeHtml(key);
  const suggestBtn =
    report.errors.length > 0
      ? `<button class="btn btn-sm btn-primary cr-suggest-btn" data-action="showSuggestions" data-arg="${safeKey}">💡 Suggest Fixes</button>`
      : "";

  const suggDiv = `<div class="cr-suggestions hidden" id="cr-suggest-${safeKey}"></div>`;

  return (
    philHtml + statsHtml + bucketDistHtml + listHtml + suggestBtn + suggDiv
  );
}

/**
 * Toggle the detail panel for a bucket row.
 */
function toggleConstraintDetail(key) {
  const el = document.getElementById(`cr-detail-${key}`);
  if (!el) return;
  const isOpen = !el.classList.contains("hidden");
  el.classList.toggle("hidden", isOpen);
  // Update arrow
  const row = document.querySelector(`.cr-bucket-row[data-bucket="${key}"]`);
  if (row) {
    const arrow = row.querySelector(".cr-bucket-arrow");
    if (arrow) arrow.textContent = isOpen ? "›" : "⌄";
  }
}

/**
 * Show fix suggestions for a bucket.
 */
function showSuggestions(key) {
  const bucket = callSheet[key];
  if (!bucket) return;
  if (typeof plays === "undefined" || !Array.isArray(plays)) return;

  const report = evaluateBucket(key, bucket);
  const suggestions = suggestFixesForBucket(report, plays);

  const el = document.getElementById(`cr-suggest-${key}`);
  if (!el) return;

  if (suggestions.length === 0) {
    el.innerHTML = `<p class="cr-sug-empty">No specific play suggestions available — check your playbook mapping.</p>`;
  } else {
    el.innerHTML = suggestions
      .map(
        (group) => `
      <div class="cr-sug-group">
        <div class="cr-sug-label">➕ ${escapeHtml(group.label)}</div>
        ${group.plays
            .map(
              (p) => `
          <div class="cr-sug-play" title="${escapeHtml([p.playTag1, p.playTag2].filter(Boolean).join(", "))}">
            <span class="cr-sug-type">${escapeHtml(p.type || "")}</span>
            <span class="cr-sug-call">${typeof getFullCall === "function" ? getFullCall(p) : escapeHtml((p.formation || "") + " " + (p.play || ""))}</span>
          </div>
        `,
            )
            .join("")}
      </div>
    `,
      )
      .join("");
  }

  el.classList.toggle("hidden");
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE  — save / load constraints snapshot alongside call sheet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save the current constraints config version and last check timestamp
 * to localStorage alongside the call sheet.
 */
function saveConstraintsSnapshot() {
  try {
    storageManager.set(STORAGE_KEYS.CALLSHEET_CONSTRAINTS, {
      version: 1,
      savedAt: new Date().toISOString(),
      rulesVersion: Object.keys(CALLSHEET_CONSTRAINTS.bucketRules).length,
    });
  } catch (e) {
    console.warn("Failed to save constraints snapshot:", e);
  }
}
