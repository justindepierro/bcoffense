// @ts-nocheck
/**
 * Local-only data integrity tests.
 *
 * These mutate browser storage directly, so they intentionally run only under
 * BCOFFENSE_E2E_LOCAL=1.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse } = require("./helpers");

const E2E_LOCAL = process.env.BCOFFENSE_E2E_LOCAL === "1";

test.describe("Local data integrity", () => {
  test.skip(!E2E_LOCAL, "Data integrity tests mutate storage and require the local E2E server.");

  test.beforeEach(async ({ page }) => {
    await login(page, { role: "admin" });
    await dismissFirstUse(page);
  });

  test("backup and restore preserve playbook plus downstream artifacts", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const seeded = await seedIntegrityFixture();
      const before = await integritySnapshot();
      const backup = await storageManager.getAllData();
      await storageManager.clearAll(false);
      const afterClear = await integritySnapshot();
      await storageManager.restoreAllData(backup, { confirmOverwrite: false });
      const afterRestore = await integritySnapshot();

      return {
        seeded,
        before,
        afterClear,
        afterRestore,
        backupPlaybookIsJson: typeof backup[STORAGE_KEYS.PLAYBOOK] === "string",
        backupIncludesQuiz: backup[STORAGE_KEYS.PLAYER_QUIZ_RESULTS] !== undefined,
      };

      async function seedIntegrityFixture() {
        await storageManager.clearAll(false);
        const playA = makeIntegrityPlay("integrity-play-a", "Run", "Trips Rt", "Buck Sweep");
        const playB = makeIntegrityPlay("integrity-play-b", "Pass", "Doubles Lt", "Viper Sooners");
        const playbook = [playA, playB];
        if (typeof ensurePlaybookPlayIds === "function") ensurePlaybookPlayIds(playbook);
        await storageManager.setPlaybook(playbook);

        const scriptCopyA = copyIntegrityPlay(playA, { id: "script-copy-a", hash: "L" });
        const scriptCopyB = copyIntegrityPlay(playB, { id: "script-copy-b", hash: "R" });
        storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, [{
          id: "integrity-script",
          name: "Integrity Script",
          date: "2026-07-08",
          plays: [{ isSeparator: true, id: "period-1", label: "Team", minutes: 10 }, scriptCopyA, scriptCopyB],
        }]);

        storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, [{
          id: "integrity-wristband",
          title: "Integrity Wristband",
          cards: [{ name: "Card 1", data: [copyIntegrityPlay(playA, { wristbandNumber: 1 }), copyIntegrityPlay(playB, { wristbandNumber: 2 })] }],
        }]);

        storageManager.set(STORAGE_KEYS.CALL_SHEET, {
          "1st-down": {
            left: [copyIntegrityPlay(playA, { wristbandNumber: 11 })],
            right: [copyIntegrityPlay(playB, { wristbandNumber: 12 })],
          },
        });

        storageManager.set(STORAGE_KEYS.GAME_PLAN_BOARDS, {
          "Integrity Opponent": {
            assignments: {
              __holding: [],
              Run: [copyIntegrityPlay(playA, { _gpSource: true })],
              Pass: [copyIntegrityPlay(playB, { _gpSource: true })],
            },
            customBoxes: [],
            targets: {},
            collapsed: [],
            notes: {},
            sort: {},
            hiddenBoxes: [],
            boxOrder: [],
            boxLabels: {},
            boxMeta: {},
          },
        });

        storageManager.set(STORAGE_KEYS.PLAYER_QUIZ_RESULTS, [{
          id: "integrity-quiz",
          playerName: "Lucas",
          account: "player",
          score: 90,
          total: 100,
          playIds: [playA.id, playB.id],
        }]);
        storageManager.set(STORAGE_KEYS.FIRST_USE_DISMISSED, true);
        return { playIds: playbook.map((play) => play.id) };
      }

      function makeIntegrityPlay(id, type, formation, play) {
        return {
          id,
          type,
          personnel: type === "Run" ? "11" : "10",
          formation,
          play,
          basePlay: play.split(" ")[0],
          tempo: "Fast",
          preferredDown: type === "Run" ? "1" : "3",
          preferredDistance: type === "Run" ? "Medium" : "Long",
          respQ: "Know the rule.",
          playerNotes: "Study the landmark.",
        };
      }

      function copyIntegrityPlay(play, overrides = {}) {
        return typeof copyPlayWithSourceIdentity === "function"
          ? copyPlayWithSourceIdentity(play, overrides)
          : {
              ...play,
              ...overrides,
              playbookId: play.id,
              sourcePlayId: play.id,
              originalPlayId: play.id,
              sourceIdentityKey: [play.personnel, play.formation, play.play].join("|"),
            };
      }

      async function integritySnapshot() {
        const rawPlaybook = await storageManager.getPlaybook();
        const playbook = Array.isArray(rawPlaybook) ? rawPlaybook : [];
        const savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
        const savedWristbands = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
        const callSheet = storageManager.get(STORAGE_KEYS.CALL_SHEET, {});
        const boards = storageManager.get(STORAGE_KEYS.GAME_PLAN_BOARDS, {});
        const quiz = storageManager.get(STORAGE_KEYS.PLAYER_QUIZ_RESULTS, []);
        return {
          playbookIds: playbook.map((play) => play.id),
          scriptSourceIds: savedScripts.flatMap((script) =>
            (script.plays || []).filter((play) => !play.isSeparator).map((play) => play.sourcePlayId || play.playbookId || play.id),
          ),
          wristbandSourceIds: savedWristbands.flatMap((wristband) =>
            (wristband.cards || []).flatMap((card) => (card.data || []).filter(Boolean).map((play) => play.sourcePlayId || play.playbookId || play.id)),
          ),
          callSheetSourceIds: Object.values(callSheet).flatMap((cat) =>
            [...(cat.left || []), ...(cat.right || [])].map((play) => play.sourcePlayId || play.playbookId || play.id),
          ),
          gamePlanSourceIds: Object.values(boards).flatMap((board) =>
            Object.values(board.assignments || {}).flatMap((plays) => (plays || []).map((play) => play.sourcePlayId || play.playbookId || play.id)),
          ),
          quizIds: quiz.map((row) => row.id),
        };
      }
    });

    expect(result.backupPlaybookIsJson).toBe(true);
    expect(result.backupIncludesQuiz).toBe(true);
    expect(result.afterClear.playbookIds).toEqual([]);
    expect(result.afterRestore).toEqual(result.before);
    expect(result.before.playbookIds).toEqual(result.seeded.playIds);
  });

  test("source identity metadata makes edited and deleted source plays detectable", async ({ page }) => {
    const result = await page.evaluate(async () => {
      await storageManager.clearAll(false);
      const playA = makeIntegrityPlay("identity-play-a", "Run", "Trips Rt", "Buck Sweep");
      const playB = makeIntegrityPlay("identity-play-b", "Pass", "Doubles Lt", "Viper Sooners");
      const playbook = [playA, playB];
      await storageManager.setPlaybook(playbook);

      const downstream = [
        copyIntegrityPlay(playA, { id: "script-a" }),
        copyIntegrityPlay(playB, { id: "script-b" }),
      ];
      storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, [{ id: "identity-script", plays: downstream }]);
      storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, [{ id: "identity-wb", cards: [{ name: "Card 1", data: downstream }] }]);
      storageManager.set(STORAGE_KEYS.CALL_SHEET, { "1st-down": { left: [downstream[0]], right: [downstream[1]] } });
      storageManager.set(STORAGE_KEYS.GAME_PLAN_BOARDS, { Identity: { assignments: { Run: [downstream[0]], Pass: [downstream[1]] } } });

      const editedPlayA = { ...playA, play: "Buck Sweep Edited" };
      await storageManager.setPlaybook([editedPlayA]);
      const currentPlaybook = await storageManager.getPlaybook();
      const statuses = collectDownstreamEntries().map((entry) => describeSourceStatus(entry, currentPlaybook));

      return {
        statuses,
        changedCount: statuses.filter((status) => status.state === "changed").length,
        missingCount: statuses.filter((status) => status.state === "missing").length,
        sourceIds: statuses.map((status) => status.sourceId),
      };

      function makeIntegrityPlay(id, type, formation, play) {
        return {
          id,
          type,
          personnel: type === "Run" ? "11" : "10",
          formation,
          play,
          basePlay: play.split(" ")[0],
          preferredDown: "1",
          preferredDistance: "Medium",
        };
      }

      function copyIntegrityPlay(play, overrides = {}) {
        return typeof copyPlayWithSourceIdentity === "function"
          ? copyPlayWithSourceIdentity(play, overrides)
          : {
              ...play,
              ...overrides,
              playbookId: play.id,
              sourcePlayId: play.id,
              originalPlayId: play.id,
              sourceIdentityKey: [play.personnel, play.formation, play.play].join("|"),
            };
      }

      function collectDownstreamEntries() {
        const scripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
        const wristbands = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
        const callSheet = storageManager.get(STORAGE_KEYS.CALL_SHEET, {});
        const boards = storageManager.get(STORAGE_KEYS.GAME_PLAN_BOARDS, {});
        return [
          ...scripts.flatMap((script) => script.plays || []),
          ...wristbands.flatMap((wristband) => (wristband.cards || []).flatMap((card) => card.data || [])),
          ...Object.values(callSheet).flatMap((cat) => [...(cat.left || []), ...(cat.right || [])]),
          ...Object.values(boards).flatMap((board) => Object.values(board.assignments || {}).flatMap((plays) => plays || [])),
        ].filter((entry) => entry && !entry.isSeparator);
      }

      function describeSourceStatus(entry, playbook) {
        const sourceId = typeof getStablePlaySourceId === "function"
          ? getStablePlaySourceId(entry)
          : (entry.playbookId || entry.sourcePlayId || entry.originalPlayId || entry.id || "");
        const source = playbook.find((play) => {
          const id = typeof getStablePlaySourceId === "function"
            ? getStablePlaySourceId(play)
            : (play.playbookId || play.sourcePlayId || play.originalPlayId || play.id || "");
          return id === sourceId;
        });
        if (!source) return { state: "missing", sourceId };

        const currentIdentity = typeof getPlayIdentityKey === "function"
          ? getPlayIdentityKey(source, "tag", { trim: false })
          : [source.personnel, source.formation, source.play].join("|");
        const originalIdentity = entry.sourceIdentityKey || "";
        return {
          state: originalIdentity && currentIdentity !== originalIdentity ? "changed" : "ok",
          sourceId,
          originalIdentity,
          currentIdentity,
        };
      }
    });

    expect(result.sourceIds).toContain("identity-play-a");
    expect(result.sourceIds).toContain("identity-play-b");
    expect(result.changedCount).toBeGreaterThanOrEqual(1);
    expect(result.missingCount).toBeGreaterThanOrEqual(1);
  });
});
