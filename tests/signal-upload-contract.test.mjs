/**
 * Signal upload contract — phone captures may be larger than the final R2
 * object, but final player media stays capped and retryable uploads retain
 * their original prepared blob in the durable outbox.
 */

import fs from "node:fs";

const clips = fs.readFileSync(new URL("../js/play-clips.js", import.meta.url), "utf8");
const signals = fs.readFileSync(new URL("../js/signals.js", import.meta.url), "utf8");
let failed = 0;

function assert(condition, label) {
  if (condition) console.log(`  ✅ ${label}`);
  else {
    failed += 1;
    console.error(`  ❌ ${label}`);
  }
}

console.log("\n▸ Signal phone upload contract");

assert(/const MAX_BYTES = 25 \* 1024 \* 1024/.test(clips), "final R2 clip cap remains 25 MiB");
assert(/const MAX_SOURCE_BYTES = 100 \* 1024 \* 1024/.test(clips), "larger phone source allowance is explicit");
assert(/if \(file\.size > MAX_SOURCE_BYTES\)/.test(clips), "source validation occurs before processing");
assert(/if \(uploadFile\.size > MAX_BYTES\)/.test(clips), "optimized output is still capped before upload");
assert(/Boolean\(opts\.allowOriginalFallback\)[\s\S]*file\.size <= MAX_BYTES/.test(clips), "unsupported mobile encoders can safely retain an already-small original");
assert(/processingMode = "original-fallback"/.test(clips), "fallback is reported to the review UI");
assert(/async function uploadPreparedWithRetryForSig\(sig, prepared, label, opts = \{\}\)/.test(clips), "prepared uploads use the durable retry wrapper");
assert(/metadata: opts\.outboxMetadata/.test(clips), "queued upload metadata is retained with the binary");
assert(/new CustomEvent\("play-clip-uploaded"/.test(clips), "outbox completion emits a UI reconciliation event");
assert(/const SIGNAL_MAX_SOURCE_BYTES = 100 \* 1024 \* 1024/.test(signals), "signal UI states the source allowance");
assert(/allowOriginalFallback: true/.test(signals), "signal review enables the safe mobile fallback");
assert(/uploadPreparedWithRetryForSig/.test(signals), "signal confirmation uses durable retry");
assert(/window\.addEventListener\("play-clip-uploaded"/.test(signals), "signal record is created only after a queued upload completes");
assert(/async function reconcilePublishedSignalRecords\(\)/.test(signals), "staff startup reconciles old clip manifests that are missing their published signal record");
assert(/window\.playClips\.loadIndex/.test(signals), "signal reconciliation uses the shared indexed manifest request instead of one request per signal");
assert(/recordPlayerPublishStatus\("signals"/.test(signals), "reconciled signal metadata immediately advances the player release");
assert(/coverageStatus: \{/.test(signals), "signal coverage exceptions persist with the normal synced signal record");
assert(/function _sigSetCoverageException\(summary, mode\)/.test(signals), "coverage exceptions use one reversible state transition");
assert(/document\.addEventListener\("contextmenu", _sigHandleCoverageExceptionShortcut, true\)/.test(signals), "Ctrl-click is supported on macOS context-menu gestures");
assert(/_sigCoverageStatus\(record\)\) return;/.test(signals), "explicit coverage exceptions suppress only the active Game Plan missing-signal warning");
assert(/has-signal-exception/.test(signals), "accepted coverage has a distinct green chip state");

if (failed) process.exit(1);
console.log("Signal phone upload contract passed.");
