let smartScriptTargetPeriod = null;

function openSmartScriptForPeriod(separatorIndex) {
  const plays = getPeriodPlays(separatorIndex);
  if (plays.length < 2) {
    showToast("This period needs at least 2 plays for Smart Script");
    return;
  }

  smartScriptTargetPeriod = separatorIndex;
  const periodLabel = script[separatorIndex].label || "Period";

  const modal = document.getElementById("smartScriptModal");
  if (!modal) return;
  modal.classList.add("show");

  const titleEl =
    modal.querySelector("h3") || modal.querySelector(".modal-title");
  if (titleEl) {
    titleEl.textContent = `🧠 Smart Script — ${periodLabel}`;
  }

  [
    "HashFlow",
    "DownProg",
    "TypeVariety",
    "Personnel",
    "Tempo",
    "Formation",
    "RunPassBal",
    "Constraint",
  ].forEach((name) => {
    const slider = document.getElementById("ssWeight" + name);
    const display = document.getElementById("ssWeight" + name + "Val");
    if (slider && display) {
      slider.oninput = () => {
        display.textContent = slider.value;
      };
    }
  });

  const runPctSlider = document.getElementById("ssRunPct");
  const runPctDisplay = document.getElementById("ssRunPctVal");
  if (runPctSlider && runPctDisplay) {
    runPctSlider.oninput = () => {
      runPctDisplay.textContent = runPctSlider.value + "%";
    };
  }

  document.getElementById("smartScriptPreview").innerHTML = "";
}

function normalizeHash(h) {
  if (!h) return "";
  const value = h.trim().toLowerCase();
  if (value.startsWith("l")) return "Left";
  if (value.startsWith("r")) return "Right";
  if (value.startsWith("m")) return "Middle";
  return "";
}

function inferHashFromHitChart(play) {
  const charts = [play.hitChart1, play.hitChart2, play.hitChart3].filter(
    Boolean,
  );
  if (charts.length === 0) return { hash: "", isRun: false };

  const hitChart = charts[0].trim();
  const words = hitChart.toLowerCase().split(/\s+/);
  const first = words[0] || "";
  const last = words[words.length - 1] || "";

  if (first === "left" || first === "l") return { hash: "Left", isRun: false };
  if (first === "right" || first === "r") return { hash: "Right", isRun: false };
  if (first === "middle" || first === "m") return { hash: "Middle", isRun: false };

  if (last === "left" || last === "l") return { hash: "Left", isRun: true };
  if (last === "right" || last === "r") return { hash: "Right", isRun: true };
  if (last === "middle" || last === "m") return { hash: "Middle", isRun: true };

  return { hash: "", isRun: true };
}

function getSmartScriptConfig() {
  return {
    hashFlow: {
      enabled: document.getElementById("ssRuleHashFlow").checked,
      weight: parseInt(document.getElementById("ssWeightHashFlow").value, 10),
    },
    downProgression: {
      enabled: document.getElementById("ssRuleDownProgression").checked,
      weight: parseInt(document.getElementById("ssWeightDownProg").value, 10),
      cycle: parseInt(document.getElementById("ssDownCycle").value, 10),
      targetDown: document.getElementById("ssDownTarget").value,
    },
    typeVariety: {
      enabled: document.getElementById("ssRuleTypeVariety").checked,
      weight: parseInt(
        document.getElementById("ssWeightTypeVariety").value,
        10,
      ),
    },
    personnelCluster: {
      enabled: document.getElementById("ssRulePersonnelCluster").checked,
      weight: parseInt(document.getElementById("ssWeightPersonnel").value, 10),
    },
    tempoVariety: {
      enabled: document.getElementById("ssRuleTempoVariety").checked,
      weight: parseInt(document.getElementById("ssWeightTempo").value, 10),
    },
    formationSpread: {
      enabled: document.getElementById("ssRuleFormationSpread").checked,
      weight: parseInt(document.getElementById("ssWeightFormation").value, 10),
    },
    startHash: {
      enabled: document.getElementById("ssRuleStartHash").checked,
      hash: document.getElementById("ssStartHash").value,
    },
    runPassBalance: {
      enabled: document.getElementById("ssRuleRunPassBal").checked,
      weight: parseInt(document.getElementById("ssWeightRunPassBal").value, 10),
      targetRunPct: parseInt(document.getElementById("ssRunPct").value, 10),
    },
    constraintPairing: {
      enabled: document.getElementById("ssRuleConstraint").checked,
      weight: parseInt(document.getElementById("ssWeightConstraint").value, 10),
    },
  };
}

function classifyRunPass(type) {
  if (!type) return "either";
  const value = type.toLowerCase().trim();
  if (value === "run") return "run";
  if (value === "option") return "run";
  if (value === "drop" || value === "dropback") return "pass";
  if (value === "quick" || value === "quick game") return "pass";
  if (value === "screen") return "pass";
  if (value === "play action" || value === "play pass") return "pass";
  if (value === "movement") return "pass";
  if (value === "rpo") return "either";
  if (value === "tricks" || value === "trick") return "either";
  return "either";
}

function areConstraintLinked(playA, playB) {
  if (!playA || !playB) return false;
  const aConstraints = [playA.constraint1, playA.constraint2, playA.constraint3]
    .filter(Boolean)
    .map((constraint) => constraint.toLowerCase().trim());
  const bConstraints = [playB.constraint1, playB.constraint2, playB.constraint3]
    .filter(Boolean)
    .map((constraint) => constraint.toLowerCase().trim());
  const aPlay = (playA.play || "").toLowerCase().trim();
  const bPlay = (playB.play || "").toLowerCase().trim();
  const aBase = (playA.basePlay || "").toLowerCase().trim();
  const bBase = (playB.basePlay || "").toLowerCase().trim();

  if (
    aConstraints.length > 0 &&
    (aConstraints.includes(bPlay) || aConstraints.includes(bBase))
  ) {
    return true;
  }
  if (
    bConstraints.length > 0 &&
    (bConstraints.includes(aPlay) || bConstraints.includes(aBase))
  ) {
    return true;
  }
  return false;
}

function scoreCandidate(candidate, pos, placed, config) {
  let score = 0;
  const breakdown = {};
  const prev = placed.length > 0 ? placed[placed.length - 1] : null;

  if (config.hashFlow.enabled && prev) {
    const prevHit = inferHashFromHitChart(prev);
    const candidateHash = normalizeHash(candidate.preferredHash);
    let prevResultHash =
      prevHit.hash ||
      normalizeHash(prev.preferredHash) ||
      normalizeHash(prev.hash) ||
      "";
    let hashScore = 0;
    if (prevResultHash && candidateHash) {
      if (prevResultHash === candidateHash) {
        hashScore = config.hashFlow.weight * 10;
      } else if (prevResultHash === "Middle" || candidateHash === "Middle") {
        hashScore = config.hashFlow.weight * 4;
      }
    } else if (prevResultHash && !candidateHash) {
      hashScore = config.hashFlow.weight * 2;
    }
    score += hashScore;
    breakdown.hashFlow = hashScore;
  }

  if (config.startHash.enabled && placed.length === 0) {
    const candidateHash = normalizeHash(candidate.preferredHash);
    let startScore = 0;
    if (candidateHash === config.startHash.hash) {
      startScore = 15;
    } else if (candidateHash === "Middle") {
      startScore = 5;
    }
    score += startScore;
    breakdown.startHash = startScore;
  }

  if (config.downProgression.enabled) {
    const posInSequence = placed.length + 1;
    const isTargetPosition = posInSequence % config.downProgression.cycle === 0;
    let downScore = 0;
    if (isTargetPosition) {
      const candidateDown = (candidate.preferredDown || "").toString().trim();
      if (candidateDown === config.downProgression.targetDown) {
        downScore = config.downProgression.weight * 10;
      } else if (candidateDown === "") {
        downScore = config.downProgression.weight * 2;
      }
    }
    score += downScore;
    breakdown.downProg = downScore;
  }

  if (config.typeVariety.enabled && prev) {
    const prevType = (prev.type || "").toLowerCase();
    const candidateType = (candidate.type || "").toLowerCase();
    let typeScore = 0;
    if (prevType === candidateType) {
      typeScore -= config.typeVariety.weight * 6;
    } else {
      const prevRunPass = classifyRunPass(prev.type);
      const candidateRunPass = classifyRunPass(candidate.type);
      if (
        prevRunPass !== "either" &&
        candidateRunPass !== "either" &&
        prevRunPass !== candidateRunPass
      ) {
        typeScore += config.typeVariety.weight * 5;
      } else {
        typeScore += config.typeVariety.weight * 3;
      }
    }
    if (placed.length >= 2) {
      const prevPrev = placed[placed.length - 2];
      if (
        (prevPrev.type || "").toLowerCase() === prevType &&
        prevType === candidateType
      ) {
        typeScore -= config.typeVariety.weight * 10;
      }
    }
    score += typeScore;
    breakdown.typeVariety = typeScore;
  }

  if (config.personnelCluster.enabled && prev) {
    const prevPersonnel = (prev.personnel || "").toLowerCase();
    const candidatePersonnel = (candidate.personnel || "").toLowerCase();
    let personnelScore = 0;
    if (prevPersonnel === candidatePersonnel) {
      personnelScore = config.personnelCluster.weight * 5;
    }
    score += personnelScore;
    breakdown.personnel = personnelScore;
  }

  if (config.tempoVariety.enabled && prev) {
    const prevTempo = (prev.tempo || "").toLowerCase();
    const candidateTempo = (candidate.tempo || "").toLowerCase();
    let tempoScore = 0;
    if (prevTempo === candidateTempo) {
      tempoScore -= config.tempoVariety.weight * 4;
    } else {
      tempoScore += config.tempoVariety.weight * 2;
    }
    score += tempoScore;
    breakdown.tempo = tempoScore;
  }

  if (config.formationSpread.enabled && prev) {
    const prevFormation = (prev.formation || "").toLowerCase();
    const candidateFormation = (candidate.formation || "").toLowerCase();
    let formationScore = 0;
    if (prevFormation === candidateFormation) {
      formationScore -= config.formationSpread.weight * 5;
    } else {
      formationScore += config.formationSpread.weight * 2;
    }
    score += formationScore;
    breakdown.formation = formationScore;
  }

  if (
    config.runPassBalance &&
    config.runPassBalance.enabled &&
    placed.length > 0
  ) {
    const targetRunPct = (config.runPassBalance.targetRunPct || 50) / 100;
    const candidateRunPass = classifyRunPass(candidate.type);
    let runPassScore = 0;
    if (candidateRunPass !== "either") {
      let runs = 0;
      let passes = 0;
      placed.forEach((play) => {
        const runPass = classifyRunPass(play.type);
        if (runPass === "run") runs++;
        else if (runPass === "pass") passes++;
      });
      const total = runs + passes;
      if (total > 0) {
        const currentRunPct = runs / total;
        if (candidateRunPass === "run" && currentRunPct < targetRunPct) {
          runPassScore = config.runPassBalance.weight * 6;
        } else if (
          candidateRunPass === "pass" &&
          currentRunPct > targetRunPct
        ) {
          runPassScore = config.runPassBalance.weight * 6;
        } else if (
          candidateRunPass === "run" &&
          currentRunPct > targetRunPct + 0.15
        ) {
          runPassScore = -(config.runPassBalance.weight * 4);
        } else if (
          candidateRunPass === "pass" &&
          currentRunPct < targetRunPct - 0.15
        ) {
          runPassScore = -(config.runPassBalance.weight * 4);
        }
      }
    }
    score += runPassScore;
    breakdown.runPassBal = runPassScore;
  }

  if (config.constraintPairing && config.constraintPairing.enabled && prev) {
    let constraintScore = 0;
    if (areConstraintLinked(prev, candidate)) {
      constraintScore = config.constraintPairing.weight * 8;
    }
    if (
      placed.length >= 2 &&
      areConstraintLinked(placed[placed.length - 2], candidate)
    ) {
      constraintScore = Math.max(
        constraintScore,
        config.constraintPairing.weight * 5,
      );
    }
    score += constraintScore;
    breakdown.constraint = constraintScore;
  }

  if (config._returnBreakdown) {
    return { score, breakdown };
  }
  return score;
}

function runSmartScript(plays, config) {
  const remaining = [...plays];
  const result = [];
  const useLookahead = plays.length <= 80;
  const tieThreshold = 3;

  for (let index = 0; index < plays.length; index++) {
    const scored = [];

    for (let candidateIndex = 0; candidateIndex < remaining.length; candidateIndex++) {
      let score = scoreCandidate(remaining[candidateIndex], index, result, config);
      if (typeof score === "object") score = score.score;

      if (useLookahead && remaining.length > 1 && index < plays.length - 1) {
        const hypothetical = [...result, remaining[candidateIndex]];
        let bestNext = -Infinity;
        for (let lookaheadIndex = 0; lookaheadIndex < remaining.length; lookaheadIndex++) {
          if (lookaheadIndex === candidateIndex) continue;
          let nextScore = scoreCandidate(
            remaining[lookaheadIndex],
            index + 1,
            hypothetical,
            config,
          );
          if (typeof nextScore === "object") nextScore = nextScore.score;
          if (nextScore > bestNext) bestNext = nextScore;
        }
        score += bestNext * 0.35;
      }

      scored.push({ idx: candidateIndex, score });
    }

    scored.sort((a, b) => b.score - a.score);

    const bestScore = scored[0].score;
    const tiedCandidates = scored.filter(
      (candidate) => candidate.score >= bestScore - tieThreshold,
    );
    const pick =
      tiedCandidates[Math.floor(Math.random() * tiedCandidates.length)];

    result.push(remaining[pick.idx]);
    remaining.splice(pick.idx, 1);
  }

  return result;
}

async function openSmartScript() {
  const plays = script.filter((play) => !play.isSeparator);
  if (plays.length < 2) {
    await showModal("Add at least 2 plays to the script to use Smart Script.", {
      title: "Smart Script",
      icon: "🧠",
    });
    return;
  }

  smartScriptTargetPeriod = null;

  const modal = document.getElementById("smartScriptModal");
  if (!modal) return;
  modal.classList.add("show");

  const titleEl =
    modal.querySelector("h3") || modal.querySelector(".modal-title");
  if (titleEl) {
    titleEl.textContent = "🧠 Smart Script";
  }

  [
    "HashFlow",
    "DownProg",
    "TypeVariety",
    "Personnel",
    "Tempo",
    "Formation",
    "RunPassBal",
    "Constraint",
  ].forEach((name) => {
    const slider = document.getElementById("ssWeight" + name);
    const display = document.getElementById("ssWeight" + name + "Val");
    if (slider && display) {
      slider.oninput = () => {
        display.textContent = slider.value;
      };
    }
  });

  const runPctSlider = document.getElementById("ssRunPct");
  const runPctDisplay = document.getElementById("ssRunPctVal");
  if (runPctSlider && runPctDisplay) {
    runPctSlider.oninput = () => {
      runPctDisplay.textContent = runPctSlider.value + "%";
    };
  }

  document.getElementById("smartScriptPreview").innerHTML = "";
}

function closeSmartScript() {
  const modal = document.getElementById("smartScriptModal");
  if (!modal) return;
  modal.classList.remove("show");
  smartScriptTargetPeriod = null;
  const titleEl =
    modal.querySelector("h3") || modal.querySelector(".modal-title");
  if (titleEl) titleEl.textContent = "🧠 Smart Script";
}

function previewSmartScript() {
  const config = getSmartScriptConfig();

  let periods = getScriptPeriods();
  if (smartScriptTargetPeriod !== null) {
    const targetSep = script[smartScriptTargetPeriod];
    periods = periods.filter(
      (period) => period.separator && period.separator.id === targetSep.id,
    );
  }
  const previewEl = document.getElementById("smartScriptPreview");
  let html =
    '<table class="smart-preview-table"><thead><tr><th>#</th><th>Hash</th><th>Type</th><th>R/P</th><th>Formation</th><th>Play</th><th>Personnel</th><th>Down</th><th>Flow</th><th>Score</th></tr></thead><tbody>';
  let num = 1;

  periods.forEach((period) => {
    if (period.separator) {
      html += `<tr style="background:${UI_COLORS.bgDarkNav};color:white;font-weight:600;"><td colspan="10">${period.separator.label || "Period"}</td></tr>`;
    }
    const sorted = runSmartScript(period.plays, config);
    const breakdownConfig = { ...config, _returnBreakdown: true };
    let runs = 0;
    let passes = 0;

    sorted.forEach((play, index) => {
      const hash = normalizeHash(play.preferredHash) || "-";
      const hitResult = inferHashFromHitChart(play);
      const runPass = classifyRunPass(play.type);
      if (runPass === "run") runs++;
      else if (runPass === "pass") passes++;
      const runPassLabel = runPass === "run" ? "🏃R" : runPass === "pass" ? "🏈P" : "~";

      let arrow = "";
      if (hitResult.hash) {
        arrow = hitResult.isRun
          ? `🏃 ${hitResult.hash}`
          : `🏈 → ${hitResult.hash}`;
      }

      const placedBefore = sorted.slice(0, index);
      const result = scoreCandidate(play, index, placedBefore, breakdownConfig);
      const scoreVal = typeof result === "object" ? result.score : result;
      const breakdown = typeof result === "object" ? result.breakdown : {};

      const parts = [];
      if (breakdown.hashFlow) parts.push("Hash:" + breakdown.hashFlow);
      if (breakdown.startHash) parts.push("Start:" + breakdown.startHash);
      if (breakdown.downProg) parts.push("Down:" + breakdown.downProg);
      if (breakdown.typeVariety) parts.push("Type:" + breakdown.typeVariety);
      if (breakdown.personnel) parts.push("Pers:" + breakdown.personnel);
      if (breakdown.tempo) parts.push("Tempo:" + breakdown.tempo);
      if (breakdown.formation) parts.push("Form:" + breakdown.formation);
      if (breakdown.runPassBal) parts.push("R/P:" + breakdown.runPassBal);
      if (breakdown.constraint) parts.push("Constr:" + breakdown.constraint);
      const tooltip = parts.length > 0 ? parts.join(" | ") : "—";

      const scoreColor =
        scoreVal > 0
          ? UI_COLORS.scoreGreen
          : scoreVal < 0
            ? UI_COLORS.scoreRed
            : UI_COLORS.textLight;

      html += `<tr>
        <td>${num++}</td>
        <td>${escapeHtml(hash)}</td>
        <td>${escapeHtml(play.type || "")}</td>
        <td>${runPassLabel}</td>
        <td>${escapeHtml(play.formation || "")}</td>
        <td>${escapeHtml(play.play || "")}</td>
        <td>${escapeHtml(play.personnel || "")}</td>
        <td>${escapeHtml(play.preferredDown || "-")}</td>
        <td class="hash-arrow">${arrow}</td>
        <td title="${escapeHtml(tooltip)}" style="color:${scoreColor};cursor:help;font-weight:600;">${scoreVal > 0 ? "+" : ""}${scoreVal}</td>
      </tr>`;
    });

    const total = runs + passes;
    if (total > 0) {
      const runPct = Math.round((runs / total) * 100);
      html += `<tr style="background:${UI_COLORS.bgDarkNav};color:#aaa;font-size:0.85em;"><td colspan="10">📊 Period R/P: ${runs}R / ${passes}P (${runPct}% run)</td></tr>`;
    }
  });

  html += "</tbody></table>";
  previewEl.innerHTML = html;
}

function applySmartScript() {
  saveScriptState();
  const config = getSmartScriptConfig();

  if (smartScriptTargetPeriod !== null) {
    const sepIdx = smartScriptTargetPeriod;
    let endIdx = sepIdx + 1;
    while (endIdx < script.length && !script[endIdx].isSeparator) endIdx++;
    const periodPlays = script.slice(sepIdx + 1, endIdx);
    const sorted = runSmartScript(periodPlays, config);

    let currentHash = config.startHash.enabled ? config.startHash.hash : "";
    let hasFlowData = config.startHash.enabled;
    sorted.forEach((play) => {
      const hitResult = inferHashFromHitChart(play);
      const prefHash = normalizeHash(play.preferredHash);
      if (hasFlowData && currentHash) {
        play.hash = currentHash.charAt(0);
      } else if (prefHash) {
        play.hash = prefHash.charAt(0);
      }
      if (play.practiceFront) play.defFront = play.practiceFront;
      if (play.practiceCoverage) play.defCoverage = play.practiceCoverage;
      if (play.practiceStunt) play.defStunt = play.practiceStunt;
      if (play.practiceBlitz) play.defBlitz = play.practiceBlitz;
      if (hitResult.hash) {
        currentHash = hitResult.hash;
        hasFlowData = true;
      } else {
        hasFlowData = false;
      }
    });

    script.splice(sepIdx + 1, endIdx - sepIdx - 1, ...sorted);

    const periodLabel = script[sepIdx].label || "Period";
    renderScript();
    closeSmartScript();
    setScriptToolbarStatus(`Smart Script applied to ${periodLabel}`, "success", AUTOSAVE_DEBOUNCE_MS);
    return;
  }

  const periods = getScriptPeriods();
  const newScript = [];
  periods.forEach((period) => {
    if (period.separator) {
      newScript.push(period.separator);
    }
    const sorted = runSmartScript(period.plays, config);

    let currentHash = config.startHash.enabled ? config.startHash.hash : "";
    let hasFlowData = config.startHash.enabled;
    sorted.forEach((play) => {
      const hitResult = inferHashFromHitChart(play);
      const prefHash = normalizeHash(play.preferredHash);

      if (hasFlowData && currentHash) {
        play.hash = currentHash.charAt(0);
      } else if (prefHash) {
        play.hash = prefHash.charAt(0);
      }

      if (play.practiceFront) play.defFront = play.practiceFront;
      if (play.practiceCoverage) play.defCoverage = play.practiceCoverage;
      if (play.practiceStunt) play.defStunt = play.practiceStunt;
      if (play.practiceBlitz) play.defBlitz = play.practiceBlitz;

      if (hitResult.hash) {
        currentHash = hitResult.hash;
        hasFlowData = true;
      } else {
        hasFlowData = false;
      }
      newScript.push(play);
    });
  });

  script = newScript;
  renderScript();
  closeSmartScript();
  setScriptToolbarStatus("Smart Script applied", "success", AUTOSAVE_DEBOUNCE_MS);
}

function getScriptPeriods() {
  const periods = [];
  let current = { separator: null, plays: [] };

  script.forEach((item) => {
    if (item.isSeparator) {
      if (current.plays.length > 0 || current.separator) {
        periods.push(current);
      }
      current = { separator: item, plays: [] };
    } else {
      current.plays.push(item);
    }
  });

  if (current.plays.length > 0 || current.separator) {
    periods.push(current);
  }

  return periods;
}