/**
 * Reactivity Lens — surface the compiler's already-computed reactivity
 * analysis back to the author at the source.
 *
 * Pyreon's #1 silent footgun class: whether code is reactive is invisible at
 * the moment you write it. `const {x}=props` compiles fine, types fine,
 * renders once, and is dead. `<div>{x}</div>` where `x` isn't a signal bakes
 * once. The `@pyreon/compiler` ALREADY decides this per-expression (it has to,
 * for codegen) and then throws the analysis away. This module pipes it back.
 *
 * `analyzeReactivity()` is the single entry point. It returns a sorted list of
 * {@link ReactivityFinding}s built from TWO faithful sources, neither of which
 * is a fresh approximation:
 *
 *  1. **Compiler structural facts** — `TransformResult.reactivityLens`. Each
 *     span is a *record* of a codegen decision (`_bind`/`_bindText`/`_rp`/
 *     hoist/static-text). The positive "this is live" claim is the codegen
 *     branch itself, so it is correct by construction (drift-gated).
 *  2. **Footgun negatives** — the existing `detectPyreonPatterns` AST
 *     detectors (`props-destructured`, `signal-write-as-call`, …). Already
 *     shipped, already AST-based; the lens just unifies them under one
 *     editor-facing taxonomy.
 *
 * Absence of a finding is "not asserted", NEVER an implicit static claim —
 * see the asymmetric-precision commitment in `.claude/plans/reactivity-lens.md`.
 *
 * JS-backend only (Phase 1). The native Rust binary emits byte-identical
 * codegen (527 cross-backend equivalence tests), so the JS path is a sound
 * oracle for the analysis; Rust-path parity is Phase 3.
 *
 * @module
 */

import { transformJSX_JS } from './jsx'
import type { ReactivityKind, ReactivitySpan } from './jsx'
import { detectPyreonPatterns } from './pyreon-intercept'
import type { PyreonDiagnosticCode } from './pyreon-intercept'

export type { ReactivityKind, ReactivitySpan } from './jsx'

/** A footgun finding adds `'footgun'` to the structural codegen kinds. */
export type ReactivityFindingKind = ReactivityKind | 'footgun'

export interface ReactivityFinding {
  /** Structural codegen decision, or `'footgun'` for a detected anti-pattern. */
  kind: ReactivityFindingKind
  /** 1-based line. */
  line: number
  /** 0-based column. */
  column: number
  /** 1-based end line. */
  endLine: number
  /** 0-based end column. */
  endColumn: number
  /** Editor-facing one-liner. For footguns, the detector's message. */
  detail: string
  /**
   * For `'footgun'` findings: the static-detector code (e.g.
   * `props-destructured`) so the editor surface can deep-link the
   * anti-pattern catalogue. Absent for structural findings.
   */
  code?: PyreonDiagnosticCode
  /** For `'footgun'` findings: whether a mechanical auto-fix is safe. */
  fixable?: boolean
}

export interface AnalyzeReactivityResult {
  /** Sorted (line, column) findings — structural facts + footguns merged. */
  findings: ReactivityFinding[]
  /**
   * Raw compiler spans (pre-merge), kept so the drift gate can assert the
   * lens kind faithfully records the codegen decision without re-deriving.
   */
  spans: ReactivitySpan[]
}

function spanToFinding(s: ReactivitySpan): ReactivityFinding {
  return {
    kind: s.kind,
    line: s.line,
    column: s.column,
    endLine: s.endLine,
    endColumn: s.endColumn,
    detail: s.detail,
  }
}

/**
 * Analyze a source file's reactivity. Pure, side-effect-free, deterministic.
 *
 * @param code      Source text (`.tsx` / `.jsx` / `.ts`).
 * @param filename  Used only for parse-mode (`tsx` vs `jsx`) detection.
 * @param options   `knownSignals` is forwarded to the compiler so
 *                   cross-module imported signals are auto-call-aware.
 *
 * @example
 * const { findings } = analyzeReactivity(
 *   `function C(){ const {x}=props; return <div>{count()}</div> }`,
 * )
 * // → footgun(props-destructured) on `{x}`, reactive on `count()`
 */
export function analyzeReactivity(
  code: string,
  filename = 'input.tsx',
  options: { knownSignals?: string[] } = {},
): AnalyzeReactivityResult {
  let spans: ReactivitySpan[] = []
  try {
    const r = transformJSX_JS(code, filename, {
      reactivityLens: true,
      ...(options.knownSignals ? { knownSignals: options.knownSignals } : {}),
    })
    spans = r.reactivityLens ?? []
  } catch {
    // Parse failure → no structural facts. Footguns may still be derivable
    // (detectPyreonPatterns uses the TS compiler API independently).
    spans = []
  }

  const findings: ReactivityFinding[] = spans.map(spanToFinding)

  let footguns: ReturnType<typeof detectPyreonPatterns> = []
  try {
    footguns = detectPyreonPatterns(code, filename)
  } catch {
    footguns = []
  }
  for (const d of footguns) {
    // detectPyreonPatterns gives 1-based line / 0-based column + `current`
    // (the offending source text). Approximate the end as same-line +
    // current length; multi-line `current` is rare and the editor only
    // needs a reasonable highlight range.
    const firstLineLen = d.current.split('\n')[0]?.length ?? d.current.length
    findings.push({
      kind: 'footgun',
      line: d.line,
      column: d.column,
      endLine: d.line,
      endColumn: d.column + firstLineLen,
      detail: d.message,
      code: d.code,
      fixable: d.fixable,
    })
  }

  findings.sort((a, b) => a.line - b.line || a.column - b.column)
  return { findings, spans }
}

const KIND_BADGE: Record<ReactivityFindingKind, string> = {
  reactive: '◆ live',
  'reactive-prop': '◆ live prop',
  'reactive-attr': '◆ live attr',
  'static-text': '○ baked once',
  'hoisted-static': '○ hoisted static',
  footgun: '⚠ footgun',
}

/**
 * Render an annotated source view for CLI / debugging — every analyzed line
 * followed by its reactivity findings. Not the production surface (that's the
 * LSP inlay hints); this is the spike's "can you see reactivity flow" probe
 * and a stable diff target for tests.
 */
export function formatReactivityLens(code: string, result: AnalyzeReactivityResult): string {
  const lines = code.split('\n')
  const byLine = new Map<number, ReactivityFinding[]>()
  for (const f of result.findings) {
    const arr = byLine.get(f.line) ?? []
    arr.push(f)
    byLine.set(f.line, arr)
  }
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    out.push(`${String(lineNo).padStart(4)} | ${lines[i]}`)
    const fs = byLine.get(lineNo)
    if (fs) {
      for (const f of fs) {
        const pad = ' '.repeat(7 + f.column)
        const tag = f.code ? ` [${f.code}]` : ''
        out.push(`${pad}^ ${KIND_BADGE[f.kind]}${tag} — ${f.detail}`)
      }
    }
  }
  return out.join('\n')
}
