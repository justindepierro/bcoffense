// ============================================================================
// BCOffense — Core type declarations (Hardening Tier 1)
// ----------------------------------------------------------------------------
// This is an AMBIENT declaration file. It adds editor autocomplete + optional
// type-checking to the plain-JS, global-scope codebase WITHOUT any build step.
//
// - It changes NOTHING at runtime (declarations are compile-time only).
// - Files opt in to checking with a `// @ts-check` comment at the top.
// - The `Play` object flows through every module, so typing it here gives you
//   field autocomplete and typo detection on plays across the whole app.
//
// Extend this file as you harden more modules. Keep it in sync with the data
// model documented in AGENTS.md.
// ============================================================================

export {}; // make this a module so `declare global` augments the global scope

declare global {
  /**
   * A single playbook play. Imported from CSV via `parseCSV()` and used
   * everywhere (script, wristband, call sheet, game plan, tendencies).
   */
  interface Play {
    /** Stable unique id (assigned by ensurePlaybookPlayIds on load/import). */
    id?: string;
    type?: string; // "Run" | "Pass" | "RPO" | "Screen" | "Quick" | "Play Action" | "Run Option" | "Movement"
    personnel?: string;
    formation?: string;
    formTag1?: string;
    formTag2?: string;
    under?: string;
    back?: string;
    shift?: string;
    motion?: string;
    protection?: string;
    lineCall?: string;
    play?: string;
    playTag1?: string;
    playTag2?: string;
    basePlay?: string;
    oneWord?: string;
    preferredSituation?: string; // "Short Yardage" | "2 Minute" | "4 Minute"
    preferredDown?: string; // "1" | "2" | "3" | "4"
    preferredDistance?: string; // "Short" | "Medium" | "Long"
    preferredHash?: string;
    preferredFieldPosition?: string; // "Green" | "Lo-RZ" | "Hi-RZ" | "Goal Line" | "Backed Up" | "Saigon"
    tempo?: string;
    practiceFront?: string;
    practiceDefense?: string;
    practiceCoverage?: string;
    practiceBlitz?: string;
    practiceStunt?: string;
    keyPlayer1?: string;
    keyPlayer2?: string;
    keyPlayer3?: string;
    keyPlayerName1?: string;
    keyPlayerName2?: string;
    keyPlayerName3?: string;
    constraint1?: string;
    constraint2?: string;
    constraint3?: string;
    hitChart1?: string;
    hitChart2?: string;
    hitChart3?: string;
    deadVs?: string;
    opponent?: string;
    notes?: string;
    /** Runtime-only: wristband cell number when placed on a call sheet. */
    wristbandNumber?: string | number;
    /** Runtime-only: true for script/callsheet separator rows. */
    isSeparator?: boolean;
    [key: string]: unknown; // tolerate module-specific runtime fields
  }

  /** A call sheet category / bucket definition. */
  interface CallSheetCategory {
    id: string;
    name: string;
    color?: string;
    down?: string;
    distance?: string;
    position?: string | null;
    situation?: string | null;
    playType?: string;
    playerSpecific?: boolean;
    manual?: boolean;
  }

  /** A game plan board (per opponent). */
  interface GamePlanBoard {
    id: string;
    name: string;
    assignments: Record<string, Play[]>;
    customBoxes?: Array<{ id: string; name: string; target?: number; notes?: string }>;
    boxOrder?: string[];
    hiddenBoxes?: string[];
    allowedPlayTypes?: string[];
    sheetTitle?: string;
    printPreset?: string;
    wristbandAutoBoxId?: string;
    boxLabels?: Record<string, string>;
  }

  // ── Shared global state (declared so `// @ts-check` files see them) ──
  var plays: Play[];
  var script: Array<Play & { isSeparator?: boolean }>;
  var filteredPlays: Play[];
  var callSheet: Record<string, { left: Play[]; right: Play[]; customName?: string }>;

  // ── Foundation utilities (utils.js — always loaded first) ──
  function escapeHtml(text: unknown): string;
  function sanitizeHTML(html: string): string;
  function setInnerHTML(el: Element, html: string): void;
  function showToast(message: string, opts?: number | Record<string, unknown>): void;
  function showModal(message: string, opts?: Record<string, unknown>): Promise<void>;
  function showConfirm(message: string, opts?: Record<string, unknown>): Promise<boolean>;
  function showPrompt(message: string, defaultValue?: string, opts?: Record<string, unknown>): Promise<string | null>;
  function showListPicker(message: string, items: unknown[], opts?: Record<string, unknown>): Promise<unknown>;
  function debounce<T extends (...args: unknown[]) => unknown>(fn: T, wait?: number): T;
  function safeDeepClone<T>(obj: T): T;
  function getFullCall(play: Play, options?: Record<string, unknown>): string;
  function playsMatch(p1: Play, p2: Play): boolean;
  function getPlayIdentityKey(play: Play, mode?: string, options?: Record<string, unknown>): string;
}
