// Main application logic for Practice Script & Playbook

// Global state
let plays = [];
let script = [];
let scriptWristband = null;
let filteredPlays = [];

// Dirty tracking — marks when working data has unsaved changes
let scriptDirty = false;
let wristbandDirty = false;

/**
 * Mark the working script as having unsaved changes
 */
function markScriptDirty() {
  scriptDirty = true;
}

/**
 * Mark the working script as clean (just saved or freshly loaded)
 */
function markScriptClean() {
  scriptDirty = false;
}

/**
 * Mark the working wristband as having unsaved changes
 */
function markWristbandDirty() {
  wristbandDirty = true;
}

/**
 * Mark the working wristband as clean
 */
function markWristbandClean() {
  wristbandDirty = false;
}

// Warn before closing tab with unsaved work
window.addEventListener("beforeunload", (e) => {
  if (scriptDirty || wristbandDirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/**
 * Show a specific tab panel
 * @param {string} tabName - Name of the tab to show
 */
function showTab(tabName) {
  // Track active tab for help panel
  currentActiveTab = tabName;

  // Hide all panels
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));

  // Show selected panel
  document.getElementById(tabName).classList.add("active");

  // Update tab buttons
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.remove("active"));
  if (typeof event !== "undefined" && event && event.target) {
    event.target.classList.add("active");
  } else {
    // Find the tab button for this tab by matching text or position
    const tabMap = {
      playbook: 0,
      script: 1,
      wristband: 2,
      tendencies: 3,
      callsheet: 4,
      installation: 5,
      dashboard: 6,
    };
    const tabs = document.querySelectorAll(".tab");
    const idx = tabMap[tabName];
    if (idx !== undefined && tabs[idx]) tabs[idx].classList.add("active");
  }

  // Initialize installation if switching to that tab
  if (tabName === "installation") {
    initInstallation();
  }
  // Initialize wristband if switching to that tab
  if (tabName === "wristband") {
    if (wristbandCards.length === 0) {
      initWristband();
    } else {
      populateWristbandCheckboxFilters();
      renderWristbandPlays();
      renderCardTabs();
    }
  }
  // Initialize tendencies if switching to that tab
  if (tabName === "tendencies") {
    initTendencies();
  }
  // Initialize call sheet if switching to that tab
  if (tabName === "callsheet") {
    if (Object.keys(callSheet).length === 0) {
      initCallSheet();
    }
    renderCallSheet();
  }
  // Initialize dashboard if switching to that tab
  if (tabName === "dashboard") {
    renderDashboard();
  }
}

// ============ Floating Help Panel ============

let currentActiveTab = "playbook";

function toggleHelpPanel() {
  const overlay = document.getElementById("helpOverlay");
  const fab = document.getElementById("helpFab");
  if (!overlay) return;
  const isOpen = overlay.classList.contains("visible");
  if (isOpen) {
    overlay.classList.remove("visible");
    fab.classList.remove("help-fab-active");
  } else {
    renderHelpContent();
    overlay.classList.add("visible");
    fab.classList.add("help-fab-active");
  }
}

function closeHelpPanel(e) {
  if (e.target === e.currentTarget) toggleHelpPanel();
}

function renderHelpContent() {
  const title = document.getElementById("helpPanelTitle");
  const body = document.getElementById("helpPanelBody");
  if (!body) return;

  const helpData = getHelpDataForTab(currentActiveTab);
  title.textContent = helpData.title;

  let html = "";
  helpData.sections.forEach((sec) => {
    html += `<div class="help-section">`;
    html += `<div class="help-section-title">${sec.icon} ${sec.name}</div>`;
    html += `<div class="help-items">`;
    sec.items.forEach((item) => {
      const keyHtml = item.key
        ? `<span class="help-key">${item.key}</span>`
        : "";
      html += `<div class="help-item">${keyHtml}<span class="help-desc">${item.desc}</span></div>`;
    });
    html += `</div></div>`;
  });
  body.innerHTML = html;
}

// getHelpDataForTab() lives in js/help.js

/**
 * Show the upload section to load a new CSV
 */
function showUpload() {
  document.getElementById("mainApp").style.display = "none";
  document.getElementById("uploadSection").style.display = "flex";

  // Show back button if we have data
  const backBtn = document.getElementById("backToAppBtn");
  if (backBtn && plays.length > 0) {
    backBtn.style.display = "block";
  }
}

/**
 * Go back to the main app from upload screen
 */
function backToApp() {
  if (plays.length > 0) {
    document.getElementById("uploadSection").style.display = "none";
    document.getElementById("mainApp").style.display = "block";
  }
}

/**
 * Handle CSV file upload
 * @param {Event} event - File input change event
 */
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    plays = parseCSV(text);
    filteredPlays = [...plays];

    // Store in localStorage
    storageManager.set("playbook", plays);

    // Show main app
    document.getElementById("uploadSection").style.display = "none";
    document.getElementById("mainApp").style.display = "block";

    // Initialize UI
    populateFilters();
    restoreColumnVisibility();
    initPlaybookKeyboard();
    filterPlays(); // Apply any restored filters
    updateStatsBar();
    renderAvailablePlays();
    loadSavedScriptsList();
    populateScriptWristbandSelect();
    restoreScriptDisplayOptions();
    ensureFirstPeriod();
    renderScript();

    // Load call sheet data if stored
    const storedCallSheet = storageManager.get(STORAGE_KEYS.CALL_SHEET, null);
    if (storedCallSheet) {
      callSheet = storedCallSheet;
    }
  };
  reader.readAsText(file);
}

/**
 * Initialize the application
 */
function initApp() {
  // Check for stored playbook
  const storedPlaybook = storageManager.get(STORAGE_KEYS.PLAYBOOK, null);
  if (storedPlaybook) {
    plays = storedPlaybook;
    filteredPlays = [...plays];
    document.getElementById("uploadSection").style.display = "none";
    document.getElementById("mainApp").style.display = "block";
    populateFilters();
    restorePlaybookState();
    restoreColumnVisibility();
    initPlaybookKeyboard();
    // Apply restored state (filters and sort)
    if (currentSortColumn) {
      // Update sort icon
      const activeIcon = document.querySelector(
        `#playbookTable .sort-icon[data-col="${currentSortColumn}"]`,
      );
      if (activeIcon) activeIcon.classList.add(currentSortDirection);
    }
    filterPlays(); // This will also apply any sort
    updateStatsBar();
    renderAvailablePlays();
    loadSavedScriptsList();
    populateScriptWristbandSelect();
    restoreScriptDisplayOptions();
    ensureFirstPeriod();
    renderScript();

    // Check for unsaved script draft
    checkScriptDraft();

    // Check for unsaved wristband draft
    if (typeof checkWristbandDraft === "function") {
      checkWristbandDraft();
    }

    // Check for unsaved call sheet draft
    if (typeof checkCallSheetDraft === "function") {
      checkCallSheetDraft();
    }

    // Restore call sheet display options
    if (typeof restoreCallSheetDisplayOptions === "function") {
      restoreCallSheetDisplayOptions();
    }

    // Load call sheet data if stored
    const storedCallSheet = storageManager.get(STORAGE_KEYS.CALL_SHEET, null);
    if (storedCallSheet) {
      callSheet = storedCallSheet;
    }
  }

  // Set up drag and drop for file upload
  const uploadBox = document.querySelector(".upload-box");
  uploadBox.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadBox.classList.add("dragover");
  });
  uploadBox.addEventListener("dragleave", () => {
    uploadBox.classList.remove("dragover");
  });
  uploadBox.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadBox.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) {
      document.getElementById("csvFile").files = e.dataTransfer.files;
      handleFileUpload({ target: { files: [file] } });
    }
  });

  // Set up drag and drop for script container
  const scriptContainer = document.getElementById("scriptPlays");
  scriptContainer.addEventListener("dragover", handleDragOver);
  scriptContainer.addEventListener("dragleave", handleDragLeave);
  scriptContainer.addEventListener("drop", handleDrop);

  // Set today's date as default
  document.getElementById("scriptDate").valueAsDate = new Date();

  // Initialize swatch handlers for wristband
  initSwatchHandlers();

  // Initialize script keyboard shortcuts
  initScriptKeyboard();
}

/**
 * Export all data to a JSON backup file
 * Uses centralized storage manager for complete backup
 */
function exportBackup() {
  exportCompleteBackup();
}

/**
 * Import data from a JSON backup file
 * Uses centralized storage manager for complete restore
 */
function importBackup(event) {
  importCompleteBackup(event);
}

// ============ Game Week Dashboard ============

/**
 * Render the Game Week Dashboard panel
 */
function renderDashboard() {
  // Populate opponent dropdown
  const select = document.getElementById("dashOpponentSelect");
  const weekInput = document.getElementById("dashWeekLabel");
  const badge = document.getElementById("dashActiveOpponentBadge");

  if (!select) return;

  const opponents = storageManager.get("defensiveTendencies", []);
  const gw = getGameWeek();

  // Build opponent options
  let optHtml = '<option value="">— Select Opponent —</option>';
  opponents.forEach((opp, idx) => {
    const sel = gw.opponentIndex === idx ? "selected" : "";
    optHtml += `<option value="${idx}" ${sel}>${opp.name} (${opp.plays.length} plays)</option>`;
  });
  select.innerHTML = optHtml;

  if (weekInput) weekInput.value = gw.weekLabel || "";
  // Populate notes
  const notesArea = document.getElementById("dashNotesArea");
  if (notesArea && notesArea !== document.activeElement) {
    notesArea.value = gw.notes || "";
  }

  if (badge) {
    badge.innerHTML = gw.opponentName
      ? `<span class="dash-opp-active">🏈 ${gw.opponentName}${gw.weekLabel ? " — " + gw.weekLabel : ""}</span>`
      : '<span class="dash-opp-none">No opponent selected</span>';
  }

  // Build status cards
  const cardsEl = document.getElementById("dashCards");
  if (cardsEl) {
    const playCount = typeof plays !== "undefined" ? plays.length : 0;
    const scriptCount = script.filter((p) => !p.isSeparator).length;
    const savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
    const savedScriptCount = Array.isArray(savedScripts)
      ? savedScripts.length
      : Object.keys(savedScripts).length;
    const wristbandCount =
      typeof wristbandCards !== "undefined" ? wristbandCards.length : 0;
    const savedWristbands = storageManager.get(
      STORAGE_KEYS.SAVED_WRISTBANDS,
      [],
    );

    // Count call sheet plays
    let csPlayCount = 0;
    let csCatsFilled = 0;
    if (typeof callSheet !== "undefined") {
      Object.values(callSheet).forEach((data) => {
        const count = (data.left || []).length + (data.right || []).length;
        if (count > 0) {
          csPlayCount += count;
          csCatsFilled++;
        }
      });
    }

    const oppPlays = gw.opponentName
      ? opponents[gw.opponentIndex]?.plays?.length || 0
      : 0;

    cardsEl.innerHTML = `
      <div class="dash-card dash-card-playbook">
        <div class="dash-card-icon">📖</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${playCount}</div>
          <div class="dash-card-label">Plays Loaded</div>
        </div>
      </div>
      <div class="dash-card dash-card-script">
        <div class="dash-card-icon">📋</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${scriptCount}</div>
          <div class="dash-card-label">On Script</div>
          <div class="dash-card-sub">${savedScriptCount} saved</div>
        </div>
      </div>
      <div class="dash-card dash-card-wristband">
        <div class="dash-card-icon">⌚</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${wristbandCount}</div>
          <div class="dash-card-label">Wristband Cards</div>
          <div class="dash-card-sub">${savedWristbands.length} saved</div>
        </div>
      </div>
      <div class="dash-card dash-card-tendencies">
        <div class="dash-card-icon">🎯</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${oppPlays}</div>
          <div class="dash-card-label">Scouting Plays</div>
          <div class="dash-card-sub">${opponents.length} opponent${opponents.length !== 1 ? "s" : ""}</div>
        </div>
      </div>
      <div class="dash-card dash-card-callsheet">
        <div class="dash-card-icon">🗂️</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${csPlayCount}</div>
          <div class="dash-card-label">On Call Sheet</div>
          <div class="dash-card-sub">${csCatsFilled} categories</div>
        </div>
      </div>
    `;
  }

  // Build scouting summary
  const scoutEl = document.getElementById("dashScoutingSection");
  if (scoutEl) {
    const opp = getActiveOpponent();
    if (opp && opp.plays.length > 0) {
      const overall = queryTendencies(opp, {});
      const thirdDown = queryTendencies(opp, { down: ["3"] });
      const rz = queryTendencies(opp, { situation: ["Red Zone"] });

      scoutEl.innerHTML = `
        <h3 class="dash-section-title">🎯 Scouting Summary — ${opp.name}</h3>
        <div class="dash-scout-grid">
          <div class="dash-scout-card">
            <div class="dash-scout-card-title">Overall (${overall.total} plays)</div>
            <div class="dash-scout-items">
              ${overall.topFront
                .slice(0, 3)
                .map(
                  (f) =>
                    `<div class="dash-scout-row"><span>Front:</span> <b>${f.term}</b> <span class="dash-scout-pct">${f.pct}%</span></div>`,
                )
                .join("")}
              ${overall.topCoverage
                .slice(0, 3)
                .map(
                  (c) =>
                    `<div class="dash-scout-row"><span>Cov:</span> <b>${c.term}</b> <span class="dash-scout-pct">${c.pct}%</span></div>`,
                )
                .join("")}
              <div class="dash-scout-row"><span>Blitz Rate:</span> <b>${overall.blitzRate}%</b></div>
            </div>
          </div>
          <div class="dash-scout-card">
            <div class="dash-scout-card-title">3rd Down (${thirdDown.total} plays)</div>
            <div class="dash-scout-items">
              ${thirdDown.topFront
                .slice(0, 2)
                .map(
                  (f) =>
                    `<div class="dash-scout-row"><span>Front:</span> <b>${f.term}</b> <span class="dash-scout-pct">${f.pct}%</span></div>`,
                )
                .join("")}
              ${thirdDown.topCoverage
                .slice(0, 2)
                .map(
                  (c) =>
                    `<div class="dash-scout-row"><span>Cov:</span> <b>${c.term}</b> <span class="dash-scout-pct">${c.pct}%</span></div>`,
                )
                .join("")}
              <div class="dash-scout-row"><span>Blitz Rate:</span> <b>${thirdDown.blitzRate}%</b></div>
            </div>
          </div>
          <div class="dash-scout-card">
            <div class="dash-scout-card-title">Red Zone (${rz.total} plays)</div>
            <div class="dash-scout-items">
              ${rz.topFront
                .slice(0, 2)
                .map(
                  (f) =>
                    `<div class="dash-scout-row"><span>Front:</span> <b>${f.term}</b> <span class="dash-scout-pct">${f.pct}%</span></div>`,
                )
                .join("")}
              ${rz.topCoverage
                .slice(0, 2)
                .map(
                  (c) =>
                    `<div class="dash-scout-row"><span>Cov:</span> <b>${c.term}</b> <span class="dash-scout-pct">${c.pct}%</span></div>`,
                )
                .join("")}
              <div class="dash-scout-row"><span>Blitz Rate:</span> <b>${rz.blitzRate}%</b></div>
            </div>
          </div>
        </div>
      `;
    } else {
      scoutEl.innerHTML = `
        <div class="dash-no-scouting">
          <p>📊 Select an opponent above to see scouting intel here</p>
          <p class="dash-hint">Go to the <strong>Def Tendencies</strong> tab to add opponents and chart plays</p>
        </div>
      `;
    }
  }

  // Build quick links
  const linksEl = document.getElementById("dashQuickLinks");
  if (linksEl) {
    linksEl.innerHTML = `
      <h3 class="dash-section-title">⚡ Quick Actions</h3>
      <div class="dash-links-grid">
        <button class="dash-link-btn" onclick="dashGoToTab('script')">📋 Build Script</button>
        <button class="dash-link-btn" onclick="dashGoToTab('callsheet')">🗂️ Edit Call Sheet</button>
        <button class="dash-link-btn" onclick="dashGoToTab('installation')">📦 Installation</button>
        <button class="dash-link-btn" onclick="dashGoToTab('tendencies')">🎯 Chart Tendencies</button>
        <button class="dash-link-btn" onclick="dashGoToTab('wristband')">⌚ Wristband Maker</button>
        <button class="dash-link-btn dash-link-print" onclick="printFullGamePlan()">🖨️ Print Game Plan</button>
        <button class="dash-link-btn" onclick="showStorageInfo()">💾 Storage Info</button>
      </div>
    `;
  }
}

/**
 * Handle game week notes change
 */
let _dashNotesTimer = null;
function onDashNotesChange(value) {
  // Debounce saves
  clearTimeout(_dashNotesTimer);
  _dashNotesTimer = setTimeout(() => {
    const gw = getGameWeek();
    gw.notes = value;
    storageManager.set(GAME_WEEK_KEY, gw);
  }, 400);
}

/**
 * Print Full Game Plan — consolidated print with scouting, call sheet, and notes
 */
function printFullGamePlan() {
  const gw = getGameWeek();
  const opp = getActiveOpponent();

  // Build the print content
  let html = '<div class="gp-print-wrap">';

  // Header
  html += `<div class="gp-print-header">
    <h1>🏈 Game Plan${gw.opponentName ? " — vs. " + gw.opponentName : ""}${gw.weekLabel ? " (" + gw.weekLabel + ")" : ""}</h1>
    <p class="gp-print-date">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
  </div>`;

  // Game Week Notes
  if (gw.notes && gw.notes.trim()) {
    html += `<div class="gp-print-section">
      <h2 class="gp-print-section-title">📝 Game Week Notes</h2>
      <div class="gp-print-notes">${gw.notes.replace(/\n/g, "<br>")}</div>
    </div>`;
  }

  // Scouting Summary
  if (opp && opp.plays.length > 0) {
    const overall = queryTendencies(opp, {});
    const thirdDown = queryTendencies(opp, { down: ["3"] });
    const rz = queryTendencies(opp, { situation: ["Red Zone"] });

    html += `<div class="gp-print-section">
      <h2 class="gp-print-section-title">🎯 Scouting Report — ${opp.name} (${overall.total} charted plays)</h2>
      <div class="gp-scout-grid">`;

    const sections = [
      { label: "Overall", data: overall },
      { label: "3rd Down", data: thirdDown },
      { label: "Red Zone", data: rz },
    ];

    sections.forEach((s) => {
      html += `<div class="gp-scout-col">
        <h3>${s.label} (${s.data.total})</h3>
        <table class="gp-scout-table">
          <tr><th>Fronts</th><th>%</th></tr>
          ${s.data.topFront
            .slice(0, 4)
            .map((f) => `<tr><td>${f.term}</td><td>${f.pct}%</td></tr>`)
            .join("")}
        </table>
        <table class="gp-scout-table">
          <tr><th>Coverages</th><th>%</th></tr>
          ${s.data.topCoverage
            .slice(0, 4)
            .map((c) => `<tr><td>${c.term}</td><td>${c.pct}%</td></tr>`)
            .join("")}
        </table>
        <p class="gp-blitz-line">Blitz Rate: <strong>${s.data.blitzRate}%</strong></p>
        ${s.data.topStunt && s.data.topStunt.length > 0 ? `<p class="gp-stunt-line">Top Stunt: ${s.data.topStunt[0].term} (${s.data.topStunt[0].pct}%)</p>` : ""}
      </div>`;
    });

    html += `</div></div>`;
  }

  // Call Sheet Summary (both pages)
  if (typeof CALLSHEET_FRONT !== "undefined") {
    ["Front", "Back"].forEach((pageName) => {
      const cats = pageName === "Front" ? CALLSHEET_FRONT : CALLSHEET_BACK;
      const filledCats = cats.filter((cat) => {
        const data = callSheet[cat.id];
        return data && (data.left || []).length + (data.right || []).length > 0;
      });
      if (filledCats.length === 0) return;

      html += `<div class="gp-print-section gp-cs-section">
        <h2 class="gp-print-section-title">🗂️ Call Sheet — ${pageName} Page</h2>
        <div class="gp-cs-grid">`;

      filledCats.forEach((cat) => {
        const data = callSheet[cat.id] || { left: [], right: [] };
        const displayName =
          typeof getCategoryDisplayName === "function"
            ? getCategoryDisplayName(cat)
            : cat.name;
        const allPlays = [...(data.left || []), ...(data.right || [])];
        const textColor =
          cat.color === "#ffc107" || cat.color === "#f8f9fa" ? "#000" : "#fff";

        html += `<div class="gp-cs-cat">
          <div class="gp-cs-cat-header" style="background:${cat.color};color:${textColor}">${displayName} (${allPlays.length})</div>
          <div class="gp-cs-cat-plays">`;

        // Show left hash
        if ((data.left || []).length > 0) {
          html += `<div class="gp-cs-hash-group"><span class="gp-cs-hash-label">L:</span> `;
          html += (data.left || [])
            .map(
              (p) =>
                `<span class="gp-cs-play">${typeof getFullCall === "function" ? getFullCall(p) : p.play || p.name || "?"}</span>`,
            )
            .join(", ");
          html += `</div>`;
        }
        // Show right hash
        if ((data.right || []).length > 0) {
          html += `<div class="gp-cs-hash-group"><span class="gp-cs-hash-label">R:</span> `;
          html += (data.right || [])
            .map(
              (p) =>
                `<span class="gp-cs-play">${typeof getFullCall === "function" ? getFullCall(p) : p.play || p.name || "?"}</span>`,
            )
            .join(", ");
          html += `</div>`;
        }

        html += `</div></div>`;
      });

      html += `</div></div>`;
    });
  }

  html += "</div>";

  // Use the call sheet print container
  const container = document.getElementById("callSheetPrint");
  const content = document.getElementById("callSheetPrintContent");
  content.innerHTML = html;
  container.style.display = "block";

  // Print style
  let printStyle = document.getElementById("wristbandPrintStyle");
  if (!printStyle) {
    printStyle = document.createElement("style");
    printStyle.id = "wristbandPrintStyle";
    document.head.appendChild(printStyle);
  }
  printStyle.textContent =
    "@media print { @page { size: letter; margin: 0.4in; } }";

  setTimeout(() => {
    const restoreTitle = setPrintTitle("Game Plan", gw.opponentName || "");
    window.print();
    restoreTitle();
    container.style.display = "none";
  }, 100);
}

/**
 * Handle opponent selection change on dashboard
 */
function onDashOpponentChange(value) {
  const idx = value === "" ? null : parseInt(value, 10);
  const weekLabel = document.getElementById("dashWeekLabel")?.value || "";
  setGameWeek(idx, weekLabel);
  renderDashboard();
  const gw = getGameWeek();
  if (gw.opponentName) {
    showToast(`🏈 Active opponent: ${gw.opponentName}`);
  } else {
    showToast("Opponent cleared");
  }
}

/**
 * Handle week label change on dashboard
 */
function onDashWeekLabelChange(value) {
  const gw = getGameWeek();
  gw.weekLabel = value;
  storageManager.set(GAME_WEEK_KEY, gw);
  renderDashboard();
}

/**
 * Navigate to a tab from the dashboard quick links
 */
function dashGoToTab(tabName) {
  // Find the correct tab button and simulate click
  const tabs = document.querySelectorAll(".tab");
  const tabMap = {
    playbook: 0,
    script: 1,
    wristband: 2,
    tendencies: 3,
    callsheet: 4,
    installation: 5,
    dashboard: 6,
  };
  const idx = tabMap[tabName];
  if (idx !== undefined && tabs[idx]) {
    tabs[idx].click();
  }
}

// ============ CSV Template Modal ============

function showCSVTemplateModal() {
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay";

  const offenseHeaders = [
    ["PlayType", "Run / Pass / RPO / Screen", "Yes"],
    ["Personnel", "Personnel grouping (e.g. Blue, Red)", "Yes"],
    ["Formation", "Formation name", "Yes"],
    ["FormTag1", "Formation tag 1 (e.g. Rt, Lt)", ""],
    ["FormTag2", "Formation tag 2", ""],
    ["Under", "Under center / Shotgun / Pistol", ""],
    ["Back", "Backfield set (e.g. Strong, Weak)", ""],
    ["Shift", "Pre-snap shift", ""],
    ["Motion", "Motion call", ""],
    ["Protection", "Protection scheme", ""],
    ["LineCall", "O-Line call", ""],
    ["Play", "Full play call name", "Yes"],
    ["PlayTag1", "Play tag / modifier 1", ""],
    ["PlayTag2", "Play tag / modifier 2", ""],
    ["BasePlay", "Base concept (e.g. Inside Zone, Counter)", ""],
    ["OneWord", "One-word wristband call", ""],
    ["PreferredSituation", "Situation tag (e.g. Openers, Red Zone)", ""],
    ["PreferredDown", "Down preference (1, 2, 3, 4)", ""],
    ["PreferredDistance", "Distance preference (Short, Med, Long)", ""],
    ["PreferredHash", "Hash preference (L, M, R)", ""],
    ["PreferredFieldPosition", "Field position preference", ""],
    ["Tempo", "Tempo call (e.g. Freeze, Sugar, Fire)", ""],
    ["PracticeFront", "Practice rep front", ""],
    ["PracticeDefense", "Practice rep defense look", ""],
    ["PracticeCoverage", "Practice rep coverage", ""],
    ["PracticeBlitz", "Practice rep blitz", ""],
    ["PracticeStunt", "Practice rep stunt", ""],
    ["KeyPlayer1", "Key player to watch 1", ""],
    ["KeyPlayer2", "Key player to watch 2", ""],
    ["KeyPlayer3", "Key player to watch 3", ""],
    ["HitChart1", "Hit chart tag 1", ""],
    ["HitChart2", "Hit chart tag 2", ""],
    ["HitChart3", "Hit chart tag 3", ""],
    ["Constraint1", "Constraint / complement 1", ""],
    ["Constraint2", "Constraint / complement 2", ""],
    ["Constraint3", "Constraint / complement 3", ""],
    ["DeadVs", "Killed vs this defense", ""],
    ["Opponent", "Opponent tag", ""],
    ["Notes", "Free-form notes", ""],
  ];

  const defenseHeaders = [
    ["Opponent", "Opponent name", "Yes"],
    ["Week", "Week number", ""],
    ["Game", "Game number or name", ""],
    ["Quarter", "Quarter (1-4, OT)", ""],
    ["Time", "Game clock time", ""],
    ["Down", "Down (1-4)", "Yes"],
    ["Distance", "Distance to go", "Yes"],
    ["Hash", "Hash (L, M, R)", ""],
    ["Field Position", "Field position zone", ""],
    ["Yard Line", "Yard line number", ""],
    ["Situation", "Situation tag (e.g. Red Zone, 2-min)", ""],
    ["Offense Play Type", "Off. play type scouted", ""],
    ["Offense Formation", "Off. formation scouted", ""],
    ["Def Front", "Defensive front called", "Yes"],
    ["Def Coverage", "Coverage called", "Yes"],
    ["Def Stunt", "Stunt called", ""],
    ["Def Blitz", "Blitz called", ""],
    ["Blitzer 1", "Blitzing player 1", ""],
    ["Blitzer 2", "Blitzing player 2", ""],
    ["Blitzer 3", "Blitzing player 3", ""],
    ["Tackler 1", "Tackler 1", ""],
    ["Tackler 2", "Tackler 2", ""],
    ["Tackler 3", "Tackler 3", ""],
    ["Front Strength Direction", "Direction of front strength", ""],
    ["Coverage Strength Direction", "Direction of coverage strength", ""],
    ["Person Of Interest 1 Direction", "POI 1 alignment direction", ""],
    ["Person of Interest 2 Direction", "POI 2 alignment direction", ""],
    ["Person of Interest 3 Direction", "POI 3 alignment direction", ""],
    ["Turnover", "Turnover (Y/N)", ""],
    ["Turnover Forcer", "Player who forced turnover", ""],
    ["Turnover Player", "Player who committed turnover", ""],
    ["Tackle for Loss Player", "TFL player", ""],
    ["Penalty", "Penalty (Y/N)", ""],
    ["Penalty Player", "Penalty player", ""],
    ["Notes", "Free-form notes", ""],
  ];

  function buildTable(headers) {
    let rows = headers
      .map(([col, desc, req]) => {
        const badge = req ? '<span class="csv-tpl-req">Required</span>' : "";
        return `<tr><td class="csv-tpl-col">${col}</td><td class="csv-tpl-desc">${desc}</td><td class="csv-tpl-center">${badge}</td></tr>`;
      })
      .join("");
    return `<table class="csv-tpl-table">
      <thead><tr><th>Column Header</th><th>Description</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  overlay.innerHTML = `
    <div class="custom-modal csv-tpl-modal">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">📋</span>
        <h3 class="custom-modal-title">CSV Column Templates</h3>
      </div>
      <div class="custom-modal-body csv-tpl-body">
        <div class="csv-tpl-section">
          <div class="csv-tpl-section-header">
            <h4>🏈 Offensive Playbook</h4>
            <button class="btn btn-sm btn-primary" onclick="downloadCSVTemplate('offense')">⬇ Download Template</button>
          </div>
          <p class="csv-tpl-note">39 columns — used by Playbook, Script, Wristband, Call Sheet & Installation.</p>
          ${buildTable(offenseHeaders)}
        </div>
        <div class="csv-tpl-section">
          <div class="csv-tpl-section-header">
            <h4>🛡️ Defensive Tendencies</h4>
            <button class="btn btn-sm btn-primary" onclick="downloadCSVTemplate('defense')">⬇ Download Template</button>
          </div>
          <p class="csv-tpl-note">35 columns — imported on the Def Tendencies tab.</p>
          ${buildTable(defenseHeaders)}
        </div>
      </div>
      <div class="custom-modal-actions">
        <button class="btn btn-primary custom-modal-btn" id="csvTplOk">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));

  const okBtn = overlay.querySelector("#csvTplOk");
  okBtn.focus();

  function close() {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 200);
  }
  okBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Enter") {
      e.preventDefault();
      close();
    }
  });
}

function downloadCSVTemplate(type) {
  let headers;
  let filename;
  if (type === "offense") {
    headers = [
      "PlayType",
      "Personnel",
      "Formation",
      "FormTag1",
      "FormTag2",
      "Under",
      "Back",
      "Shift",
      "Motion",
      "Protection",
      "LineCall",
      "Play",
      "PlayTag1",
      "PlayTag2",
      "BasePlay",
      "OneWord",
      "PreferredSituation",
      "PreferredDown",
      "PreferredDistance",
      "PreferredHash",
      "PreferredFieldPosition",
      "Tempo",
      "PracticeFront",
      "PracticeDefense",
      "PracticeCoverage",
      "PracticeBlitz",
      "PracticeStunt",
      "KeyPlayer1",
      "KeyPlayer2",
      "KeyPlayer3",
      "HitChart1",
      "HitChart2",
      "HitChart3",
      "Constraint1",
      "Constraint2",
      "Constraint3",
      "DeadVs",
      "Opponent",
      "Notes",
    ];
    filename = "offensive_playbook_template.csv";
  } else {
    headers = [
      "Opponent",
      "Week",
      "Game",
      "Quarter",
      "Time",
      "Down",
      "Distance",
      "Hash",
      "Field Position",
      "Yard Line",
      "Situation",
      "Offense Play Type",
      "Offense Formation",
      "Def Front",
      "Def Coverage",
      "Def Stunt",
      "Def Blitz",
      "Blitzer 1",
      "Blitzer 2",
      "Blitzer 3",
      "Tackler 1",
      "Tackler 2",
      "Tackler 3",
      "Front Strength Direction",
      "Coverage Strength Direction",
      "Person Of Interest 1 Direction",
      "Person of Interest 2 Direction",
      "Person of Interest 3 Direction",
      "Turnover",
      "Turnover Forcer",
      "Turnover Player",
      "Tackle for Loss Player",
      "Penalty",
      "Penalty Player",
      "Notes",
    ];
    filename = "defensive_tendencies_template.csv";
  }
  const csv = headers.join(",") + "\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`⬇️ Downloaded ${filename}`);
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", initApp);

// Close any open dropdowns when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".more-tools-wrap")) {
    document
      .querySelectorAll(".more-tools-wrap.open")
      .forEach((el) => el.classList.remove("open"));
  }
});
