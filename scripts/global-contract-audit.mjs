#!/usr/bin/env node

/**
 * Reports global-scope coupling without prescribing a risky rewrite.
 *
 * The app deliberately uses classic scripts, so globals are a supported
 * contract. This audit distinguishes declared window exports from optional
 * function guards and highlights guards that point to code in the same file.
 * Run: node scripts/global-contract-audit.mjs [--strict]
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const jsDir = path.join(root, "js");
const strict = process.argv.includes("--strict");
const files = fs
  .readdirSync(jsDir)
  .filter((name) => name.endsWith(".js"))
  .sort();
const manifest = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
const manifestBlock = manifest.match(/```window-export-manifest\n([\s\S]*?)```/)?.[1] || "";
const documentedExports = new Set(
  [...manifestBlock.matchAll(/^window\.([A-Za-z_$][\w$]*)$/gm)].map((match) => match[1]),
);
const directExports = new Set();
const rows = [];

for (const file of files) {
  const source = fs.readFileSync(path.join(jsDir, file), "utf8");
  const ownFunctions = new Set([
    ...source.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g),
    ...source.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g),
  ].map((match) => match[1]));
  const exports = [...source.matchAll(/^\s*window\.([A-Za-z_$][\w$]*)\s*=(?!=)/gm)].map(
    (match) => match[1],
  );
  const guarded = [...source.matchAll(/typeof\s+([A-Za-z_$][\w$]*)\s*===\s*["']function["']/g)].map(
    (match) => match[1],
  );

  exports.forEach((name) => directExports.add(name));
  if (exports.length || guarded.length) {
    rows.push({
      file,
      exports: exports.length,
      guarded: guarded.length,
      sameFileGuards: guarded.filter((name) => ownFunctions.has(name)).length,
    });
  }
}

const undocumented = [...directExports].filter((name) => !documentedExports.has(name)).sort();
const staleManifestEntries = [...documentedExports].filter((name) => !directExports.has(name)).sort();
const totals = rows.reduce(
  (sum, row) => ({
    exports: sum.exports + row.exports,
    guarded: sum.guarded + row.guarded,
    sameFileGuards: sum.sameFileGuards + row.sameFileGuards,
  }),
  { exports: 0, guarded: 0, sameFileGuards: 0 },
);

console.log("Global contract audit");
console.log(`Direct window exports: ${totals.exports} (${directExports.size} unique)`);
console.log(`Optional function guards: ${totals.guarded}`);
console.log(`Same-file guards to review: ${totals.sameFileGuards}`);
console.log("");
console.log("Highest-coupling files:");
console.table(
  rows
    .sort((a, b) => b.guarded - a.guarded || b.exports - a.exports)
    .slice(0, 15),
);

if (undocumented.length) {
  console.error(`Undocumented window exports: ${undocumented.join(", ")}`);
}
if (staleManifestEntries.length) {
  console.error(`Stale window manifest entries: ${staleManifestEntries.join(", ")}`);
}
if (strict && (undocumented.length || staleManifestEntries.length)) {
  process.exitCode = 1;
}
