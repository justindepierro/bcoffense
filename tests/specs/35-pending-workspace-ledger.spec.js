// @ts-check
/**
 * Browser-level regression for the device-only automatic-save journal.
 * IndexedDB transaction scheduling is a browser primitive, so this complements
 * the static contract with two real same-origin tabs mutating one team record.
 */
const { test, expect } = require("@playwright/test");
const { login, dismissFirstUse } = require("./helpers");

const E2E_LOCAL = process.env.BCOFFENSE_E2E_LOCAL === "1";

test.describe("pending workspace sync ledger", () => {
  test.skip(!E2E_LOCAL, "The device-only ledger regression requires the local app server.");

  test("serializes same-team tab mutations and preserves a newer generation during clear", async ({ page }) => {
    await login(page, { role: "coach", username: "coach", password: "password" });
    await dismissFirstUse(page);
    const sibling = await page.context().newPage();
    try {
      await sibling.goto("/");
      await sibling.waitForFunction(() => typeof window.storageManager?.mutatePendingWorkspaceSyncLedger === "function");

      const teamId = `ledger-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // This test owns only its random record. Do not clear the whole
      // device-only ledger: another browser test may legitimately be
      // exercising a different team's pending automatic-save receipt.
      await page.evaluate((team) => (
        storageManager.mutatePendingWorkspaceSyncLedger(team, () => null)
      ), teamId);
      const writeKey = async (target, key) => target.evaluate(async ({ team, nextKey }) => (
        storageManager.mutatePendingWorkspaceSyncLedger(team, (current) => ({
          teamId: team,
          generation: Number(current?.generation || 0) + 1,
          keys: [...new Set([...(current?.keys || []), nextKey])],
        }))
      ), { team: teamId, nextKey: key });

      await Promise.all([
        writeKey(page, "savedScripts"),
        writeKey(sibling, "callSheet"),
      ]);
      const first = await page.evaluate((team) => storageManager.getPendingWorkspaceSyncLedger(team), teamId);
      expect(first?.keys || []).toEqual(expect.arrayContaining(["savedScripts", "callSheet"]));
      expect(first?.generation).toBe(2);

      const snapshotGeneration = first.generation;
      await Promise.all([
        page.evaluate(async ({ team, generation }) => (
          storageManager.mutatePendingWorkspaceSyncLedger(team, (current) => (
            current?.generation === generation ? null : current
          ))
        ), { team: teamId, generation: snapshotGeneration }),
        writeKey(sibling, "gamePlanBoards"),
      ]);
      const final = await page.evaluate((team) => storageManager.getPendingWorkspaceSyncLedger(team), teamId);
      expect(final).not.toBeNull();
      expect(final?.keys || []).toContain("gamePlanBoards");

      await page.evaluate((team) => (
        storageManager.mutatePendingWorkspaceSyncLedger(team, () => null)
      ), teamId);
    } finally {
      await sibling.close();
    }
  });
});
