// @ts-check
const { test, expect } = require("@playwright/test");
const { login } = require("./helpers");

test.describe("Player Presentation diagram cache", () => {
  test("uses the cached canonical diagram when a published file request temporarily fails", async ({ page }) => {
    const mediaId = "play:player-presentation-cache-regression";
    const imageRequests = [];

    // Start as coach so the production image runtime has not opened the
    // player cache yet. Chromium's test profile occasionally rejects Blob
    // writes to native IndexedDB (the existing player spec handles the same
    // test-environment limitation). The small in-memory player-only facade
    // below lets the real cache/readiness code run unchanged.
    await login(page, { role: "coach", username: "coach" });
    await page.waitForFunction(() =>
      Boolean(
        window.playImages &&
        typeof window.playImages.ready === "function" &&
        typeof window.openPlayPresentation === "function" &&
        window.getCurrentAuthUser?.()?.role === "coach",
      ),
    );

    await page.route("**/images/**", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.searchParams.get("sig") !== mediaId) {
        await route.continue();
        return;
      }
      imageRequests.push(`${requestUrl.pathname}?${requestUrl.searchParams}`);
      if (requestUrl.pathname === "/images/manifest") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            published: true,
            size: 68,
            contentType: "image/png",
            version: "published-v1",
          }),
        });
        return;
      }
      if (requestUrl.pathname === "/images/file") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: "Temporarily unavailable" }),
        });
        return;
      }
      await route.continue();
    });

    await page.evaluate(async ({ mediaId: canonicalMediaId }) => {
      const nativeIndexedDb = window.indexedDB;
      const entries = new Map();
      const success = (value) => {
        const request = { result: undefined, error: null, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          request.result = value;
          request.onsuccess?.({ target: request });
        });
        return request;
      };
      const store = {
        put(value, key) {
          entries.set(String(key), value);
          return success(true);
        },
        get(key) { return success(entries.get(String(key)) || null); },
        delete(key) {
          entries.delete(String(key));
          return success(true);
        },
        clear() {
          entries.clear();
          return success(true);
        },
        getAllKeys() { return success([...entries.keys()]); },
      };
      const playerDatabase = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => store,
        transaction: () => ({ objectStore: () => store }),
      };
      const indexedDbFacade = Object.create(nativeIndexedDb);
      indexedDbFacade.open = function open(name, version) {
        if (name !== "bcoffense-player-images") {
          return nativeIndexedDb.open.call(nativeIndexedDb, name, version);
        }
        const request = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
        queueMicrotask(() => {
          request.result = playerDatabase;
          request.onsuccess?.({ target: request });
        });
        return request;
      };
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        value: indexedDbFacade,
      });
      const playerUser = { username: "player", role: "player", label: "Player" };
      window.getCurrentAuthUser = () => playerUser;
      window.whenAuthReady = () => Promise.resolve(playerUser);
      const cachedBlob = await fetch("/icons/icon-192.png").then((response) => response.blob());
      const play = {
        id: "player-presentation-cache-source",
        mediaId: canonicalMediaId,
        type: "Run",
        personnel: "11",
        formation: "Trips",
        play: "Cached Diagram Regression",
        respQ: "Secure the edge.",
      };
      await window.playImages.ready();
      await window.playImages.set(
        canonicalMediaId,
        cachedBlob,
        { emit: false },
      );
      window.openPlayPresentation([{ play, sourceIndex: 0 }], 0, "script");
    }, { mediaId });

    const presentation = page.locator("#playPresentationOverlay");
    await expect(presentation).toBeVisible();
    await expect(presentation.locator("#playPresentationDiagramStatus")).toContainText("Diagram ready");
    await expect(presentation.locator(".pp-diagram-canvas")).toBeVisible();
    await expect(presentation).not.toContainText(/connection is stable/i);
    const encodedMediaId = encodeURIComponent(mediaId);
    expect(imageRequests).toEqual(expect.arrayContaining([
      `/images/manifest?sig=${encodedMediaId}`,
      `/images/file?sig=${encodedMediaId}`,
    ]));
  });
});
