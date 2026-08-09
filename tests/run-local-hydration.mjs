#!/usr/bin/env node

/**
 * Launch the first-load hydration check against a server that belongs only to
 * this Playwright invocation. Keeping port selection here avoids accidentally
 * attaching to a stale local server from another worktree or test run.
 */
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const playwrightCli = path.join(testsRoot, "node_modules", "playwright", "cli.js");

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

function runHydrationSuite(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [playwrightCli, "test", "--project=chromium-desktop", "specs/09-first-load-hydration.spec.js"],
    {
      cwd: testsRoot,
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        BCOFFENSE_E2E_LOCAL: "1",
        BCOFFENSE_E2E_PORT: String(port),
      },
      stdio: "inherit",
    },
  );

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

try {
  const requestedPort = readRequestedPort(process.env.BCOFFENSE_E2E_PORT);
  const port = requestedPort || await findFreeLoopbackPort();
  process.exitCode = await runHydrationSuite(port);
} catch (error) {
  console.error(`Unable to start the local hydration suite: ${error.message}`);
  process.exitCode = 1;
}
