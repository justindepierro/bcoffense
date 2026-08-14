#!/usr/bin/env node

/**
 * Run the required WebKit iPad smoke against a server that belongs only to
 * this invocation. A fixed 4177 port can be held by an abandoned local test
 * process, which otherwise makes a long release gate exercise unknown code or
 * fail before WebKit starts. Keep the browser checks fail-closed while giving
 * every run a fresh loopback endpoint.
 */
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const playwrightCli = path.join(testsRoot, "node_modules", "playwright", "cli.js");
let activeChild = null;

// macOS WebKit can lose document state after many unrelated app lifecycles in
// a single browser process. Run each required spec once in a fresh, owned
// process instead. This is not a retry or a reduced matrix: every assertion
// still runs exactly once, and the first failing batch stops the gate.
const REQUIRED_SPECS = [
  "specs/19-player-presentation-diagram-cache.spec.js",
  "specs/04-responsive.spec.js",
  "specs/11-playbook-tablet-drawers.spec.js",
  "specs/12-tablet-blocking-layers.spec.js",
  "specs/13-wristband-tablet-rail.spec.js",
  "specs/15-gameplan-tablet-rail.spec.js",
  "specs/16-tablet-usable-height-layers.spec.js",
  "specs/23-reorder-modal-layers.spec.js",
  "specs/24-playbook-deferred-layers.spec.js",
  "specs/25-player-playbook-tablet-touch.spec.js",
  "specs/26-playbook-print-layer.spec.js",
  "specs/28-callsheet-ipad-portrait-controls.spec.js",
  "specs/29-compact-tablet-quick-tools.spec.js",
  "specs/30-player-ipad-header.spec.js",
  "specs/31-player-ipad-study-surface.spec.js",
];
const SMOKE_BATCHES = REQUIRED_SPECS.map((spec) => [spec]);
const WEBKIT_PROCESS_SETTLE_MS = 1_000;

function readRequestedPort(value) {
  if (!value) return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("BCOFFENSE_E2E_PORT must be an integer from 1024 through 65535.");
  }
  return port;
}

function findFreeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close(() => reject(new Error("Could not allocate a local E2E port.")));
        return;
      }
      probe.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function runWebKitIpadSmokeBatch(port, specs, batchIndex) {
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(
    `\n[webkit-ipad-smoke] Batch ${batchIndex + 1}/${SMOKE_BATCHES.length} on ${baseUrl}`,
  );
  const child = spawn(
    process.execPath,
    [
      playwrightCli,
      "test",
      "--project=ipad-portrait",
      "--project=ipad-landscape",
      "--workers=1",
      "--retries=0",
      ...specs,
    ],
    {
      cwd: testsRoot,
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        BCOFFENSE_E2E_LOCAL: "1",
        BCOFFENSE_E2E_LOCAL_DIRECT_LOGIN: "1",
        BCOFFENSE_E2E_PORT: String(port),
      },
      stdio: "inherit",
    },
  );
  activeChild = child;

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    // `close` waits for Playwright's stdio to close after the runner exits.
    // It is a safer batch boundary than `exit` for WebKit's native teardown.
    child.once("close", (code, signal) => {
      if (activeChild === child) activeChild = null;
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

function waitForWebKitProcessSettlement() {
  return new Promise((resolve) => setTimeout(resolve, WEBKIT_PROCESS_SETTLE_MS));
}

function forwardSignal(signal) {
  if (activeChild && !activeChild.killed) activeChild.kill(signal);
}

process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));

try {
  const requestedPort = readRequestedPort(process.env.BCOFFENSE_E2E_PORT);
  let exitCode = 0;
  for (let index = 0; index < SMOKE_BATCHES.length; index += 1) {
    // A requested port remains useful while debugging the first batch. Every
    // later batch gets its own port so a delayed WebKit/web-server teardown
    // cannot attach the next strict check to stale app state.
    const port = index === 0 && requestedPort
      ? requestedPort
      : await findFreeLoopbackPort();
    exitCode = await runWebKitIpadSmokeBatch(port, SMOKE_BATCHES[index], index);
    if (exitCode !== 0) break;
    if (index < SMOKE_BATCHES.length - 1) {
      // Give the previous native WebKit process one short cleanup turn before
      // the next clean browser starts. This bounds the lifecycle race without
      // retrying tests or extending any product-test timeout.
      await waitForWebKitProcessSettlement();
    }
  }
  process.exitCode = exitCode;
} catch (error) {
  console.error(`Unable to start the local WebKit iPad smoke: ${error.message}`);
  process.exitCode = 1;
}
