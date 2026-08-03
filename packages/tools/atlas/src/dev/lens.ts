/**
 * The Reactivity Lens, node side.
 *
 * The compiler already decides, per expression, whether a JSX read is LIVE
 * (re-runs when a signal changes) or STATIC (captured once). `analyzeReactivity`
 * exposes that decision with precise spans. Showing it back to the author is
 * the leapfrog: **`static` where the author expected `live` is the single most
 * common Pyreon bug** — the UI that silently never updates — and it is
 * ordinarily found at runtime, in a browser, by noticing nothing happened.
 *
 * Storybook cannot do this. There is no compiler verdict to show, because
 * nothing in React decides per-expression whether a read is reactive.
 *
 * This half runs in NODE and reaches the browser over the `atlas dev` RPC
 * channel, because `analyzeReactivity` pulls in the TypeScript compiler API and
 * oxc — neither of which can run in a page. That is precisely why M1 defined
 * the channel before the first panel needed it.
 */
import { readFileSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'
import { ambiguousComponentMessage, type ComponentIntelligence, resolveComponent } from '../core'
import type { RpcMethod } from './plugin'

/** One line of source, with whatever the compiler said about it. */
export interface LensLine {
  /** 1-based. */
  line: number
  text: string
  findings: LensFinding[]
}

export interface LensFinding {
  kind: string
  detail: string
  column: number
  /** `true` for the verdicts worth acting on — see `isSuspect`. */
  suspect: boolean
  /** the static-detector code, for footguns */
  code?: string
}

/**
 * Which verdicts deserve attention.
 *
 * The compiler's vocabulary (`ReactivityKind` in `compiler/src/jsx.ts`) is
 * `reactive` · `reactive-prop` · `reactive-attr` · `static-text` ·
 * `hoisted-static`, plus `footgun` for a detector hit. Verified against the real
 * analyzer — an earlier cut of this file guessed `live`/`static` and matched
 * nothing, which would have rendered every component as having no findings.
 *
 * The `reactive*` kinds are the expected case and need no highlight; flagging
 * them would bury the signal. `static-text` is the one that silently breaks a
 * UI — an expression baked once that never re-renders — and `footgun` is a
 * named anti-pattern. `hoisted-static` is deliberately NOT suspect: hoisting is
 * an optimisation applied to JSX with nothing dynamic in it.
 */
export function isSuspect(kind: string): boolean {
  return kind === 'static-text' || kind === 'footgun'
}

export interface LensResult {
  path: string
  lines: LensLine[]
  /** Counts by kind, so the panel can lead with a summary. */
  totals: Record<string, number>
  /** How many findings are worth acting on. */
  suspects: number
}

/**
 * Merge findings onto their source lines.
 *
 * Pure and exported so the interesting behaviour — a finding landing on the
 * right line, a finding past the end of the file being dropped rather than
 * crashing — is testable without a compiler or a server.
 */
export function toLensLines(
  source: string,
  findings: readonly { kind: string; line: number; column: number; detail: string; code?: string }[],
): LensLine[] {
  const text = source.split('\n')
  const lines: LensLine[] = text.map((t, i) => ({ line: i + 1, text: t, findings: [] }))
  for (const f of findings) {
    const target = lines[f.line - 1]
    // A finding pointing past the end of the file means the analyzed source and
    // the read source disagree (an edit between the two). Dropping it is right —
    // rendering it against the wrong line would be a confident lie.
    if (!target) continue
    target.findings.push({
      kind: f.kind,
      detail: f.detail,
      column: f.column,
      suspect: isSuspect(f.kind),
      ...(f.code !== undefined ? { code: f.code } : {}),
    })
  }
  return lines
}

export function summarize(lines: readonly LensLine[]): {
  totals: Record<string, number>
  suspects: number
} {
  const totals: Record<string, number> = {}
  let suspects = 0
  for (const line of lines) {
    for (const f of line.findings) {
      totals[f.kind] = (totals[f.kind] ?? 0) + 1
      if (f.suspect) suspects += 1
    }
  }
  return { totals, suspects }
}

export interface LensContext {
  root: string
  components: readonly ComponentIntelligence[]
}

/**
 * The `lens` RPC method: `{ component }` → source lines annotated with the
 * compiler's own per-expression verdict.
 *
 * `@pyreon/compiler` is imported LAZILY. It drags in the TypeScript compiler
 * API, and paying that on every `atlas dev` boot — including for users who
 * never open this panel — would be a measurable startup cost for a feature
 * behind a tab.
 */
export function lensMethod(ctx: LensContext): RpcMethod {
  return async (params) => {
    const name = String(params.component ?? '')
    // By KEY or unambiguous NAME — same reasoning as the `source` method: in a
    // monorepo, analysing the wrong `Button` reports verdicts for source the
    // reader is not looking at, which is worse than refusing.
    const match = resolveComponent(ctx.components, name)
    if (!match.found && match.ambiguous.length > 0) {
      throw new Error(ambiguousComponentMessage(name, match.ambiguous))
    }
    const found = match.found
    if (!found?.source) {
      throw new Error(`[Pyreon] atlas dev: no source on record for component "${name}"`)
    }

    const abs = isAbsolute(found.source) ? found.source : resolve(ctx.root, found.source)
    // Separator included — a bare prefix admits a sibling dir (`/proj-evil`
    // passes for root `/proj`).
    if (abs !== ctx.root && !abs.startsWith(ctx.root + sep)) {
      throw new Error('[Pyreon] atlas dev: refusing to read outside the project root')
    }

    const source = readFileSync(abs, 'utf8')

    let analyze: (code: string, filename?: string) => { findings: readonly unknown[] }
    try {
      const mod = (await import('@pyreon/compiler')) as unknown as {
        analyzeReactivity: typeof analyze
      }
      analyze = mod.analyzeReactivity
    } catch {
      // The compiler is a build-tool dependency a consuming project may not
      // declare. Say so plainly — the panel renders this as its unavailable
      // state rather than an empty verdict, which would read as "nothing is
      // static here" and be exactly backwards.
      throw new Error(
        '[Pyreon] atlas dev: the Reactivity Lens needs @pyreon/compiler.\n' +
          '  bun add -d @pyreon/compiler',
      )
    }

    const result = analyze(source, abs)
    const lines = toLensLines(
      source,
      result.findings as { kind: string; line: number; column: number; detail: string }[],
    )
    return { path: abs, lines, ...summarize(lines) } satisfies LensResult
  }
}
