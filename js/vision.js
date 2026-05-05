// ============================================================
// VISION MODE — 2026 Offensive Vision toggle + config
//
// When VISION MODE is ON, the app progressively swaps current
// behavior for the 2026 vision-driven framework:
//   • Four Pictures (Wide Zone / Pullers / Downhill / Anti-front)
//   • Constraint ladders (base → conflict → constraint → punish)
//   • Variation triggers (earned shots only)
//   • Yellow personnel package
//   • Field-zone bucket targets + "why this works here" notes
//
// When OFF, the app behaves exactly as before — no functional
// change. Modules consume `isVisionMode()` to branch behavior.
//
// This file is the SINGLE source of truth for the vision config.
// Future phases plug into the data structures below.
// ============================================================

// ── Toggle state ──────────────────────────────────────────────
function isVisionMode() {
  return document.documentElement.getAttribute("data-vision") === "on";
}

function setVisionMode(on) {
  const next = !!on;
  document.documentElement.setAttribute("data-vision", next ? "on" : "");
  storageManager.set(STORAGE_KEYS.VISION_MODE, next ? "on" : "off");
  const icon = document.getElementById("visionModeIcon");
  if (icon) icon.textContent = next ? "🎯" : "🧭";
  const btn = document.getElementById("visionModeBtn");
  if (btn) {
    btn.classList.toggle("vision-active", next);
    btn.setAttribute("aria-pressed", next ? "true" : "false");
    btn.title = next
      ? "Vision Mode: ON — 2026 framework active"
      : "Vision Mode: OFF — current iteration";
  }
  // Invalidate constraints family-map cache so new mode picks up immediately
  if (typeof _VISION_FAMILY_CACHE !== "undefined") {
    try {
      _VISION_FAMILY_CACHE = null;
    } catch (_e) {
      /* no-op */
    }
  }
  // Notify listeners (re-render constraints, etc.)
  try {
    document.dispatchEvent(
      new CustomEvent("visionmodechange", { detail: { on: next } }),
    );
  } catch (_e) {
    /* no-op */
  }
  // Re-render any visible views that read constraints/category notes
  try {
    if (typeof renderCallSheet === "function") renderCallSheet();
  } catch (_e) {
    /* no-op */
  }
  try {
    if (typeof renderGamePlan === "function") renderGamePlan();
  } catch (_e) {
    /* no-op */
  }
  try {
    if (typeof renderIdentity === "function") renderIdentity();
  } catch (_e) {
    /* no-op */
  }
  // Rebuild Vision-only filter chips (e.g., Picture row in playbook)
  try {
    if (typeof buildFilterChips === "function") buildFilterChips();
  } catch (_e) {
    /* no-op */
  }
  try {
    if (typeof filterPlays === "function") filterPlays();
  } catch (_e) {
    /* no-op */
  }
  if (typeof showToast === "function") {
    showToast(
      next ? "Vision Mode ON — 2026 framework" : "Vision Mode OFF",
      { duration: 1800, type: next ? "success" : "info" },
    );
  }
}

function toggleVisionMode() {
  setVisionMode(!isVisionMode());
}

// Public helper: classify a play into one of the four Pictures
// (wideZone | pullers | downhill | antiFront) using the active
// vision-aware familyMap from constraints.js. Returns null if no
// match. Safe to call when Vision Mode is OFF (returns null).
function getPlayPicture(play) {
  if (!play) return null;
  if (typeof _activeFamilyMap !== "function") return null;
  const text = [
    play.play,
    play.basePlay,
    play.playTag1,
    play.playTag2,
    play.formation,
    play.oneWord,
    play.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text) return null;
  const map = _activeFamilyMap();
  for (const e of map) {
    if (!e.picture) continue;
    if (e.keywords && e.keywords.some((kw) => text.includes(kw))) {
      return e.picture;
    }
  }
  return null;
}

// Restore on load
(function _restoreVisionMode() {
  const saved = storageManager.get(STORAGE_KEYS.VISION_MODE);
  if (saved === "on") {
    document.documentElement.setAttribute("data-vision", "on");
    // Defer DOM updates until header exists
    document.addEventListener("DOMContentLoaded", () => {
      const icon = document.getElementById("visionModeIcon");
      if (icon) icon.textContent = "🎯";
      const btn = document.getElementById("visionModeBtn");
      if (btn) {
        btn.classList.add("vision-active");
        btn.setAttribute("aria-pressed", "true");
        btn.title = "Vision Mode: ON — 2026 framework active";
      }
    });
  }
})();

// ─────────────────────────────────────────────────────────────
// VISION 2026 CONFIG (single source of truth)
//
// Filled in progressively. Modules check `isVisionMode()` first;
// if true, they read from VISION_2026 instead of legacy config.
// ─────────────────────────────────────────────────────────────
const VISION_2026 = {
  identityStatement: {
    who: "We are a Wide Zone–based, QB-friendly offense built on a small number of repeatable pictures and earned constraints.",
    majorIn: [
      "Wide Zone spine (gun/pistol; under center for weather)",
      "QB run threat (Crab, Rebel, Cavs)",
      "Conflict throws (Golden State/Warriors, Irish/Lucky, Hulk/Batman)",
      "Movement pass (Naked/Boot/Waggle, Sprint protections)",
      "Screen module (double, tunnel, middle, influence)",
    ],
    refuse: [
      "Carrying both directions of every gap concept",
      "Calling Variation shots that haven't been earned",
      "Bloating buckets — every play lives in 2–4 buckets max",
    ],
  },

  // Four Pictures — operating system
  pictures: {
    wideZone: {
      name: "Wide Zone Picture",
      calls: [
        "Worm/Wolf (WZ)",
        "Split/Slice WZ (Danny whack motion option)",
        "Golden State/Warriors",
        "Irish/Lucky (GANG)",
        "Boot/Naked/Waggle",
        "Sail/Flood",
      ],
    },
    pullers: {
      name: "Pullers/Counter Picture (Rebel world)",
      calls: [
        "Rebel",
        "BASH give sweep",
        "Rodgers/Lamar tunnel",
        "Trap pass / influence screen",
      ],
    },
    downhill: {
      name: "Downhill / ISO / Wrap Picture",
      calls: [
        "Beaver/Beetle",
        "Hulk",
        "Cavs",
        "Toronto/Raptors",
        "Batman",
        "Deer/Golf (Under Golf for weather)",
      ],
    },
    antiFront: {
      name: "Anti-front Picture (front fixes)",
      calls: ["Toledo trap", "Maverick/Laredo toss", "Crunch (San Fran/Niners)"],
    },
  },

  // Field zones (yards from own goal)
  fieldZones: [
    { id: "saigon", name: "Saigon", range: "-1 to -10" },
    { id: "coming-out", name: "Coming Out", range: "10–25" },
    { id: "green", name: "Green", range: "between the 25s" },
    { id: "fringe", name: "Fringe", range: "25–20 (FG range)" },
    { id: "hi-rz", name: "High Red Zone", range: "20–10" },
    { id: "lo-rz", name: "Low Red Zone", range: "10–5" },
    { id: "goal-line", name: "Goal Line", range: "5 and in" },
  ],

  // Directional gap rules (right-handed)
  directionalRules: {
    handedness: "right",
    gapMap: {
      "Power Right": "Georgia",
      "Power Read Right": "Hammer",
      "Deer Right": "hammer run",
      "Counter Left": "Ali",
    },
    note: "Dress up direction through formations/motions/tags rather than carrying both directions.",
  },

  // Yellow personnel package
  yellow: {
    bodies: { X: "Diego", Y: "Alex", Z: "Jayce", T: "Marco", H: "Danny" },
    coreSix: [
      "Crow (Out–Curl–Slide)",
      "Warp (Whip–Rail + backside Over)",
      "Trail (Lt/Rt)",
      "River Dagger",
      "Z Sail Switch",
      "Roll / Texas Sprint (Switch)",
    ],
    earnedConstraints: ["Bang", "Tossed", "Zorro Pass", "Naked"],
    rpoModule: ["Hulk", "Green Bay/Packers", "Lucky/Irish", "Golf", "Maverick/Laredo", "Toledo"],
    purpose: "Run conversions AND RPO/front answers without tipping pass.",
  },

  // Variation triggers (earned shots)
  variationTriggers: [
    {
      base: "Smaug (Slant–Arrow)",
      variation: "Smaug Variation (Sluggo–Seam–Wheel)",
      trigger: "Only after DB/safety bites slant",
    },
    {
      base: "Hawaii (All Hitch)",
      variation: "Hawaii Variation (Hitch-and-go)",
      trigger: "Only after corners squat/hunt hitches",
    },
    {
      base: "Eagles (bubble)",
      variation: "Eagles pump stutter-go",
      trigger: "Only after corners trigger on bubble",
    },
    {
      base: "Slash (Snag)",
      variation: "Slash MOF burst",
      trigger: "Only when safeties split",
    },
    {
      base: "Bang/Tossed",
      variation: "Bang/Tossed shot off run/toss action",
      trigger: "Only after defenders peek/overfit",
    },
  ],

  // Weekly screen package (non-negotiable)
  screens: {
    double: ["Big Mac", "Whopper"],
    tunnelInfluence: ["Rodgers", "Lamar"],
    middle: ["Michigan", "X Middle"],
    optional: ["Trap-pass influence screen off pullers"],
  },

  // 3rd down pass families (non-negotiable)
  thirdDownFamilies: {
    crossTrail: ["Cross", "Trail", "Railroad"],
    crow: ["Crow", "Mets", "Queens"],
    daggerSail: ["Dagger", "Sail", "Bench"],
    rules: ["Max protect 'outside wins' on 3rd & long"],
  },

  // QB language
  qbLanguage: ["Fit Read", "End Read", "Leverage Read"],

  // Bucket targets — 8–10 plays max each.
  // Filled out in Phase 1 (constraints.js integration).
  bucketTargets: {
    targetMin: 8,
    targetMax: 10,
    note: "Each play lives in 2–4 buckets max — avoid 'everything everywhere.'",
  },

  // Install plan + rep distribution placeholders (Phase 2 fills these out)
  installPlan: {
    day1: [
      "Identity meeting: who we are, what we major in, what we refuse",
      "Wide Zone install: Worm/Wolf base — directional rules, fit/end/leverage reads",
      "Naked/Boot off Wide Zone (movement pass intro)",
      "Smaug (Slant–Arrow) base — quick game identity",
      "Big Mac / Whopper double screen install",
      "Yellow personnel introduction (bodies + Crow base)",
    ],
    day2: [
      "Wide Zone reps continue — Split/Slice WZ + Danny whack motion option",
      "Pullers Picture install: Rebel + BASH give sweep",
      "Conflict throws install: Golden State / Warriors + Irish / Lucky (GANG)",
      "Cross / Trail / Railroad family (3rd-medium identity)",
      "Rodgers / Lamar tunnel screens",
      "Yellow Core 6: Warp + Trail + River Dagger",
    ],
    day3: [
      "Downhill Picture install: Hulk + Cavs + Beaver/Beetle",
      "Anti-front Picture install: Toledo trap + Maverick/Laredo + Crunch",
      "Dagger / Sail / Bench (3rd-long identity)",
      "RPO module: Hulk, Packers, Lucky/Irish, Golf, Maverick, Toledo",
      "Michigan + X Middle screens",
      "Yellow Core 6: Z Sail Switch + Roll/Texas Sprint + Naked constraint",
      "Earned-shot install (Variations): NEVER repped without their base on tape",
    ],
  },
  repDistribution: {
    byPicture: { wideZone: 0.4, pullers: 0.2, downhill: 0.25, antiFront: 0.15 },
    bySituation: {},
  },

  staffChecklist: [
    "Standardize QB language: Fit Read / End Read / Leverage Read",
    "Standardize protection calls",
    "Standardize tags and opposites",
    "Document do-not-call rules per bucket",
  ],
};
