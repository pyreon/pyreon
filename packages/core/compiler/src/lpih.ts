/**
 * Live Program Inlay Hints (LPIH) — merge runtime fire data onto static
 * Reactivity-Lens findings.
 *
 * This is a PURE function. The runtime side (`@pyreon/reactivity`)
 * captures source locations at signal/computed/effect creation and emits
 * fire counts via `getFireSummaries()`. The editor/LSP side calls
 * `analyzeReactivity()` to get static findings. This module bridges them:
 * given findings + fires, produces enriched findings whose `detail` field
 * carries the live fire count.
 *
 * No I/O, no devtools dependency. The LSP transport is the consumer's
 * responsibility (read fires from a cache file, an IPC bridge, or
 * the editor's devtools panel — whatever the editor extension wants).
 *
 * ## The category
 *
 * Editors today show STATIC errors, types, and lint warnings at the
 * cursor. They do NOT show LIVE program data — "this signal fires 240×
 * per second", "this effect re-runs 3× per render", "this computed has
 * 12 downstream subscribers". That data lives in a separate devtools
 * panel that the developer has to context-switch to.
 *
 * LPIH closes that gap: live runtime data appears AT THE SOURCE LINE
 * via LSP inlay hints, like a type annotation or a TypeScript error.
 * No category like this exists for any reactive framework today.
 *
 * @example
 * import { analyzeReactivity, mergeFireDataIntoFindings } from '@pyreon/compiler'
 * import { getFireSummaries } from '@pyreon/reactivity'
 *
 * const code = `const count = signal(0)\nreturn <div>{count()}</div>`
 * const { findings } = analyzeReactivity(code, 'app.tsx')
 * const fires = getFireSummaries().map(s => ({
 *   file: s.loc.file, line: s.loc.line, count: s.count, kind: s.kind,
 * }))
 * const enriched = mergeFireDataIntoFindings(findings, fires, 'app.tsx')
 * // enriched[0].detail might now be "live — signal fired 240×"
 */

import type { ReactivityFinding, ReactivityFindingKind } from './reactivity-lens'

/**
 * Runtime fire data carried into the merge function. Shape mirrors
 * `@pyreon/reactivity`'s `FireSummary` but is duplicated here to keep
 * `@pyreon/compiler` free of a runtime-package import. The consumer
 * adapts the shape at the call site.
 */
export interface LPIHFireDatum {
  /** Source file path captured from `new Error().stack`. */
  file: string
  /** 1-based line number (V8 stack format). */
  line: number
  /** Total fires recorded at this location. */
  count: number
  /** `performance.now()` of most recent fire, or null. */
  lastFire?: number | null | undefined
  /** Node kind that fired (signal / derived / effect). */
  kind?: 'signal' | 'derived' | 'effect' | undefined
  /**
   * Exponentially-decayed fire rate, fires/sec (1s time constant). 0
   * when the node has been idle longer than several time constants.
   * Used by the default formatter to add a "12/s" suffix when active.
   * See `@pyreon/reactivity`'s `FireSummary.rate1s` for the math.
   */
  rate1s?: number | undefined
}

/** Options for `mergeFireDataIntoFindings`. */
export interface LPIHMergeOptions {
  /**
   * Optional file-path normalizer. Used for both the analyzed source
   * file and each fire's `file` field. Useful when fires come from
   * runtime stacks (absolute paths) but the source file is identified
   * relative (e.g. workspace-rooted). Defaults to identity.
   */
  normalizeFile?: (path: string) => string
  /**
   * Optional formatter for the enriched detail. Receives the original
   * detail + the matched fire datum. Defaults to:
   *   `${detail} — ${kind ? kind + ' ' : ''}fired ${count}×`
   */
  formatDetail?: (detail: string, fire: LPIHFireDatum) => string
}

/**
 * Threshold below which the rate suffix is omitted. A long-dormant node
 * decays toward 0; showing "0/s" or "0.001/s" is noise. The 0.5 cutoff
 * means "less than once every 2 seconds at steady state" — at that
 * rate, the cumulative count is the more useful signal.
 *
 * @internal — exported for tests + tunability.
 */
export const _LPIH_RATE_VISIBLE_THRESHOLD = 0.5

function _formatRate(rate1s: number): string {
  if (rate1s < _LPIH_RATE_VISIBLE_THRESHOLD) return ''
  // < 10/s: 1 decimal place. ≥ 10/s: rounded integer.
  return rate1s < 10 ? ` (${rate1s.toFixed(1)}/s)` : ` (${Math.round(rate1s)}/s)`
}

const DEFAULT_FORMAT = (detail: string, fire: LPIHFireDatum): string => {
  const kindLabel = fire.kind ? `${fire.kind} ` : ''
  const rate = typeof fire.rate1s === 'number' ? _formatRate(fire.rate1s) : ''
  return `${detail} — ${kindLabel}fired ${fire.count}×${rate}`
}

/**
 * Merge runtime fire data onto static reactivity findings. Pure function,
 * deterministic, input not mutated.
 *
 * Matching rules:
 *   - Only fires whose normalized `file` matches the analyzed source file
 *     are considered (cross-file fires are silently skipped).
 *   - Line-level matching only (column is ignored). V8 stack columns
 *     differ from compiler-emitted span columns by 1+ chars in practice,
 *     and the user-visible affordance is "this signal at this line is
 *     firing" — line precision is sufficient.
 *   - Multiple fires at the same `line` are summed; latest `lastFire`
 *     and corresponding `kind` win.
 *   - Findings of kind `footgun`, `hoisted-static`, or `static-text` are
 *     passed through unchanged — they're not runtime-active reactive
 *     reads, so a fire count at their location is unrelated to them.
 */
export function mergeFireDataIntoFindings(
  findings: ReactivityFinding[],
  fires: readonly LPIHFireDatum[],
  sourceFile: string,
  options: LPIHMergeOptions = {},
): ReactivityFinding[] {
  if (fires.length === 0) return findings
  const norm = options.normalizeFile ?? ((p) => p)
  const format = options.formatDetail ?? DEFAULT_FORMAT
  const targetFile = norm(sourceFile)

  // Build line-keyed index. Sum counts at the same line; latest wins for
  // lastFire + kind.
  const byLine = new Map<number, LPIHFireDatum>()
  for (const f of fires) {
    if (norm(f.file) !== targetFile) continue
    const existing = byLine.get(f.line)
    if (existing) {
      existing.count += f.count
      if (typeof f.rate1s === 'number') {
        existing.rate1s = (existing.rate1s ?? 0) + f.rate1s
      }
      const incomingLast = f.lastFire ?? -Infinity
      const existingLast = existing.lastFire ?? -Infinity
      if (incomingLast > existingLast) {
        existing.lastFire = f.lastFire
        existing.kind = f.kind ?? existing.kind
      }
    } else {
      byLine.set(f.line, { ...f })
    }
  }

  if (byLine.size === 0) return findings

  return findings.map((finding) => {
    // Footguns + static spans are NOT enriched — fire data at those lines
    // belongs to a SEPARATE reactive expression on the same line, and
    // attributing it to the footgun would be misleading.
    if (
      finding.kind === 'footgun' ||
      finding.kind === 'hoisted-static' ||
      finding.kind === 'static-text'
    ) {
      return finding
    }
    const fire = byLine.get(finding.line)
    if (!fire) return finding
    return {
      ...finding,
      detail: format(finding.detail, fire),
    }
  })
}

/**
 * Synthesize "creation-site" inlay-hint findings directly from fire data.
 *
 * `analyzeReactivity()` produces findings at REACTIVE READ sites (JSX
 * expressions). But the runtime captures fires at CREATION sites
 * (`signal(0)`, `computed(...)`, `effect(...)`). These are usually
 * different source lines — so the merge function above only helps when
 * they happen to coincide.
 *
 * The simpler, more useful editor surface is: show fire counts AT THE
 * CREATION LINE. The user writes `const count = signal(0)` and sees
 * `(signal fired 129×)` as ghost text on that line, the same way
 * TypeScript shows the inferred type.
 *
 * This function turns each fire datum into a synthetic finding the LSP
 * can serve as an inlay hint. No static analysis required — pure runtime
 * data → editor hint.
 *
 * Returns findings sorted by (line, column). Files that don't match
 * `sourceFile` (after normalization) are skipped.
 *
 * @example
 * import { firesToCreationSiteFindings } from '@pyreon/compiler'
 * import { getFireSummaries } from '@pyreon/reactivity'
 *
 * const fires = getFireSummaries().map(s => ({
 *   file: s.loc.file, line: s.loc.line, count: s.count, kind: s.kind,
 * }))
 * const findings = firesToCreationSiteFindings(fires, 'app.tsx')
 * // [{ kind: 'live-fire', line: 5, detail: 'signal fired 129×', ... }]
 */
export function firesToCreationSiteFindings(
  fires: readonly LPIHFireDatum[],
  sourceFile: string,
  options: LPIHMergeOptions = {},
): ReactivityFinding[] {
  if (fires.length === 0) return []
  const norm = options.normalizeFile ?? ((p) => p)
  const targetFile = norm(sourceFile)

  // Per-line aggregation (multiple nodes on the same line — rare but
  // possible: `const [a, b] = [signal(0), signal(0)]`).
  const byLine = new Map<number, LPIHFireDatum>()
  for (const f of fires) {
    if (norm(f.file) !== targetFile) continue
    const existing = byLine.get(f.line)
    if (existing) {
      existing.count += f.count
      // Sum rates at the same line (e.g. destructured signal pair).
      if (typeof f.rate1s === 'number') {
        existing.rate1s = (existing.rate1s ?? 0) + f.rate1s
      }
      const incomingLast = f.lastFire ?? -Infinity
      const existingLast = existing.lastFire ?? -Infinity
      if (incomingLast > existingLast) {
        existing.lastFire = f.lastFire
        existing.kind = f.kind ?? existing.kind
      }
    } else {
      byLine.set(f.line, { ...f })
    }
  }

  const format =
    options.formatDetail ??
    ((_: string, fire: LPIHFireDatum) => {
      const kindLabel = fire.kind ?? 'node'
      const rate = typeof fire.rate1s === 'number' ? _formatRate(fire.rate1s) : ''
      return `${kindLabel} fired ${fire.count}×${rate}`
    })

  // 'live-fire' is a new finding kind — synthetic, not produced by
  // `analyzeReactivity()`. The LSP renders it as an inlay hint the same
  // way as the structural kinds (reactive/static-text/etc).
  const LIVE_KIND = 'live-fire' as ReactivityFindingKind

  const out: ReactivityFinding[] = []
  for (const [line, fire] of byLine) {
    out.push({
      kind: LIVE_KIND,
      line,
      column: 0,
      endLine: line,
      // 9999 = "end of line" sentinel; the LSP can clamp to actual line length.
      endColumn: 9999,
      detail: format('', fire),
    })
  }
  out.sort((a, b) => a.line - b.line || a.column - b.column)
  return out
}
