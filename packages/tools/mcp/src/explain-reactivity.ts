/**
 * `explain_reactivity` — the compiler's per-expression reactivity verdict,
 * rendered for an AI agent.
 *
 * The Pyreon compiler ALREADY decides, per JSX expression, whether code is
 * reactive while emitting codegen. `analyzeReactivity` surfaces that ground
 * truth: every expression classified **live** / **baked-static** / **hoisted**,
 * merged with the `detectPyreonPatterns` footguns. Feeding this map to an agent
 * BEFORE it commits means it sees the compiler's decision — it cannot ship a
 * stale-closure / destructured-props / static-when-meant-reactive bug without
 * the map showing it. `validate` reports bugs; this reports the whole map.
 *
 * Pure + deterministic — the tool handler in `index.ts` is a thin wrapper.
 */

import { analyzeReactivity, formatReactivityLens } from '@pyreon/compiler'

export interface ReactivityExplanation {
  /** The rendered, agent-facing text block. */
  text: string
  /** Live expression count (reactive / reactive-prop / reactive-attr). */
  live: number
  /** Baked-static count (static-text / hoisted-static). */
  staticCount: number
  /** Footgun count. */
  footguns: number
}

/**
 * Analyze a snippet's reactivity and render the explanation an agent reads.
 *
 * @param code       Source text (`.tsx` / `.jsx` / `.ts`).
 * @param filename   Parse-mode hint (`tsx` vs `jsx`); default `snippet.tsx`.
 * @param knownSignals  Cross-module imported signal names for auto-call awareness.
 */
export function explainReactivity(
  code: string,
  filename = 'snippet.tsx',
  knownSignals?: string[],
): ReactivityExplanation {
  const result = analyzeReactivity(code, filename, knownSignals ? { knownSignals } : {})
  const { findings } = result

  let live = 0
  let staticCount = 0
  const footguns = findings.filter((f) => f.kind === 'footgun')
  for (const f of findings) {
    if (f.kind === 'reactive' || f.kind === 'reactive-prop' || f.kind === 'reactive-attr') live++
    else if (f.kind === 'static-text' || f.kind === 'hoisted-static') staticCount++
  }

  if (findings.length === 0) {
    return {
      text: 'No reactive expressions detected. Either the snippet has no JSX with dynamic expressions, or it failed to parse. This tool analyzes `.tsx` / `.jsx` reactivity — pass a component with JSX bindings.',
      live: 0,
      staticCount: 0,
      footguns: 0,
    }
  }

  const summary =
    `Reactivity map for ${filename} — ` +
    `${live} live · ${staticCount} baked-static · ${footguns.length} footgun${
      footguns.length === 1 ? '' : 's'
    }`

  const parts: string[] = [summary, '', '```', formatReactivityLens(code, result), '```']

  if (footguns.length > 0) {
    const fixable = footguns.filter((f) => f.fixable).length
    parts.push(
      '',
      `⚠ ${footguns.length} footgun${footguns.length === 1 ? '' : 's'}` +
        (fixable > 0 ? ` (${fixable} auto-fixable)` : '') +
        ':',
    )
    for (const f of footguns) {
      parts.push(`  • ${f.code ?? 'footgun'} (line ${f.line}): ${f.detail}`)
    }
  }

  if (staticCount > 0) {
    parts.push(
      '',
      `Note: ${staticCount} expression${staticCount === 1 ? ' is' : 's are'} baked STATIC ` +
        '(rendered once, never updated). If any was meant to update reactively, read a ' +
        'signal by CALLING it (`count()`), read `props.x` directly instead of destructuring, ' +
        'and keep dynamic values inside the JSX expression rather than a captured `const`.',
    )
  }

  return { text: parts.join('\n'), live, staticCount, footguns: footguns.length }
}
