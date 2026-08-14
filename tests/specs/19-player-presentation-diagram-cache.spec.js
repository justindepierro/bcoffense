// @ts-check
const { test, expect } = require("@playwright/test");
const { login } = require("./helpers");

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9L+54AAAAASUVORK5CYII=",
  "base64",
);

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

  test("renders an authenticated download when the player IndexedDB cache write is rejected", async ({ page }) => {
    const mediaId = "play:player-presentation-private-idb-regression";
    const imageRequests = [];

    await login(page, { role: "coach", username: "coach" });
    await page.waitForFunction(() =>
      Boolean(
        window.playImages &&
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
            available: true,
            size: ONE_PIXEL_PNG.byteLength,
            contentType: "image/png",
            version: "published-v1",
          }),
        });
        return;
      }
      if (requestUrl.pathname === "/images/file") {
        await route.fulfill({
          status: 200,
          contentType: "image/png",
          body: ONE_PIXEL_PNG,
        });
        return;
      }
      await route.continue();
    });

    await page.evaluate(({ canonicalMediaId }) => {
      const nativeIndexedDb = window.indexedDB;
      const failedRequest = () => {
        const request = { result: undefined, error: null, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          request.error = new DOMException("Quota exceeded", "QuotaExceededError");
          request.onerror?.({ target: request });
        });
        return request;
      };
      const playerDatabase = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => null,
        transaction: () => ({
          objectStore: () => ({
            put: failedRequest,
            get: failedRequest,
            delete: failedRequest,
            clear: failedRequest,
            getAllKeys: failedRequest,
          }),
        }),
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
      window.playImages.clearRemoteManifestCache?.();
      window.openPlayPresentation([{
        play: {
          id: "player-presentation-private-idb-source",
          mediaId: canonicalMediaId,
          type: "Run",
          personnel: "11",
          formation: "Trips",
          play: "Private Cache Diagram Regression",
          respQ: "Secure the edge.",
        },
        sourceIndex: 0,
      }], 0, "script");
    }, { canonicalMediaId: mediaId });

    const presentation = page.locator("#playPresentationOverlay");
    await expect(presentation).toBeVisible();
    await expect(presentation.locator("#playPresentationDiagramStatus")).toContainText("Diagram ready");
    await expect(presentation.locator(".pp-diagram-canvas, .pp-diagram-image")).toBeVisible();
    await expect(presentation).not.toContainText(/connection is stable/i);
    await expect.poll(() => page.evaluate((canonicalMediaId) =>
      String(window.playImages.urlFor(canonicalMediaId) || "").startsWith("blob:"), mediaId,
    )).toBe(true);
    const encodedMediaId = encodeURIComponent(mediaId);
    expect(imageRequests).toEqual(expect.arrayContaining([
      `/images/manifest?sig=${encodedMediaId}`,
      `/images/file?sig=${encodedMediaId}`,
    ]));
  });

  test("shows a distinct restore state when the published manifest has no R2 binary", async ({ page }) => {
    const mediaId = "play:player-presentation-missing-r2-regression";
    const imageRequests = [];

    await login(page, { role: "coach", username: "coach" });
    await page.waitForFunction(() => Boolean(window.playImages && window.openPlayPresentation));
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
            available: false,
            size: ONE_PIXEL_PNG.byteLength,
            contentType: "image/png",
            version: "published-missing-r2-v1",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "Diagram binary is unavailable." }),
      });
    });

    await page.evaluate((canonicalMediaId) => {
      const playerUser = { username: "player", role: "player", label: "Player" };
      window.getCurrentAuthUser = () => playerUser;
      window.whenAuthReady = () => Promise.resolve(playerUser);
      window.playImages.clearRemoteManifestCache?.();
      window.openPlayPresentation([{
        play: {
          id: "player-presentation-missing-r2-source",
          mediaId: canonicalMediaId,
          type: "Run",
          personnel: "11",
          formation: "Trips",
          play: "Missing R2 Diagram Regression",
          respQ: "Secure the edge.",
        },
        sourceIndex: 0,
      }], 0, "script");
    }, mediaId);

    const presentation = page.locator("#playPresentationOverlay");
    await expect(presentation).toBeVisible();
    await expect(presentation.locator("#playPresentationDiagramStatus")).toContainText("Diagram needs restore");
    await expect(presentation).toContainText(/cloud file needs to be restored by a coach/i);
    await expect(presentation).not.toContainText(/connection is stable/i);
    const encodedMediaId = encodeURIComponent(mediaId);
    expect(imageRequests).toEqual([`/images/manifest?sig=${encodedMediaId}`]);
  });
});
