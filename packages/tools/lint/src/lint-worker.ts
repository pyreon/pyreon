import { parentPort, workerData } from 'node:worker_threads'
import { type LintWorkerInput, lintSlice } from './lint-slice'

/**
 * Worker entry for the parallel lint path.
 *
 * Linting is embarrassingly parallel — each file's diagnostics depend only on
 * that file plus the resolved config — but the engine ran every file on one
 * core while the other thirteen sat idle.
 *
 * The config is resolved ONCE on the main thread and handed over as plain
 * data, so a worker never re-reads `.pyreonlintrc.json`, never re-resolves the
 * preset, and cannot disagree with its siblings about what is enabled.
 *
 * Own-file writes: a worker applies `--fix` to the files it was given. That is
 * safe precisely because the partition is by file — no two workers ever touch
 * the same path — and it keeps the fixed source out of the message channel.
 */

if (parentPort) {
  const out = lintSlice(workerData as LintWorkerInput)
  parentPort.postMessage(out)
}
