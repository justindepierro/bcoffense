/**
 * help.js — Help panel content for all tabs.
 * Extracted from app.js for better separation of concerns.
 */

let currentActiveTab = "playbook";

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
            { key: "/", desc: "Focus play search" },
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
            {
              key: "📊 Balance",
              desc: "Review personnel, formation, and concept mix",
            },
            {
              key: "🧭 Situations",
              desc: "Review down, distance, field-zone, and tempo coverage",
            },
            {
              key: "👥 Touches",
              desc: "Review weighted player touch and opportunity distribution",
            },
            {
              key: "🧩 Complements",
              desc: "Map concepts to tagged constraint and complement answers",
            },
            {
              key: "🎯 Identity",
              desc: "Score playbook alignment to the offensive identity",
            },
            { key: "🖨️ Print Plays", desc: "Print the current filtered playbook view" },
            { key: "📥 Export", desc: "Export all data as JSON backup" },
            { key: "📤 Import", desc: "Import a JSON backup file" },
            {
              key: "🗑 Reset Plan",
              desc: "Clear current opponent game-plan selections and board",
            },
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
            {
              key: "📋 Copy Text",
              desc: "Copy period plays as plain text to clipboard",
            },
          ],
        },
        {
          icon: "🔧",
          name: "Toolbar",
          items: [
            { key: "↩️ / ↪️", desc: "Undo / Redo" },
            {
              key: "⌘Z / Ctrl+Z",
              desc: "Keyboard undo (outside input fields)",
            },
            {
              key: "⌘Y / Ctrl+Y",
              desc: "Keyboard redo (outside input fields)",
            },
            { key: "🧠 Smart Script All", desc: "Optimize across all periods" },
            {
              key: "🎯 Auto-Fill Defense",
              desc: "Fill fronts/coverages from scouting data",
            },
            {
              key: "📁 Day Templates",
              desc: "Save or load reusable full-script practice templates",
            },
            {
              key: "📋 → Call Sheet",
              desc: "Push period plays to matching call sheet categories",
            },
            { key: "📄 Print Script", desc: "Preview and print the current script" },
            {
              key: "🗂️ Print Packet",
              desc: "Print detailed scripts plus attached play diagrams in an 8-up layout",
            },
            {
              key: "🎯 Game Plan",
              desc: "Send selected plays, or the full script, into Game Plan boxes",
            },
            {
              key: "🃏 Wristband",
              desc: "Build Wristband cards or fill empty cells from the script",
            },
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
          icon: "🃏",
          name: "Player Wristband",
          items: [
            {
              key: "Rule dropdown",
              desc: "Use another position's rule for one play without changing the playbook",
            },
            {
              key: "↺ Reset",
              desc: "Restore that row to the wristband position's original rule",
            },
            {
              key: "📄 1 / Page",
              desc: "Print one exact-size player wristband per letter page",
            },
            {
              key: "📋 3 Copies",
              desc: "Print three copies of the current position on each sheet",
            },
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
          icon: "🖨️",
          name: "Display Options",
          items: [
            {
              key: "Minimal / Standard / Full",
              desc: "Apply a complete display preset",
            },
            {
              key: "Line Call Only",
              desc: "Show only the line call plus enabled personnel and marker cues",
            },
            {
              key: "Huddle / Candy",
              desc: "Highlight matching tempo calls on screen and in print",
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
            {
              key: "📁 Templates",
              desc: "Save/load reusable position or group templates",
            },
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
            { key: "📁 Templates", desc: "Save/load full sheets or structure-only templates" },
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
              key: "🎯 Game Plan Plays",
              desc: "Open the right-side drawer to pull current plan plays into the sheet",
            },
            {
              key: "⚠️ Dead Vs badges",
              desc: "Warnings when plays are dead vs opponent's top looks",
            },
            {
              key: "Presets dropdown",
              desc: "Show All, Minimal, Game Day, Print Friendly",
            },
            {
              key: "🔵 / ⚓ Personnel Marker",
              desc: "Show personnel shorthand in each play call; Navy uses the anchor",
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
            key: "📁 Templates",
            desc: "Save or apply reusable installation progress templates",
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
  data.offensebuilder = {
    title: "🧠 Offense Builder — Shortcuts & Features",
    sections: [
      {
        icon: "⌨️",
        name: "Keyboard Shortcuts",
        items: [
          { key: "/", desc: "Focus play search" },
          { key: "↑ / ↓", desc: "Navigate play cards" },
          { key: "R", desc: "Toggle show rated plays only" },
          { key: "Escape", desc: "Clear search or deselect play" },
        ],
      },
      {
        icon: "🖱️",
        name: "Mouse & Touch",
        items: [
          { key: "Click card", desc: "Select play to view details" },
          {
            key: "Right-click card",
            desc: "Context menu (add to script, rate)",
          },
          { key: "Long-press card", desc: "Context menu on mobile" },
          { key: "Click star", desc: "Rate play (1–5 stars)" },
        ],
      },
      {
        icon: "🔍",
        name: "Filtering",
        items: [
          { key: "Search bar", desc: "Filter plays by name" },
          {
            key: "Type / Personnel / Formation",
            desc: "Filter by play attributes",
          },
          { key: "Rated Only", desc: "Show only plays you've rated" },
        ],
      },
      {
        icon: "📊",
        name: "Analysis",
        items: [
          {
            key: "Detail Panel",
            desc: "View play attributes, constraints, and notes",
          },
          {
            key: "Gap Analysis",
            desc: "Identifies missing coverage in your rated plays",
          },
          {
            key: "Recommendations",
            desc: "Suggestions based on gaps in your offense",
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
            key: "🖨️ Print Game Plan Packet",
            desc: "Consolidated packet: notes + scouting report + call sheet summary",
          },
        ],
      },
    ],
  };
  data.gameplan = {
    title: "🎯 Game Plan — Shortcuts & Features",
    sections: [
      {
        icon: "🏈",
        name: "Board Setup",
        items: [
          {
            key: "Active Opponent",
            desc: "Uses the selected game-week opponent for saved plan boards",
          },
          {
            key: "+ Box",
            desc: "Add a new plan bucket for a situation, concept family, or must-have list",
          },
          { key: "Rename / Hide", desc: "Clean up buckets without losing the plan" },
          {
            key: "Snapshots",
            desc: "Save named versions of a plan so you can compare or roll back",
          },
          {
            key: "Reset Plan",
            desc: "Start the current opponent plan from scratch and clear selected plays",
          },
        ],
      },
      {
        icon: "📚",
        name: "Library & Selection",
        items: [
          { key: "Search / Filters", desc: "Narrow the play library before adding plays" },
          { key: "Drag play", desc: "Drop a play into any game-plan bucket" },
          {
            key: "Play flags",
            desc: "Mark priorities, openers, explosives, constraints, or watch-list plays",
          },
          {
            key: "Coverage Matrix",
            desc: "Check whether selected plays cover the opponent's top looks",
          },
        ],
      },
      {
        icon: "🧠",
        name: "Intelligence",
        items: [
          {
            key: "Suggest Fill",
            desc: "Let the app recommend plays for empty or thin buckets",
          },
          {
            key: "Health",
            desc: "Review balance, duplicate calls, and missing situations",
          },
          {
            key: "Tendency Mirror",
            desc: "Compare the plan against opponent scouting patterns",
          },
          {
            key: "Touch Counts",
            desc: "Track how often key players are featured in the plan",
          },
        ],
      },
      {
        icon: "🖨️",
        name: "Output",
        items: [
          { key: "Print", desc: "Print the board-only game plan view" },
          {
            key: "Full Packet",
            desc: "Use the Dashboard packet for notes, scouting, and call-sheet context",
          },
          {
            key: "Push to Script / Sheet",
            desc: "Send selected plan plays into practice or call-sheet workflows",
          },
        ],
      },
    ],
  };

  const commonQuickToolsSection = () => ({
    icon: "⚡",
    name: "Floating Tools",
    items: [
      {
        key: "Tools",
        desc: "Open the bottom-right tray for Help, Print Studio, Script Display, and Back to Top",
      },
      {
        key: "Help & Tips",
        desc: "Shows context-specific tips for the current tab",
      },
      {
        key: "Print Studio",
        desc: "Preview, check, name, print, and export game-week materials from one place",
      },
      {
        key: "Script Display",
        desc: "Appears on the Script tab for print-style rows, columns, and display presets",
      },
    ],
  });

  Object.values(data).forEach((tabData) => {
    tabData.sections.push(commonQuickToolsSection());
  });

  return data[tab] || data.playbook;
}

function toggleHelpPanel() {
  const overlay = document.getElementById("helpOverlay");
  const fab = document.getElementById("helpFab");
  if (!overlay) return;
  const isOpen = overlay.classList.contains("visible");
  if (isOpen) {
    overlay.classList.remove("visible");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("inert", "");
    fab?.classList.remove("help-fab-active");
    return;
  }

  renderHelpContent();
  overlay.removeAttribute("inert");
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("visible");
  fab?.classList.add("help-fab-active");
}

function closeHelpPanel(event) {
  if (event && event.target !== event.currentTarget) return;

  const overlay = document.getElementById("helpOverlay");
  const fab = document.getElementById("helpFab");
  if (!overlay) return;
  overlay.classList.remove("visible");
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("inert", "");
  fab?.classList.remove("help-fab-active");
}

function renderHelpContent() {
  const title = document.getElementById("helpPanelTitle");
  const body = document.getElementById("helpPanelBody");
  if (!body) return;

  const helpData = getHelpDataForTab(currentActiveTab);
  if (title) title.textContent = helpData.title;

  let html = "";
  helpData.sections.forEach((section) => {
    html += `<div class="help-section">`;
    html += `<div class="help-section-title">${section.icon} ${section.name}</div>`;
    html += `<div class="help-items">`;
    section.items.forEach((item) => {
      const keyHtml = item.key
        ? `<span class="help-key">${item.key}</span>`
        : "";
      html += `<div class="help-item">${keyHtml}<span class="help-desc">${item.desc}</span></div>`;
    });
    html += `</div></div>`;
  });

  setInnerHTML(body, html);
}
