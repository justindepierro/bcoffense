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

function getHelpDataForTab(tab) {
  const data = {
    playbook: {
      title: "🏈 Playbook — Shortcuts & Features",
      sections: [
        {
          icon: "⌨️",
          name: "Keyboard Shortcuts",
          items: [
            { key: "↑ / ↓", desc: "Navigate rows" },
            { key: "Enter", desc: "Add selected play to script" },
            { key: "Ctrl/⌘ + C", desc: "Copy play name to clipboard" },
            { key: "?", desc: "Show keyboard shortcuts" },
            { key: "Esc", desc: "Close modals" },
          ],
        },
        {
          icon: "🖱️",
          name: "Mouse Interactions",
          items: [
            { key: "Click row", desc: "Select play" },
            { key: "Click play name", desc: "Copy play name" },
            { key: "Double-click row", desc: "Add play to script" },
            { key: "Hover row", desc: "Preview play details" },
            { key: "Click column header", desc: "Sort by column" },
          ],
        },
        {
          icon: "🔧",
          name: "Toolbar",
          items: [
            { key: "⚙️ Columns", desc: "Toggle column visibility" },
            {
              key: "🏈 Highlight",
              desc: "Highlight plays on a saved wristband",
            },
            { key: "📥 Export", desc: "Export all data as JSON backup" },
            { key: "📤 Import", desc: "Import a JSON backup file" },
            { key: "💾 Storage", desc: "View localStorage usage" },
          ],
        },
      ],
    },
    script: {
      title: "📝 Script Builder — Shortcuts & Features",
      sections: [
        {
          icon: "⌨️",
          name: "Keyboard",
          items: [
            { key: "Delete / Backspace", desc: "Remove all selected plays" },
          ],
        },
        {
          icon: "🖱️",
          name: "Available Plays",
          items: [
            { key: "Click + Add", desc: "Add a single play" },
            { key: "Drag play", desc: "Drag into script" },
            {
              key: "Checkbox → ✓ Add Selected",
              desc: "Batch-add checked plays",
            },
            { key: "➕ Add All", desc: "Add all filtered plays" },
          ],
        },
        {
          icon: "📋",
          name: "Script Plays",
          items: [
            { key: "Drag", desc: "Reorder plays" },
            {
              key: "Checkbox",
              desc: "Select for bulk edit (hash, front, cov, etc.)",
            },
            { key: "▲ / ▼", desc: "Move play up/down" },
            { key: "⧉", desc: "Duplicate play" },
            { key: "✕", desc: "Remove play" },
          ],
        },
        {
          icon: "📅",
          name: "Periods",
          items: [
            { key: "Color picker", desc: "Change period color" },
            { key: "Text input", desc: "Rename period" },
            { key: "▶ / ▼", desc: "Collapse/expand period" },
            { key: "▲ / ▼ arrows", desc: "Move period up/down" },
            { key: "⧉", desc: "Duplicate period with all plays" },
            { key: "💾", desc: "Save period as template" },
          ],
        },
        {
          icon: "⚡",
          name: "Per-Period Actions",
          items: [
            { key: "☑ Select All", desc: "Select all plays in period" },
            { key: "⬍ Sort", desc: "Sort period by chosen field" },
            { key: "↕ Reverse", desc: "Reverse play order" },
            { key: "🧠 Smart Script", desc: "Auto-optimize play order" },
            { key: "★ Preferred", desc: "Apply preferred metadata" },
          ],
        },
        {
          icon: "🔧",
          name: "Toolbar",
          items: [
            { key: "↩️ / ↪️", desc: "Undo / Redo" },
            { key: "🧠 Smart Script All", desc: "Optimize across all periods" },
            {
              key: "🎯 Auto-Fill Defense",
              desc: "Fill fronts/coverages from scouting data",
            },
            {
              key: "📋 → Call Sheet",
              desc: "Push period plays to matching call sheet categories",
            },
            { key: "📄 Print", desc: "Print script" },
            { key: "💾 Save", desc: "Save script" },
            { key: "★ Preferred", desc: "Apply preferred fields to all" },
            { key: "🔀 Shuffle", desc: "Randomize play order" },
          ],
        },
      ],
    },
    wristband: {
      title: "🃏 Wristband — Shortcuts & Features",
      sections: [
        {
          icon: "🖱️",
          name: "Available Plays",
          items: [{ key: "Double-click play", desc: "Add to next empty cell" }],
        },
        {
          icon: "📋",
          name: "Wristband Grid",
          items: [
            {
              key: "Click cell",
              desc: "Open edit popup (play, colors, On Two)",
            },
            { key: "Drag cell → cell", desc: "Swap two cells" },
          ],
        },
        {
          icon: "🎨",
          name: "Cell Edit Popup",
          items: [
            { key: "🗑️ Remove", desc: "Remove play from cell" },
            { key: "🔄 Change", desc: "Swap to a different play" },
            { key: "On Two checkbox", desc: "Add 💲 cadence prefix" },
            {
              key: "BG / Text swatches",
              desc: "Set cell background & text color",
            },
          ],
        },
        {
          icon: "🔧",
          name: "Toolbar",
          items: [
            { key: "Color buttons", desc: "Set header/number column color" },
            { key: "↩️ / ↪️", desc: "Undo / Redo" },
            { key: "🖨️ Print", desc: "Print wristband" },
            { key: "💾 Save", desc: "Save wristband" },
            { key: "🗑 Clear", desc: "Clear current card" },
            {
              key: "⚡ Auto-Fill",
              desc: "Fill empty cells from filtered plays",
            },
          ],
        },
        {
          icon: "🔄",
          name: "Sort & Organize",
          items: [
            { key: "Drag ☰ handles", desc: "Reorder sort field priority" },
            { key: "↑ / ↓ toggle", desc: "Ascending / descending" },
            { key: "⚙️", desc: "Custom value order (drag to reorder)" },
            { key: "Sort Presets", desc: "Save, load, or delete sort presets" },
            { key: "🔀 checkbox", desc: "Sort across all cards globally" },
          ],
        },
        {
          icon: "📁",
          name: "Cards & Saves",
          items: [
            { key: "+ Add Card", desc: "Add another card (up to 5)" },
            { key: "🗑 Remove Card", desc: "Delete current card" },
            {
              key: "📁 Saved Wristbands",
              desc: "Load, rename, overwrite, delete",
            },
          ],
        },
      ],
    },
    callsheet: {
      title: "📋 Call Sheet — Shortcuts & Features",
      sections: [
        {
          icon: "🖱️",
          name: "Play Interactions",
          items: [
            { key: "Double-click play", desc: "Toggle highlight" },
            {
              key: "Right-click play",
              desc: "Full formatting menu (border, BG, text, size, note)",
            },
            { key: "Drag play", desc: "Reorder within / across categories" },
            { key: "→ / ← button", desc: "Swap play between hashes" },
            { key: "× button", desc: "Remove play" },
            { key: "+ Add dropzone", desc: "Open play picker" },
          ],
        },
        {
          icon: "🎨",
          name: "Per-Cell Formatting (right-click)",
          items: [
            { key: "Border Color", desc: "7 border colors + none" },
            { key: "Background", desc: "8 pastel backgrounds" },
            { key: "Text Color", desc: "7 text colors" },
            {
              key: "B / I / U / S",
              desc: "Bold, Italic, Underline, Strikethrough",
            },
            { key: "Font Size", desc: "XS, S, M, L, XL" },
            { key: "Cell Note", desc: "Short annotation (shows 📝 badge)" },
            { key: "✖ Clear", desc: "Remove all formatting" },
          ],
        },
        {
          icon: "📂",
          name: "Category Headers",
          items: [
            { key: "Double-click text", desc: "Rename category" },
            { key: "Drag header", desc: "Reorder categories" },
            { key: "▶ / ▼", desc: "Collapse / expand" },
            {
              key: "⋯ menu",
              desc: "Category options (note, target, clear, etc.)",
            },
            { key: "⇅ button", desc: "Sort plays in category" },
          ],
        },
        {
          icon: "🔧",
          name: "Toolbar",
          items: [
            { key: "Front / Back", desc: "Switch call sheet page" },
            { key: "📄 / 📃", desc: "Portrait / Landscape" },
            { key: "⚡ Auto-Populate", desc: "Auto-fill from playbook" },
            { key: "📋 Load Wristband", desc: "Import from saved wristband" },
            { key: "🖨️ Print", desc: "Print call sheet" },
            { key: "🗑️ Clear", desc: "Clear all plays" },
          ],
        },
        {
          icon: "⚙️",
          name: "Utilities & Display",
          items: [
            { key: "📊 Stats", desc: "Quick stats panel" },
            { key: "🔍 Not On Sheet", desc: "Find plays not on sheet" },
            { key: "📁 Templates", desc: "Save/load call sheet templates" },
            { key: "🧩 Smart Layout", desc: "Auto-arrange for print" },
            {
              key: "🎯 Scouting Intel",
              desc: "Toggle opponent tendency overlay on all categories",
            },
            {
              key: "💡 Suggest",
              desc: "Smart play suggestions per category (when scouting is on)",
            },
            {
              key: "⚠️ Dead Vs badges",
              desc: "Warnings when plays are dead vs opponent's top looks",
            },
            {
              key: "Presets dropdown",
              desc: "Show All, Minimal, Game Day, Print Friendly",
            },
            { key: "💾", desc: "Save current display as custom preset" },
          ],
        },
      ],
    },
  };
  data.tendencies = {
    title: "🎯 Def Tendencies — Shortcuts & Features",
    sections: [
      {
        icon: "🏠",
        name: "Home Screen",
        items: [
          { key: "＋ New Opponent", desc: "Create a new opponent to chart" },
          {
            key: "Click opponent card",
            desc: "Open opponent detail & play log",
          },
          { key: "✏️", desc: "Rename an opponent" },
          { key: "🗑️", desc: "Delete an opponent and all its plays" },
        ],
      },
      {
        icon: "📹",
        name: "Play Charting",
        items: [
          { key: "Big buttons", desc: "Tap to select a value for each field" },
          {
            key: "Custom input",
            desc: "Type a custom value if not in buttons",
          },
          { key: "Skip →", desc: "Skip fields you don't have data for" },
          { key: "Step dots", desc: "Click any step to jump directly to it" },
          {
            key: "⚡ Rapid Mode",
            desc: "All fields on one page — fastest charting",
          },
          {
            key: "📝 Notes field",
            desc: "Free-text notes on every play (Extras step)",
          },
          {
            key: "💾 Autosave",
            desc: "Draft auto-saved every 3 seconds; restore on reload",
          },
          {
            key: "💾 Save Play",
            desc: "Save and optionally start another play",
          },
        ],
      },
      {
        icon: "⌨️",
        name: "Keyboard Shortcuts",
        items: [
          { key: "↑ / ↓", desc: "Navigate rows in play log" },
          { key: "Enter", desc: "Edit selected play" },
          { key: "Delete / Backspace", desc: "Delete selected play" },
          { key: "N", desc: "New play" },
          { key: "F", desc: "Toggle filter panel" },
          { key: "S", desc: "Toggle stats dashboard" },
          { key: "⌘Z / Ctrl+Z", desc: "Undo" },
          { key: "⇧⌘Z / Ctrl+Shift+Z", desc: "Redo" },
          { key: "Escape", desc: "Exit bulk select mode" },
          { key: "← / →", desc: "Navigate wizard steps (in wizard mode)" },
        ],
      },
      {
        icon: "🔍",
        name: "Search & Filter",
        items: [
          { key: "🔍 Search", desc: "Free-text search across all play fields" },
          {
            key: "🔽 Filters",
            desc: "Multi-select filter chips by field (Qtr, Down, Front, Coverage, etc.)",
          },
          {
            key: "Column headers",
            desc: "Click sortable headers to sort ascending/descending",
          },
          { key: "Clear All", desc: "Reset all active filters and sort" },
        ],
      },
      {
        icon: "📊",
        name: "Stats & Analysis",
        items: [
          { key: "📊 Stats", desc: "Toggle rich stats dashboard" },
          {
            key: "Front Distribution",
            desc: "Bar chart of defensive fronts used",
          },
          { key: "Coverage Distribution", desc: "Bar chart of coverages used" },
          { key: "Blitz Distribution", desc: "Bar chart of blitz packages" },
          { key: "By Down", desc: "Run/Pass/Blitz % breakdown per down" },
          {
            key: "By Situation",
            desc: "Top front & coverage per game situation",
          },
          {
            key: "By Formation",
            desc: "Top front & coverage vs each off. formation",
          },
        ],
      },
      {
        icon: "🛠️",
        name: "Tools",
        items: [
          { key: "☑️ Select", desc: "Enter bulk selection mode" },
          {
            key: "✏️ Bulk Edit",
            desc: "Change a field on all selected plays at once",
          },
          { key: "🗑️ Bulk Delete", desc: "Delete all selected plays" },
          { key: "↕️ Drag & Drop", desc: "Drag rows to reorder plays" },
          { key: "⧉ Duplicate", desc: "Clone a play" },
          { key: "👁️ Columns", desc: "Show/hide columns in the table" },
          { key: "↩️ / ↪️", desc: "Undo / Redo (up to 50 steps)" },
          {
            key: "🖨️ Print",
            desc: "Open print-friendly report with stats summary",
          },
        ],
      },
      {
        icon: "📤",
        name: "Export & Import",
        items: [
          {
            key: "📄 Export CSV",
            desc: "Download all data as CSV (for AI/spreadsheet analysis)",
          },
          { key: "💾 Export JSON", desc: "Download as JSON backup" },
          {
            key: "📥 Import JSON",
            desc: "Import previously exported JSON (merges with existing)",
          },
          {
            key: "📥 Import CSV",
            desc: "Import CSV with column headers (auto-maps fields)",
          },
        ],
      },
    ],
  };
  data.installation = {
    title: "📦 Offensive Installation — Shortcuts & Features",
    sections: [
      {
        icon: "✅",
        name: "Component Tracking",
        items: [
          {
            key: "Categories",
            desc: "Personnel, Formations, Motions, Shifts, Protections, Concepts, Tempos, Backfield, Plays, Tags",
          },
          {
            key: "Check Off",
            desc: "Toggle components as installed (taught/repped) in each category",
          },
          {
            key: "Bulk Actions",
            desc: "\u2018\u2705 All\u2019 to install all, \u2018\u2715 Clear\u2019 to reset a category",
          },
          {
            key: "Play Counts",
            desc: "See how many plays each component appears in",
          },
        ],
      },
      {
        icon: "⭐",
        name: "Star Rating System",
        items: [
          {
            key: "Star Badge",
            desc: "Each play in the Playbook shows filled/empty stars based on installed components",
          },
          {
            key: "Hover Detail",
            desc: "Hover any play to see exactly which components are installed vs missing",
          },
          {
            key: "Game Ready",
            desc: "Plays with all components installed are \u2018Game Ready\u2019",
          },
          {
            key: "Progress Ring",
            desc: "Overall installation percentage shown at the top",
          },
        ],
      },
    ],
  };
  data.dashboard = {
    title: "📊 Game Week Dashboard — Shortcuts & Features",
    sections: [
      {
        icon: "🏈",
        name: "Opponent Selection",
        items: [
          {
            key: "Active Opponent",
            desc: "Select this week's opponent from the dropdown",
          },
          { key: "Week Label", desc: "Tag the current week (e.g. 'Week 3')" },
          {
            key: "Status Cards",
            desc: "Quick view of playbook, script, wristband, scouting, call sheet",
          },
        ],
      },
      {
        icon: "🎯",
        name: "Scouting Summary",
        items: [
          {
            key: "Overall",
            desc: "Top fronts, coverages, blitz rate across all plays",
          },
          {
            key: "3rd Down",
            desc: "Opponent tendencies on 3rd down specifically",
          },
          { key: "Red Zone", desc: "Opponent tendencies in the red zone" },
        ],
      },
      {
        icon: "🔗",
        name: "Cross-Module Integration",
        items: [
          {
            key: "🎯 Auto-Fill Defense (Script)",
            desc: "Fill script defense fields from scouting data",
          },
          {
            key: "🎯 Scouting Intel (Call Sheet)",
            desc: "Toggle opponent tendency overlay on categories",
          },
          {
            key: "💡 Smart Suggestions (Call Sheet)",
            desc: "AI-ranked play suggestions per category",
          },
          {
            key: "📋 → Call Sheet (Script)",
            desc: "Push period plays to matching call sheet categories",
          },
          {
            key: "📋 ← Call Sheet (Script)",
            desc: "Import plays from call sheet categories into a script period",
          },
          {
            key: "⚠️ Dead Vs Warnings",
            desc: "Flags when plays are dead vs opponent's top looks",
          },
          {
            key: "📝 Game Week Notes",
            desc: "Free-form notes area on the Dashboard — auto-saved, prints with game plan",
          },
          {
            key: "🖨️ Print Game Plan",
            desc: "Consolidated print: notes + scouting report + call sheet summary",
          },
        ],
      },
    ],
  };
  return data[tab] || data.playbook;
}

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
