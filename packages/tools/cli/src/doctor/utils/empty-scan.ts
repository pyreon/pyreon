/**
 * Shared "gate matched no files" result — the fail-loud half of the
 * workspace-roots fix.
 *
 * A file-scanning gate that ends with `scanned: 0` must NEVER read as
 * a clean pass: pre-fix, a foreign-layout repo got 100/100 Grade A
 * while the pattern gates inspected literally nothing (the
 * "silent-filter on aggregate gates" anti-pattern class). The honest
 * semantics: the gate is SKIPPED (its category is "not measured" — no
 * free 100 in the mean, matching the score formula's existing
 * "unmeasured categories don't pull the average up" rule) and the skip
 * reason names the resolved roots so a layout problem is visible at a
 * glance. `meta.emptyScan` lets the renderer surface these louder
 * than ordinary `--skip` skips.
 */

import type { FindingCategory, GateResult } from '../types'
import {
  describeWorkspaceRoots,
  type WorkspaceRoots,
} from './workspace-roots'

export const emptyScanResult = (
  gate: string,
  category: FindingCategory,
  ws: WorkspaceRoots,
  start: number,
  what = 'source files',
): GateResult => ({
  gate,
  category,
  findings: [],
  meta: {
    scanned: 0,
    elapsedMs: Date.now() - start,
    skipped: true,
    emptyScan: true,
    skipReason:
      `matched no ${what} under ${describeWorkspaceRoots(ws)} — ` +
      'a gate that scanned nothing must not read as clean; ' +
      'check the workspace layout or pass --roots <glob,...>',
  },
})
