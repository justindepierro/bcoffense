// ============================================================
// callsheet-filters.js — call sheet auto-populate helpers
//
// Owns: `getWristbandNumberForPlay`, `splitPreferredValues`,
// `getCanonicalCallSheetPlayType`, `isCallSheetPlayAllowed`,
// `isCallSheetPassingPlay`, `getCallSheetCoverageAliases`,
// `callSheetCoverageMatches`, `callSheetKeywordMatches`,
// `callSheetKeyPlayerMatches`, `callSheetPlayMatchesCriteria`,
// `findMatchingCategories`, `buildPlayerCategoryAutoFillTargets`.
//
// Loaded after callsheet.js (all helpers are called at runtime).
// ============================================================

/**
 * Get wristband number for a play by matching with the loaded wristband.
 *
 * The durable Playbook identity is authoritative. Formation/call text is a
 * display detail and can legitimately be abbreviated or overridden on a
 * Script/Call Sheet, so it is only a compatibility fallback.
 */
function getWristbandNumberForPlay(play) {
  if (
    !callSheetSettings.loadedWristbandPlays ||
    callSheetSettings.loadedWristbandPlays.length === 0
  ) {
    return null;
  }

  const wristbandPlays = callSheetSettings.loadedWristbandPlays;
  const persistentIds = new Set(
    [play?.playbookId, play?.sourcePlayId, play?.originalPlayId, play?.wristbandLinkId]
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  if (persistentIds.size) {
    const persistentMatch = wristbandPlays.find((wristbandPlay) => {
      const wristbandIds = [
        wristbandPlay?.playbookId,
        wristbandPlay?.sourcePlayId,
        wristbandPlay?.originalPlayId,
        wristbandPlay?.wristbandLinkId,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      return wristbandIds.some((id) => persistentIds.has(id));
    });
    if (persistentMatch && persistentMatch.wristbandNumber != null) {
      return persistentMatch.wristbandNumber;
    }
  }

  // Retain the shared cross-surface matcher before the legacy text matching.
  // It recognizes canonical source/compare keys without requiring the same
  // exact display formatting in every workspace.
  if (typeof playsMatch === "function") {
    const identityMatch = wristbandPlays.find((wristbandPlay) => playsMatch(play, wristbandPlay));
    if (identityMatch && identityMatch.wristbandNumber != null) {
      return identityMatch.wristbandNumber;
    }
  }

  // Legacy imports may lack source identity metadata. Match the displayed
  // call only as the final fallback.
  let match = wristbandPlays.find(
    (wp) =>
      wp.formation === play.formation &&
      wp.play === play.play &&
      wp.personnel === play.personnel,
  );

  // If no exact match, try matching without personnel
  if (!match) {
    match = wristbandPlays.find(
      (wp) => wp.formation === play.formation && wp.play === play.play,
    );
  }

  // If still no match, try case-insensitive matching
  if (!match) {
    const playForm = (play.formation || "").toLowerCase().trim();
    const playName = (play.play || "").toLowerCase().trim();
    match = wristbandPlays.find(
      (wp) =>
        (wp.formation || "").toLowerCase().trim() === playForm &&
        (wp.play || "").toLowerCase().trim() === playName,
    );
  }

  return match ? match.wristbandNumber : null;
}

/**
 * Split a preferred field value into individual values.
 * Handles comma, pipe, semicolon, and slash separators.
 */
function splitPreferredValues(value) {
  if (!value) return [];
  return value
    .split(/[,|;\/]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function getCanonicalCallSheetPlayType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (CS_PLAY_TYPE_ALIASES[normalized]) {
    return CS_PLAY_TYPE_ALIASES[normalized];
  }
  return CS_PASSING_PLAY_TYPES.find(
    (type) => type.toLowerCase() === normalized,
  ) || String(value || "").trim();
}

function isCallSheetPlayAllowed(play, settings = callSheetSettings) {
  const allowed = Array.isArray(settings?.allowedPlayTypes)
    ? settings.allowedPlayTypes
    : [];
  if (allowed.length === 0) return true;
  const playType = getCanonicalCallSheetPlayType(play?.type);
  return allowed.some(
    (type) =>
      getCanonicalCallSheetPlayType(type).toLowerCase() ===
      playType.toLowerCase(),
  );
}

function isCallSheetPassingPlay(play) {
  const playType = getCanonicalCallSheetPlayType(play?.type);
  return CS_PASSING_PLAY_TYPES.includes(playType);
}

function getCallSheetCoverageAliases(target) {
  const aliases = {
    "cover 0": ["cover 0", "cov 0", "c0", "zero"],
    "cover 1": ["cover 1", "cov 1", "c1", "man free"],
    "cover 2": [
      "cover 2",
      "cov 2",
      "c2",
      "tampa 2",
      "tampa two",
      "2-read",
      "2 read",
      "palms",
    ],
    "cover 3": [
      "cover 3",
      "cov 3",
      "c3",
      "3-deep",
      "3 deep",
      "buzz",
      "cloud",
    ],
    "2-man": [
      "2-man",
      "2 man",
      "man 2",
      "man two",
      "2-man under",
      "2 man under",
      "man under",
    ],
  };
  const normalized = String(target || "").trim().toLowerCase();
  return aliases[normalized] || [normalized];
}

function callSheetCoverageMatches(value, target) {
  const actual = String(value || "").trim().toLowerCase();
  if (!actual) return false;
  return getCallSheetCoverageAliases(target).some(
    (alias) => actual === alias || actual.includes(alias),
  );
}

function callSheetKeywordMatches(play, rawKeyword) {
  const keywords = String(rawKeyword || "")
    .split(/[|,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (keywords.length === 0) return true;
  const haystack = [
    play?.play,
    play?.basePlay,
    play?.playTag1,
    play?.playTag2,
    play?.oneWord,
    play?.preferredSituation,
    play?.preferredFieldPosition,
    play?.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function callSheetKeyPlayerMatches(play, rawTarget) {
  const target = String(rawTarget || "").trim().toLowerCase();
  if (!target) return true;
  const aliases =
    target === "running back"
      ? ["running back", "rb"]
      : target === "skro bros"
        ? ["skro bros", "skro brothers"]
        : [target];
  const values = [
    play?.keyPlayerName1,
    play?.keyPlayerName2,
    play?.keyPlayerName3,
    play?.keyPlayer1,
    play?.keyPlayer2,
    play?.keyPlayer3,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  return values.some((value) =>
    aliases.some((alias) => value === alias || value.includes(alias)),
  );
}

function callSheetPlayMatchesCriteria(play, criteria) {
  if (!play || !criteria || typeof criteria !== "object") return false;
  let hasCriteria = false;
  const requireListMatch = (rawValues, playValue) => {
    const values = Array.isArray(rawValues)
      ? rawValues.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
      : [];
    if (values.length === 0) return true;
    hasCriteria = true;
    const playValues = splitPreferredValues(playValue);
    return values.some((value) => playValues.includes(value));
  };

  if (!requireListMatch(criteria.down, play.preferredDown)) return false;
  if (!requireListMatch(criteria.distance, play.preferredDistance)) return false;
  if (!requireListMatch(criteria.situation, play.preferredSituation)) return false;

  const fieldPositions = Array.isArray(criteria.fieldPosition)
    ? criteria.fieldPosition
    : [];
  if (fieldPositions.length > 0) {
    hasCriteria = true;
    const playPositions = splitPreferredValues(play.preferredFieldPosition);
    const aliases = {
      green: ["green", "fringe"],
      "lo-rz": ["lo-rz", "low red zone", "low rz"],
      "hi-rz": ["hi-rz", "high red zone", "high rz", "red zone", "rz", "rz-20"],
      "goal line": ["goal line", "goalline"],
      "backed up": ["backed up", "backedup", "own territory"],
      saigon: ["saigon"],
    };
    const matches = fieldPositions.some((value) => {
      const normalized = String(value || "").trim().toLowerCase();
      const group = aliases[normalized] || [normalized];
      return playPositions.some((position) => group.includes(position));
    });
    if (!matches) return false;
  }

  const coverages = Array.isArray(criteria.coverage) ? criteria.coverage : [];
  if (coverages.length > 0) {
    hasCriteria = true;
    const playCoverages =
      typeof getCallSheetPlayCoverageValues === "function"
        ? getCallSheetPlayCoverageValues(play)
        : splitPreferredValues(play.practiceCoverage);
    if (
      !coverages.some((target) =>
        playCoverages.some((coverage) =>
          callSheetCoverageMatches(coverage, target),
        ),
      )
    ) {
      return false;
    }
  }

  if (criteria.keyPlayer && String(criteria.keyPlayer).trim()) {
    hasCriteria = true;
    if (!callSheetKeyPlayerMatches(play, criteria.keyPlayer)) return false;
  }
  if (criteria.keyword && String(criteria.keyword).trim()) {
    hasCriteria = true;
    if (!callSheetKeywordMatches(play, criteria.keyword)) return false;
  }

  return hasCriteria;
}

/**
 * Find which categories a play belongs to (FRONT page: situational; BACK page: play-type).
 *
 * FRONT page matching logic:
 *   Each category can define up to 3 filter axes: situation, down+distance, position.
 *   - If a category has BOTH position AND situation, BOTH must match (e.g., Goal Line).
 *   - Otherwise any single matching axis is sufficient.
 *   - Down+distance checks support multi-value preferred fields (e.g., "2,3" in preferredDown).
 *   - Field position supports aliases (Green ↔ Fringe, etc.).
 *
 * BACK page matching logic:
 *   Categories with a `playType` field match against the play's `type` column.
 *   Substring matching handles variations (e.g., "Run" matches "Run", "Run Option" matches "Run Option").
 *   "Perimeter Screens" only matches plays whose basePlay/notes/tags suggest perimeter.
 */
function findMatchingCategories(play) {
  const matches = [];
  if (!isCallSheetPlayAllowed(play)) return matches;
  const hiddenIds = getHiddenCallSheetCategoryIds();

  // Normalize play fields — support multi-value preferred fields
  const situations = splitPreferredValues(play.preferredSituation);
  const downs = splitPreferredValues(play.preferredDown?.toString());
  const distances = splitPreferredValues(play.preferredDistance);
  const positions = splitPreferredValues(play.preferredFieldPosition);
  const playType = (play.type || "").toLowerCase().trim();

  // Field position aliases (both directions)
  const positionAliases = {
    green: ["green", "fringe"],
    fringe: ["green", "fringe"],
    "lo-rz": ["lo-rz", "low red zone", "low rz"],
    "hi-rz": ["hi-rz", "high red zone", "high rz", "red zone"],
    "red zone": ["hi-rz", "red zone"],
    "goal line": ["goal line", "goalline"],
    goalline: ["goal line", "goalline"],
    "backed up": ["backed up", "backedup", "own territory"],
    backedup: ["backed up", "backedup"],
    saigon: ["saigon"],
  };

  /**
   * Check if any of the play's position values match a category position.
   */
  function positionMatches(catPosition) {
    const catPosLower = catPosition.toLowerCase();
    const aliasGroup = positionAliases[catPosLower] || [catPosLower];
    return positions.some((p) => aliasGroup.includes(p));
  }

  CALLSHEET_CATEGORIES.forEach((cat) => {
    if (hiddenIds.has(cat.id)) return;
    if (cat.criteria) {
      if (callSheetPlayMatchesCriteria(play, cat.criteria)) {
        matches.push(cat.id);
      }
      return;
    }
    if (cat.manual) return; // Skip manual-only categories

    // ─── SPECIAL: P and 10 ─────────────────────────────────────────────────
    // Auto-fill with 1st-down plays from neutral field position.
    // Plays in the red zone, backed-up, saigon, or short-distance situations
    // have their own buckets and should not bleed into P&10.
    if (cat.id === "p-and-10") {
      const isFirstDown = downs.includes("1");
      if (isFirstDown) {
        const inRedZone = positions.some((p) =>
          ["lo-rz", "hi-rz", "goal line", "goalline"].includes(p)
        );
        const inSpecial = positions.some((p) =>
          ["backed up", "backedup", "saigon"].includes(p)
        );
        const isShortDistance = distances.includes("short");
        if (!inRedZone && !inSpecial && !isShortDistance) {
          matches.push(cat.id);
        }
      }
      return;
    }

    // ─── BACK PAGE: Play-type matching ───
    if (cat.playType) {
      const catType = cat.playType.toLowerCase();

      // Special: "Perimeter Screens" — only screens tagged as perimeter
      if (cat.id === "perimeter-screens") {
        if (playType.includes("screen")) {
          const tags = [play.basePlay, play.playTag1, play.playTag2, play.notes]
            .join(" ")
            .toLowerCase();
          if (
            tags.includes("perimeter") ||
            tags.includes("bubble") ||
            tags.includes("tunnel") ||
            tags.includes("swing") ||
            tags.includes("jailbreak")
          ) {
            matches.push(cat.id);
          }
        }
        return;
      }

      // Special: "Screen" (general) — all screens EXCEPT the ones caught by perimeter
      if (cat.id === "screen") {
        if (playType.includes("screen")) {
          matches.push(cat.id);
        }
        return;
      }

      // Special: "Opener" — check playType, preferredSituation, and motion/shift
      // Plays with motion or shift in a neutral 1st-down situation (P&10) are
      // routed to Openers to give the offense defensive-indicator value.
      if (catType === "opener") {
        const hasMotionOrShift =
          !!(play.motion && play.motion.trim()) ||
          !!(play.shift && play.shift.trim());
        const isNeutralFirstDown =
          downs.includes("1") &&
          !distances.includes("short") &&
          !positions.some((p) =>
            ["lo-rz", "hi-rz", "goal line", "goalline",
              "backed up", "backedup", "saigon"].includes(p)
          );
        if (
          playType.includes("opener") ||
          situations.includes("opener") ||
          situations.includes("openers") ||
          (hasMotionOrShift && isNeutralFirstDown)
        ) {
          matches.push(cat.id);
        }
        return;
      }

      // General play-type match (exact or substring)
      // "Run" should NOT match "Run Option" — use exact word matching
      if (catType === "run") {
        if (playType === "run" || playType === "base run") {
          matches.push(cat.id);
        }
      } else if (catType === "run option") {
        if (playType === "run option" || playType.includes("run option")) {
          matches.push(cat.id);
        }
      } else if (catType === "pass") {
        if (
          playType === "pass" ||
          playType === "base pass" ||
          playType === "drop back"
        ) {
          matches.push(cat.id);
        }
      } else if (catType === "quick") {
        if (playType === "quick" || playType.includes("quick")) {
          matches.push(cat.id);
        }
      } else if (catType === "play action") {
        if (
          playType === "play action" ||
          playType === "pa" ||
          playType.includes("play action") ||
          playType.includes("play-action")
        ) {
          matches.push(cat.id);
        }
      } else if (catType === "rpo") {
        if (playType === "rpo" || playType.includes("rpo")) {
          matches.push(cat.id);
        }
      } else if (catType === "movement") {
        if (
          playType.includes("movement") ||
          playType.includes("boot") ||
          playType.includes("bootleg") ||
          playType.includes("sprint") ||
          playType.includes("naked") ||
          playType.includes("roll")
        ) {
          matches.push(cat.id);
        }
      } else {
        // Fallback: general substring match for any future types
        if (playType.includes(catType)) {
          matches.push(cat.id);
        }
      }

      // Play-type categories that also have down (like "1st Down") fall through below
      if (!cat.down) return;
    }

    // ─── FRONT PAGE: Situational matching ───
    let situationMatch = false;
    let downDistMatch = false;
    let posMatch = false;

    // 1. Check situation (support multi-value)
    if (cat.situation) {
      const catSit = cat.situation.toLowerCase();
      situationMatch = situations.includes(catSit);
    }

    // 2. Check down + distance (support multi-value)
    if (cat.down) {
      const catDown = cat.down;
      const downOk = downs.includes(catDown);

      if (cat.distance) {
        const catDist = cat.distance.toLowerCase();
        const distOk = distances.includes(catDist);
        downDistMatch = downOk && distOk;
      } else {
        // Down-only match (e.g., "1st Down", "4th Down")
        downDistMatch = downOk;
      }
    }

    // 3. Check field position (support aliases + multi-value)
    if (cat.position) {
      posMatch = positionMatches(cat.position);
    }

    // ─── Combine axes ───
    // If category requires BOTH position AND situation (e.g., Goal Line = Short Yardage + Goal Line position)
    if (cat.position && cat.situation) {
      if (posMatch && situationMatch) {
        matches.push(cat.id);
      }
    } else {
      // Otherwise, any matching axis is sufficient
      if (situationMatch || downDistMatch || posMatch) {
        matches.push(cat.id);
      }
    }
  });

  return matches;
}

function normalizeCallSheetPlayerName(value) {
  return String(value || "").toLowerCase().trim();
}

function getCallSheetPlayerCategoryName(cat) {
  const name =
    typeof getCategoryDisplayName === "function"
      ? getCategoryDisplayName(cat)
      : cat?.name;
  return normalizeCallSheetPlayerName(name);
}

/**
 * Player buckets auto-fill from Key Player 1 first. Key Player 2 only backfills
 * a bucket until it reaches the configured minimum count.
 */
function buildPlayerCategoryAutoFillTargets(items, options = {}) {
  const source = Array.isArray(items) ? items : [];
  const getPlay =
    typeof options.getPlay === "function"
      ? options.getPlay
      : (item) =>
        item && typeof item.play === "object" && item.play !== null
          ? item.play
          : item;
  const minCount = Number.isFinite(options.minCount)
    ? Math.max(0, Math.floor(options.minCount))
    : CALLSHEET_PLAYER_AUTOFILL_MIN;
  const targetSets = source.map(() => new Set());
  const hiddenIds = getHiddenCallSheetCategoryIds();
  const playerCats = Array.isArray(CALLSHEET_CATEGORIES)
    ? CALLSHEET_CATEGORIES.filter(
      (cat) => cat.playerSpecific && !hiddenIds.has(cat.id),
    )
    : [];

  playerCats.forEach((cat) => {
    const playerName = getCallSheetPlayerCategoryName(cat);
    if (!playerName) return;

    const primary = [];
    const secondary = [];
    const primaryKeys = new Set();
    const secondaryKeys = new Set();
    source.forEach((item, index) => {
      const play = getPlay(item);
      if (!play) return;
      const key = typeof csPlayKey === "function" ? csPlayKey(play) : String(index);
      const keyPlayer1 = normalizeCallSheetPlayerName(play.keyPlayerName1);
      const keyPlayer2 = normalizeCallSheetPlayerName(play.keyPlayerName2);
      if (keyPlayer1 === playerName) {
        if (primaryKeys.has(key)) return;
        primaryKeys.add(key);
        primary.push(index);
      } else if (
        keyPlayer2 === playerName &&
        !primaryKeys.has(key) &&
        !secondaryKeys.has(key)
      ) {
        secondaryKeys.add(key);
        secondary.push(index);
      }
    });

    primary.forEach((index) => targetSets[index].add(cat.id));
    if (primary.length < minCount) {
      secondary
        .slice(0, minCount - primary.length)
        .forEach((index) => targetSets[index].add(cat.id));
    }
  });

  return targetSets;
}
