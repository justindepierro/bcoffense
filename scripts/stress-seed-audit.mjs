#!/usr/bin/env node

import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
]);

const DEFAULT_PLAYWRIGHT_ROOT =
  process.env.STRESS_PLAYWRIGHT_ROOT ||
  path.join(root, "tests", "node_modules", "playwright");

const ROLE_TABS = {
  admin: [
    "dashboard",
    "playbook",
    "script",
    "wristband",
    "callsheet",
    "gameplan",
    "tendencies",
    "installation",
    "identity",
    "offensebuilder",
  ],
  coach: [
    "dashboard",
    "playbook",
    "script",
    "wristband",
    "callsheet",
    "gameplan",
    "tendencies",
    "installation",
    "identity",
    "offensebuilder",
  ],
  player: ["dashboard", "playbook", "script"],
};

const CALLSHEET_FRONT = [
  "2nd-medium",
  "2nd-long",
  "3rd-short-1-3",
  "short-yardage",
  "gbot",
  "3rd-short-2down",
  "rz-20",
  "4th-down",
  "3rd-medium",
  "rz-10",
  "4-minute",
  "3rd-long",
  "rz-5",
  "2-minute",
  "backed-up",
  "goal-line",
  "last-plays",
  "saigon",
  "must-haves",
];

const CALLSHEET_BACK = [
  "openers",
  "1st-down",
  "perimeter-screens",
  "screen",
  "p-and-10",
  "2-point",
  "base-run",
  "run-options",
  "base-pass",
  "quick",
  "play-action",
  "rpos",
  "player1",
  "player2",
  "player3",
  "player4",
  "player5",
  "movement",
];

const GP_BOXES = [
  "Run",
  "Pass",
  "Screen",
  "Quick",
  "Play Action",
  "RPO",
  "Run Option",
  "Movement",
];

function parseArgs(argv) {
  const args = {
    help: false,
    plays: 500,
    scripts: 25,
    wristbands: 20,
    gamePlans: 10,
    scriptPlays: 48,
    roles: ["admin", "coach", "player"],
    viewports: ["1280x800", "390x844"],
    tabs: [],
    port: 4197,
    outputDir: path.join(root, ".stress-audit"),
    headed: false,
    warnOnly: false,
    maxConsole: 60,
    maxIssues: 200,
  };

  argv.forEach((arg) => {
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--plays=")) args.plays = numberArg(arg, args.plays);
    else if (arg.startsWith("--scripts=")) args.scripts = numberArg(arg, args.scripts);
    else if (arg.startsWith("--wristbands=")) args.wristbands = numberArg(arg, args.wristbands);
    else if (arg.startsWith("--game-plans=")) args.gamePlans = numberArg(arg, args.gamePlans);
    else if (arg.startsWith("--script-plays=")) args.scriptPlays = numberArg(arg, args.scriptPlays);
    else if (arg.startsWith("--roles=")) args.roles = listArg(arg);
    else if (arg.startsWith("--viewports=")) args.viewports = listArg(arg);
    else if (arg.startsWith("--tabs=")) args.tabs = listArg(arg);
    else if (arg.startsWith("--port=")) args.port = numberArg(arg, args.port);
    else if (arg.startsWith("--output=")) args.outputDir = path.resolve(arg.slice(arg.indexOf("=") + 1));
    else if (arg.startsWith("--max-console=")) args.maxConsole = numberArg(arg, args.maxConsole);
    else if (arg.startsWith("--max-issues=")) args.maxIssues = numberArg(arg, args.maxIssues);
    else if (arg === "--headed") args.headed = true;
    else if (arg === "--warn-only") args.warnOnly = true;
  });

  args.roles = args.roles.filter((role) => ROLE_TABS[role]);
  if (!args.roles.length) args.roles = ["admin"];
  args.viewports = args.viewports.map(parseViewport).filter(Boolean);
  if (!args.viewports.length) args.viewports = [parseViewport("1280x800")];
  return args;
}

function numberArg(arg, fallback) {
  const value = Number(arg.slice(arg.indexOf("=") + 1));
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function listArg(arg) {
  return arg
    .slice(arg.indexOf("=") + 1)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseViewport(value) {
  const match = String(value).match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  return {
    name: `${match[1]}x${match[2]}`,
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function printUsage() {
  console.log(`Usage: node scripts/stress-seed-audit.mjs [options]

Seeds a fresh local browser context with large BCOffense data, visits major tabs
by role/viewport, and writes JSON + Markdown reports.

Options:
  --plays=500                 Number of playbook plays
  --scripts=25                Number of saved scripts
  --wristbands=20             Number of saved wristbands
  --game-plans=10             Number of game plan boards/opponents
  --script-plays=48           Plays per saved script
  --roles=admin,coach,player  Roles to audit
  --viewports=1280x800,390x844 Viewports to audit
  --tabs=playbook,script      Optional tab allowlist
  --port=4197                 Local static server port
  --output=.stress-audit      Report output directory
  --headed                    Show browser
  --warn-only                 Always exit zero
  --help                      Show this message`);
}

async function findPlaywright() {
  const candidates = [
    path.join(root, "node_modules", "playwright"),
    DEFAULT_PLAYWRIGHT_ROOT,
    path.join(process.env.HOME || "", ".codex/tools/mobile-debug/node_modules/playwright"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return require(candidate);
    } catch (_err) {
      // Try the next candidate.
    }
  }
  throw new Error("Playwright not found. Run: npm install --prefix tests");
}

function safePathFromUrl(requestUrl) {
  const parsed = new URL(requestUrl, "http://localhost");
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === "/") pathname = "/index.html";
  const resolved = path.resolve(root, `.${pathname}`);
  if (!resolved.startsWith(root)) return "";
  return resolved;
}

function serveStatic(port) {
  const server = createServer((req, res) => {
    const parsed = new URL(req.url || "/", "http://localhost");
    if (parsed.pathname === "/auth/me") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ user: null }));
      return;
    }
    if (parsed.pathname === "/auth/logout") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (parsed.pathname === "/auth/login") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const parsedBody = safeJson(body);
        const role = String(parsedBody.username || "").toLowerCase();
        if (!ROLE_TABS[role] || !parsedBody.password) {
          res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Invalid username or password." }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          user: {
            username: role,
            role,
            label: role.charAt(0).toUpperCase() + role.slice(1),
          },
        }));
      });
      return;
    }
    if (parsed.pathname === "/auth/players") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, players: [] }));
      return;
    }
    if (parsed.pathname.startsWith("/api/leaderboard")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, summary: { week: { rows: [] }, season: { rows: [] } } }));
      return;
    }
    if (parsed.pathname.startsWith("/api/questions")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        ok: true,
        summary: { open: 0, today: 0, resolved: 0, needsAnswer: 0 },
        questions: [],
        hasMore: false,
      }));
      return;
    }
    if (parsed.pathname.startsWith("/api/notifications")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, notifications: [], hasMore: false, unread: 0 }));
      return;
    }
    if (parsed.pathname.startsWith("/api/plays/") && parsed.pathname.endsWith("/like")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, liked: false, count: 0 }));
      return;
    }
    if (parsed.pathname.startsWith("/api/threads/batch-counts")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, counts: {} }));
      return;
    }
    if (parsed.pathname.startsWith("/api/threads/")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, thread: null, posts: [], replies: [], hasMore: false }));
      return;
    }
    if (parsed.pathname.startsWith("/api/moderation/terms")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, terms: [] }));
      return;
    }
    if (parsed.pathname.startsWith("/api/moderation/stats")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, stats: {} }));
      return;
    }
    if (parsed.pathname.startsWith("/api/moderation/queue")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, posts: [], hasMore: false }));
      return;
    }
    if (parsed.pathname.startsWith("/api/push/vapid-key")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, publicKey: "" }));
      return;
    }
    if (parsed.pathname.startsWith("/api/")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (
      parsed.pathname.startsWith("/sync/") ||
      parsed.pathname.startsWith("/clips/") ||
      parsed.pathname.startsWith("/images/")
    ) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, clips: [], sigs: [] }));
      return;
    }
    if (parsed.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }

    const filePath = safePathFromUrl(req.url || "/");
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME_TYPES.get(path.extname(filePath)) || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve({ server, url: `http://127.0.0.1:${port}/index.html` });
    });
  });
}

function closeServer(server) {
  if (server) server.close(() => {});
}

function safeJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch (_err) {
    return {};
  }
}

function generateStressData(opts) {
  const plays = generatePlays(opts.plays);
  const savedScripts = generateSavedScripts(plays, opts.scripts, opts.scriptPlays);
  const savedWristbands = generateWristbands(plays, opts.wristbands);
  const callSheet = generateCallSheet(plays);
  const gamePlanBoards = generateGamePlanBoards(plays, opts.gamePlans);
  const roster = generateRoster();
  const quizResults = generateQuizResults(roster, 180);
  return {
    plays,
    savedScripts,
    savedWristbands,
    callSheet,
    gamePlanBoards,
    roster,
    quizResults,
    teamName: "Stress Test Offense",
    gameWeek: { opponentName: "Stress Opponent 1", opponentIndex: 0, weekLabel: "Stress Week" },
    schedule: Array.from({ length: opts.gamePlans }, (_, index) => ({
      opponent: `Stress Opponent ${index + 1}`,
      date: `2026-09-${String((index % 25) + 1).padStart(2, "0")}`,
      location: index % 2 ? "Away" : "Home",
    })),
    motd: "Stress data loaded. Use this profile to hunt scale and workflow bugs.",
  };
}

function generatePlays(count) {
  const types = ["Run", "Pass", "Screen", "Quick", "Play Action", "RPO", "Run Option", "Movement"];
  const personnels = ["10", "11", "12", "20", "21", "Navy", "Meat"];
  const formations = ["Right N Over", "Left Trey", "Doubles", "Trips", "Bunch", "Empty", "Pistol", "Tight"];
  const backs = ["Gun", "Pistol", "Offset", "Strong", "Weak", "Dot"];
  const coverages = ["Cover 0", "Cover 1", "Cover 2", "Cover 3", "Tampa 2", "Quarters", "Man 2"];
  const fronts = ["Even", "Odd", "Mint", "Bear", "Tite"];
  const distances = ["Short", "Medium", "Long"];
  const fields = ["Green", "Lo-RZ", "Hi-RZ", "Goal Line", "Backed Up", "Saigon"];
  const situations = ["", "Short Yardage", "2 Minute", "4 Minute"];
  const names = ["Viper", "Sooners", "Power", "Counter", "Y-Cross", "Mesh", "Stick", "Shallow", "Glance", "Boot"];

  return Array.from({ length: count }, (_, index) => {
    const type = types[index % types.length];
    const formation = formations[index % formations.length];
    const playName = `${names[index % names.length]} ${type} ${index + 1}`;
    const id = `stress-play-${String(index + 1).padStart(5, "0")}`;
    return {
      id,
      createdAt: Date.now() - index * 1000,
      type,
      personnel: personnels[index % personnels.length],
      formation,
      formTag1: index % 3 === 0 ? "Nasty" : "",
      formTag2: index % 5 === 0 ? "Close" : "",
      under: index % 7 === 0 ? "U" : "",
      back: backs[index % backs.length],
      shift: index % 4 === 0 ? "Zip" : "",
      motion: index % 6 === 0 ? "Orbit" : "",
      protection: type === "Pass" || type === "Play Action" ? `P${(index % 6) + 1}` : "",
      lineCall: index % 9 === 0 ? "Lock" : "",
      play: playName,
      playTag1: index % 4 === 0 ? "Alert" : "",
      playTag2: index % 6 === 0 ? "Gift" : "",
      basePlay: names[index % names.length],
      oneWord: index % 8 === 0 ? `Code${index}` : "",
      preferredSituation: situations[index % situations.length],
      preferredDown: String((index % 4) + 1),
      preferredDistance: distances[index % distances.length],
      preferredHash: index % 3 === 0 ? "Left" : index % 3 === 1 ? "Right" : "",
      preferredFieldPosition: fields[index % fields.length],
      tempo: index % 2 ? "Normal" : "Fast",
      practiceFront: fronts[index % fronts.length],
      practiceDefense: index % 2 ? "Base" : "Pressure",
      practiceCoverage: coverages[index % coverages.length],
      practiceBlitz: index % 5 === 0 ? "Nickel" : "",
      practiceStunt: index % 7 === 0 ? "Tex" : "",
      keyPlayer1: ["QB", "RB", "X", "Y", "Z"][index % 5],
      keyPlayer2: ["LT", "LG", "C", "RG", "RT"][index % 5],
      keyPlayer3: ["H", "F", "S", "W", "M"][index % 5],
      keyPlayerName1: ["Marco", "Lex", "Nico", "Eli", "Sam"][index % 5],
      keyPlayerName2: ["Tate", "Cole", "Rey", "Mills", "Drew"][index % 5],
      keyPlayerName3: ["Ace", "Bo", "Cam", "Dez", "Ezra"][index % 5],
      constraint1: index % 3 === 0 ? "Counter" : "",
      constraint2: index % 4 === 0 ? "Naked" : "",
      constraint3: index % 5 === 0 ? "Screen" : "",
      hitChart1: index % 2 ? "A" : "B",
      hitChart2: index % 4 ? "" : "C",
      hitChart3: "",
      deadVs: index % 11 === 0 ? "Zero pressure" : "",
      opponent: index % 4 === 0 ? "Stress Opponent 1" : "",
      notes: `Stress seeded note ${index + 1}`,
      respQ: "Cadence and alert.",
      respT: "Set the edge.",
      respH: "Know motion adjustment.",
      playerNotes: "Study landmark, rule, and question path.",
    };
  });
}

function copySourcePlay(play, overrides = {}) {
  const sourceId = play.playbookId || play.sourcePlayId || play.originalPlayId || play.id;
  return {
    ...play,
    ...overrides,
    playbookId: sourceId,
    sourcePlayId: sourceId,
    originalPlayId: sourceId,
    sourceIdentityKey: play.sourceIdentityKey || [play.personnel, play.formation, play.play].join("|"),
    sourceGamePlanKey:
      play.sourceGamePlanKey ||
      [play.type, play.personnel, play.formation, play.play, play.preferredDown, play.preferredDistance].join("|"),
  };
}

function generateSavedScripts(plays, count, playsPerScript) {
  return Array.from({ length: count }, (_, scriptIndex) => {
    const entries = [];
    for (let i = 0; i < playsPerScript; i += 1) {
      if (i % 12 === 0) {
        entries.push({
          isSeparator: true,
          label: `Stress Period ${Math.floor(i / 12) + 1}`,
          minutes: 8,
          id: `stress-script-${scriptIndex + 1}-period-${i}`,
        });
      }
      const source = plays[(scriptIndex * 17 + i) % plays.length];
      entries.push(copySourcePlay(source, {
        id: `stress-script-${scriptIndex + 1}-play-${i + 1}`,
        reps: (i % 4) + 1,
        hash: i % 2 ? "R" : "L",
        notes: `Stress script ${scriptIndex + 1} note ${i + 1}`,
      }));
    }
    return {
      id: `stress-saved-script-${scriptIndex + 1}`,
      name: `Stress Practice ${scriptIndex + 1}`,
      date: `2026-08-${String((scriptIndex % 25) + 1).padStart(2, "0")}`,
      period: "",
      tempo: scriptIndex % 2 ? "Normal" : "Fast",
      playerVisible: scriptIndex < Math.max(3, Math.ceil(count / 5)),
      plays: entries,
      workspace: null,
      savedAt: new Date(Date.now() - scriptIndex * 3600000).toISOString(),
    };
  });
}

function generateWristbands(plays, count) {
  return Array.from({ length: count }, (_, wristbandIndex) => {
    const cards = Array.from({ length: 3 }, (_, cardIndex) => {
      const data = Array.from({ length: 40 }, (_, cellIndex) => {
        const source = plays[(wristbandIndex * 37 + cardIndex * 40 + cellIndex) % plays.length];
        return copySourcePlay(source, {
          wristbandNumber: cardIndex * 40 + cellIndex + 1,
          _stressWristband: true,
        });
      });
      return { name: `Card ${cardIndex + 1}`, data };
    });
    return {
      id: `stress-wristband-${wristbandIndex + 1}`,
      title: `Stress Wristband ${wristbandIndex + 1}`,
      cards,
      savedAt: new Date(Date.now() - wristbandIndex * 7200000).toISOString(),
    };
  });
}

function generateCallSheet(plays) {
  const out = {};
  [...CALLSHEET_FRONT, ...CALLSHEET_BACK].forEach((categoryId, categoryIndex) => {
    out[categoryId] = { left: [], right: [] };
    for (let i = 0; i < 10; i += 1) {
      const source = plays[(categoryIndex * 13 + i) % plays.length];
      const entry = copySourcePlay(source, {
        playType: source.type,
        wristbandNumber: i + 1,
        highlighted: i % 5 === 0,
        highlightColor: i % 5 === 0 ? "yellow" : null,
      });
      out[categoryId][i % 2 ? "right" : "left"].push(entry);
    }
  });
  return out;
}

function generateGamePlanBoards(plays, count) {
  const boards = {};
  for (let boardIndex = 0; boardIndex < count; boardIndex += 1) {
    const assignments = { __holding: [] };
    GP_BOXES.forEach((box, boxIndex) => {
      assignments[box] = Array.from({ length: 16 }, (_, playIndex) =>
        copySourcePlay(plays[(boardIndex * 71 + boxIndex * 17 + playIndex) % plays.length], {
          _gpSource: true,
        }),
      );
    });
    boards[`Stress Opponent ${boardIndex + 1}`] = {
      assignments,
      customBoxes: [
        { id: `stress-custom-${boardIndex + 1}`, name: "Stress Custom", target: 8, notes: "Stress custom bucket" },
      ],
      targets: {},
      collapsed: [],
      notes: {},
      sort: {},
      hiddenBoxes: [],
      boxOrder: [],
      boxLabels: {},
      boxMeta: {},
      allowedPlayTypes: [],
      sheetTitle: `Stress Plan ${boardIndex + 1}`,
      printPreset: "",
      wristbandAutoBoxId: "",
    };
  }
  return boards;
}

function generateRoster() {
  const positions = ["QB", "RB", "X", "Z", "Y", "LT", "LG", "C", "RG", "RT", "H", "F"];
  return positions.map((position, index) => ({
    id: `stress-player-${index + 1}`,
    name: `Stress Player ${index + 1}`,
    position,
    number: index + 1,
    account: index === 0 ? "player" : `player${index + 1}`,
  }));
}

function generateQuizResults(roster, count) {
  return Array.from({ length: count }, (_, index) => {
    const player = roster[index % roster.length];
    return {
      id: `stress-quiz-${index + 1}`,
      playerName: player.name,
      account: player.account,
      score: 60 + (index % 40),
      total: 100,
      correct: 6 + (index % 5),
      totalQuestions: 10,
      source: index % 2 ? "script" : "gameplan",
      createdAt: new Date(Date.now() - index * 1800000).toISOString(),
    };
  });
}

async function loginAs(page, role) {
  await page.goto(page.url() || "/index.html", { waitUntil: "domcontentloaded" }).catch(() => {});
  const overlay = page.locator("#authLoginOverlay");
  if (!(await overlay.isVisible().catch(() => false))) {
    await page.evaluate(() => {
      if (typeof logoutAuth === "function") logoutAuth();
    }).catch(() => {});
  }
  await overlay.waitFor({ state: "visible", timeout: 10000 });
  const roleButton = page.locator(`#authLoginOverlay [data-login-role="${role}"]`);
  if (await roleButton.count()) await roleButton.click();
  await page.locator("#authUsername").fill(role);
  await page.locator("#authPassword").fill("stress-audit");
  await page.locator("#authLoginSubmit").click();
  await page.waitForFunction(
    (expectedRole) => document.body?.dataset.authRole === expectedRole,
    role,
    { timeout: 15000 },
  );
}

async function seedApp(page, data) {
  return page.evaluate(async (payload) => {
    const waitForStorage = async () => {
      const started = Date.now();
      while (Date.now() - started < 10000) {
        if (typeof storageManager !== "undefined" && typeof STORAGE_KEYS !== "undefined") return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("storageManager/STORAGE_KEYS unavailable");
    };
    await waitForStorage();

    await storageManager.setPlaybook(payload.plays);
    storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, payload.savedScripts);
    storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, payload.savedWristbands);
    storageManager.set(STORAGE_KEYS.CALL_SHEET, payload.callSheet);
    storageManager.set(STORAGE_KEYS.GAME_PLAN_BOARDS, payload.gamePlanBoards);
    storageManager.set(STORAGE_KEYS.TEAM_ROSTER, payload.roster);
    storageManager.set(STORAGE_KEYS.TEAM_NAME, payload.teamName);
    storageManager.set(STORAGE_KEYS.GAME_WEEK, payload.gameWeek);
    storageManager.set(STORAGE_KEYS.SCHEDULE, payload.schedule);
    storageManager.set(STORAGE_KEYS.MOTD, payload.motd);
    storageManager.set(STORAGE_KEYS.PLAYER_QUIZ_RESULTS, payload.quizResults);
    storageManager.set(STORAGE_KEYS.PLAYER_QUIZ_SETTINGS, {
      weeklyGoal: 1000,
      baseCorrectPoints: 10,
      scriptWeight: 2,
      gameplanWeight: 2,
      tiers: {
        champion: "Champion",
        baller: "Baller",
        starter: "Starter",
        contributor: "Contributor",
        defense: "Defense",
      },
    });
    storageManager.set(STORAGE_KEYS.FIRST_USE_DISMISSED, true);
    storageManager.set(STORAGE_KEYS.LAST_ACTIVE_TAB, "dashboard");

    try { plays = payload.plays; } catch (_err) {}
    try { callSheet = payload.callSheet; } catch (_err) {}
    try { callSheetSettings = normalizeCallSheetSettings(callSheetSettings || {}); } catch (_err) {}
    return storageManager.getStorageInfo();
  }, data);
}

async function inspectStorage(page) {
  return page.evaluate(async () => {
    const info =
      typeof storageManager !== "undefined" && storageManager.getStorageInfo
        ? storageManager.getStorageInfo()
        : null;
    const playbook =
      typeof storageManager !== "undefined" && storageManager.getPlaybook
        ? await storageManager.getPlaybook()
        : [];
    return {
      storageInfo: info,
      playbookCount: Array.isArray(playbook) ? playbook.length : 0,
      savedScripts: storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []).length,
      savedWristbands: storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []).length,
      quizResults: storageManager.get(STORAGE_KEYS.PLAYER_QUIZ_RESULTS, []).length,
      gamePlanBoards: Object.keys(storageManager.get(STORAGE_KEYS.GAME_PLAN_BOARDS, {}) || {}).length,
    };
  });
}

async function auditRoleViewport(page, role, viewport, tabs, opts) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await loginAs(page, role);
  await page.waitForTimeout(350);

  const roleTabs = tabs.length ? tabs : ROLE_TABS[role];
  const tabResults = [];
  for (const tab of roleTabs) {
    tabResults.push(await auditTab(page, tab, opts));
  }

  return {
    role,
    viewport: viewport.name,
    shell: await page.evaluate(() => ({
      authRole: document.body?.dataset.authRole || "",
      screenSize: document.body?.dataset.screenSize || "",
      shellSize: document.body?.dataset.shellSize || "",
      device: document.body?.dataset.device || "",
      orientation: document.body?.dataset.screenOrientation || "",
      displayMode: document.body?.dataset.displayMode || "",
      activeTab: document.body?.dataset.activeTab || "",
    })),
    tabs: tabResults,
  };
}

async function auditTab(page, tab, opts) {
  const beforeErrors = await page.evaluate(() => window.__stressConsoleErrors?.length || 0).catch(() => 0);
  const result = await page.evaluate(async (tabName) => {
    const started = performance.now();
    let switched = false;
    let switchError = "";
    try {
      if (typeof showTab === "function") {
        showTab(tabName);
        switched = true;
      }
    } catch (err) {
      switchError = err?.message || String(err);
    }
    const waitForPanelReady = async () => {
      const deadline = performance.now() + 1200;
      let snapshot = null;
      while (performance.now() < deadline) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const activePanel = document.querySelector(".panel.active");
        const panel = document.getElementById(tabName) || activePanel;
        const panelRect = panel?.getBoundingClientRect();
        const style = panel ? getComputedStyle(panel) : null;
        snapshot = {
          activePanel,
          panel,
          panelRect,
          visible: Boolean(
            panel &&
            panelRect &&
            panelRect.width > 0 &&
            panelRect.height > 0 &&
            style?.display !== "none" &&
            style?.visibility !== "hidden"
          ),
          textLength: (panel?.innerText || "").trim().length,
        };
        if (snapshot.visible && snapshot.textLength > 0) return snapshot;
      }
      return snapshot || {};
    };
    const ready = await waitForPanelReady();
    const activePanel = document.querySelector(".panel.active");
    const panel = ready.panel || document.getElementById(tabName) || activePanel;
    const visible = Boolean(ready.visible);
    const textLength = ready.textLength || 0;
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
    const smallTargets = [];
    document
      .querySelectorAll("button, [role='button'], a[href], input:not([type='hidden']), select, textarea, [data-action]")
      .forEach((el) => {
        if (el.closest("[inert], .custom-modal-overlay:not(.visible), .modal-overlay:not(.show)")) return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return;
        if (el.matches("input[type='checkbox'], input[type='radio'], input[type='color']")) return;
        if (el.closest(".callsheet-table, .playbook-table-wrap, .wristband-grid")) return;
        if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return;
        if (rect.width < 44 || rect.height < 44) {
          smallTargets.push({
            selector: describeElement(el),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            text: (el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "")
              .trim()
              .slice(0, 60),
          });
        }
      });

    function describeElement(el) {
      if (el.id) return `#${el.id}`;
      const classes = [...el.classList].slice(0, 3).join(".");
      const action = el.getAttribute("data-action") || el.getAttribute("data-onchange") || "";
      return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ""}${action ? `[${action}]` : ""}`;
    }

    return {
      tab: tabName,
      switched,
      switchError,
      activePanel: activePanel?.id || "",
      visible,
      textLength,
      blank: !visible || textLength < 12,
      overflow,
      durationMs: Math.round(performance.now() - started),
      smallTargetCount: smallTargets.length,
      smallTargets: smallTargets.slice(0, 8),
    };
  }, tab);
  await page.waitForTimeout(120);
  const consoleErrors = await page
    .evaluate(
      ({ before, max }) => (window.__stressConsoleErrors || []).slice(before, before + max),
      { before: beforeErrors, max: opts.maxConsole },
    )
    .catch(() => []);
  return { ...result, consoleErrors };
}

function collectIssues(report, maxIssues) {
  const issues = [];
  for (const run of report.runs) {
    for (const tab of run.tabs) {
      const prefix = `${run.role} ${run.viewport} ${tab.tab}`;
      if (!tab.switched) issues.push({ severity: "fail", area: prefix, message: `showTab failed: ${tab.switchError || "not available"}` });
      if (tab.blank) issues.push({ severity: "fail", area: prefix, message: `blank or hidden panel; active=${tab.activePanel} text=${tab.textLength}` });
      if (tab.overflow) issues.push({ severity: "fail", area: prefix, message: "horizontal overflow" });
      if (tab.consoleErrors.length) issues.push({ severity: "fail", area: prefix, message: `${tab.consoleErrors.length} console/page error(s)` });
      if (tab.smallTargetCount) {
        issues.push({
          severity: "warn",
          area: prefix,
          message: `${tab.smallTargetCount} visible touch target(s) under 44px`,
          examples: tab.smallTargets,
        });
      }
      if (tab.durationMs > 1800) {
        issues.push({ severity: "warn", area: prefix, message: `slow tab switch/render ${tab.durationMs}ms` });
      }
    }
  }
  return issues.slice(0, maxIssues);
}

function buildMarkdown(report) {
  const failures = report.issues.filter((issue) => issue.severity === "fail");
  const warnings = report.issues.filter((issue) => issue.severity === "warn");
  const lines = [
    "# BCOffense Stress Seed Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Dataset: ${report.dataset.plays} plays, ${report.dataset.savedScripts} saved scripts, ${report.dataset.savedWristbands} wristbands, ${report.dataset.gamePlanBoards} game plan boards, ${report.dataset.quizResults} quiz results.`,
    "",
    `Result: ${failures.length} failure(s), ${warnings.length} warning(s).`,
    "",
    "## Storage",
    "",
    `- Playbook count: ${report.storage.playbookCount}`,
    `- Saved scripts: ${report.storage.savedScripts}`,
    `- Saved wristbands: ${report.storage.savedWristbands}`,
    `- Game plan boards: ${report.storage.gamePlanBoards}`,
    `- Quiz results: ${report.storage.quizResults}`,
    `- Estimated storage: ${report.storage.storageInfo?.totalSizeFormatted || "unknown"}`,
    "",
    "## Issues",
    "",
  ];

  if (!report.issues.length) {
    lines.push("No stress issues found.");
  } else {
    report.issues.forEach((issue) => {
      lines.push(`- ${issue.severity.toUpperCase()} ${issue.area}: ${issue.message}`);
      if (issue.examples?.length) {
        issue.examples.slice(0, 3).forEach((example) => {
          lines.push(`  - ${example.selector} ${example.width}x${example.height} ${example.text || ""}`.trimEnd());
        });
      }
    });
  }

  lines.push("", "## Slowest Tabs", "");
  const slowest = report.runs
    .flatMap((run) => run.tabs.map((tab) => ({ role: run.role, viewport: run.viewport, ...tab })))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 12);
  slowest.forEach((tab) => {
    lines.push(`- ${tab.role} ${tab.viewport} ${tab.tab}: ${tab.durationMs}ms`);
  });
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  mkdirSync(args.outputDir, { recursive: true });
  const data = generateStressData(args);
  const playwright = await findPlaywright();
  const served = await serveStatic(args.port);
  const browser = await playwright.chromium.launch({ headless: !args.headed });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__stressConsoleErrors = [];
    window.addEventListener("error", (event) => {
      window.__stressConsoleErrors.push({
        type: "pageerror",
        message: event.message || String(event.error || ""),
        source: event.filename || "",
        line: event.lineno || 0,
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      window.__stressConsoleErrors.push({
        type: "unhandledrejection",
        message: String(event.reason?.message || event.reason || ""),
      });
    });
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    page.evaluate(({ location, text }) => {
      window.__stressConsoleErrors = window.__stressConsoleErrors || [];
      window.__stressConsoleErrors.push({ type: "console", message: text, location });
    }, { text: msg.text(), location: msg.location() }).catch(() => {});
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    page.evaluate(({ statusCode, urlText }) => {
      window.__stressConsoleErrors = window.__stressConsoleErrors || [];
      window.__stressConsoleErrors.push({
        type: "http",
        message: `HTTP ${statusCode}`,
        source: urlText,
      });
    }, { statusCode: status, urlText: url }).catch(() => {});
  });

  try {
    page.setDefaultTimeout(20000);
    await page.goto(served.url, { waitUntil: "domcontentloaded" });
    await loginAs(page, "admin");
    const seedStorageInfo = await seedApp(page, data);
    await page.reload({ waitUntil: "domcontentloaded" });
    await loginAs(page, "admin");
    const storage = await inspectStorage(page);
    storage.seedStorageInfo = seedStorageInfo;

    const runs = [];
    for (const viewport of args.viewports) {
      for (const role of args.roles) {
        process.stdout.write(`stress ${role} ${viewport.name}... `);
        const run = await auditRoleViewport(page, role, viewport, args.tabs, args);
        runs.push(run);
        const failCount = run.tabs.filter(
          (tab) => tab.blank || tab.overflow || tab.consoleErrors.length || !tab.switched,
        ).length;
        const warningCount = run.tabs.reduce((sum, tab) => sum + (tab.smallTargetCount ? 1 : 0), 0);
        console.log(`${failCount ? `${failCount} fail` : "ok"}${warningCount ? `, ${warningCount} warn` : ""}`);
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      url: served.url,
      dataset: {
        plays: data.plays.length,
        savedScripts: data.savedScripts.length,
        savedWristbands: data.savedWristbands.length,
        gamePlanBoards: Object.keys(data.gamePlanBoards).length,
        quizResults: data.quizResults.length,
      },
      storage,
      runs,
      issues: [],
    };
    report.issues = collectIssues(report, args.maxIssues);

    const jsonPath = path.join(args.outputDir, "stress-audit-report.json");
    const mdPath = path.join(args.outputDir, "stress-audit-report.md");
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(mdPath, buildMarkdown(report));

    const failures = report.issues.filter((issue) => issue.severity === "fail");
    const warnings = report.issues.filter((issue) => issue.severity === "warn");
    console.log(`report: ${jsonPath}`);
    console.log(`summary: ${failures.length} failure(s), ${warnings.length} warning(s)`);
    if (failures.length && !args.warnOnly) process.exitCode = 1;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    closeServer(served.server);
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exitCode = 1;
});
