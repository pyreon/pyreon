/**
 * diagnose v2 — structured-context enrichment for the `diagnose` MCP tool.
 *
 * The original `diagnose` took only an error STRING and matched it against
 * a fixed regex table (`diagnoseError`). That's the "known error message →
 * canned fix" tier. It can't reason about *why* the app reached the bad
 * state because it never sees the reactive run-up or the component source.
 *
 * v2 keeps that path 100% backward-compatible (string-only call → byte-
 * identical output) and ADDS optional structured context:
 *
 *   - `componentSource` → run `detectPyreonPatterns`, then map each hit's
 *     detector code to the anti-pattern catalog entry that documents it
 *     (`AntiPatternEntry.detectorCodes` is the bridge).
 *   - `reactiveTrace`   → the causal sequence of signal writes leading to
 *     the crash (from `@pyreon/core`'s `ErrorContext.reactiveTrace`,
 *     shipped in #598). Formatted as a chronological run-up.
 *
 * Architectural choice: this module does NOT call an LLM. An MCP tool's
 * job is to assemble the richest possible STRUCTURED failure context; the
 * agent calling the tool does the reasoning. That removes model/prompt
 * risk from the framework entirely and keeps the tool deterministic +
 * unit-testable. `enrichDiagnosis` is a pure function — the tool handler
 * injects the parsed anti-patterns + the detector so this stays free of
 * filesystem / server concerns.
 */

import type { PyreonDiagnostic } from '@pyreon/compiler'
import type { AntiPatternEntry } from './anti-patterns'

/**
 * Structural mirror of `@pyreon/core`'s `ReactiveTraceEntry` (also
 * exported from `@pyreon/reactivity`). Defined locally rather than
 * adding a `@pyreon/core` runtime dependency to this tooling package
 * for a 4-field shape that arrives as JSON-RPC input anyway. Keep in
 * sync with `packages/core/reactivity/src/reactive-trace.ts`.
 *
 * `name` is an OPTIONAL KEY here (`name?: string`), not the canonical
 * required-key-undefined-value (`name: string | undefined`). Deliberate:
 * the value crosses the wire as zod `z.string().optional()`, which
 * infers an optional key, and under `exactOptionalPropertyTypes` a
 * required-key target rejects an optional-key source. The optional-key
 * form accepts both the zod input and an explicit-`undefined` from the
 * core type, so it's the correct boundary shape.
 */
export interface ReactiveTraceEntry {
  name?: string | undefined
  prev: string
  next: string
  timestamp: number
}

/** Backward-compatible regex-table diagnosis (the original `diagnoseError` shape). */
export interface PatternDiagnosis {
  cause: string
  fix: string
  fixCode?: string | undefined
  related?: string | undefined
}

export interface DiagnoseInput {
  /** Required. The error message / stack. Unchanged from v1. */
  error: string
  // Optional fields use `?: T | undefined` (optional key AND undefined in
  // the value union), not `?: T`. The tool handler builds this object
  // from zod `.optional()` params, which infer `T | undefined`; under
  // `exactOptionalPropertyTypes` a `?: T` target rejects an explicit
  // `undefined`. This shape is the correct boundary for zod-fed input.
  /** Optional. Component source — enables the static-detector enrichment. */
  componentSource?: string | undefined
  /** Optional filename for the detector (affects a few path-sensitive rules). */
  filename?: string | undefined
  /** Optional. The reactive write sequence leading to the error (#598). */
  reactiveTrace?: ReactiveTraceEntry[] | undefined
  /** Optional. Lifecycle phase the error occurred in. */
  phase?: string | undefined
}

export interface EnrichedDiagnosis {
  /** Regex-table diagnosis (backward compat). `null` when no pattern matched. */
  patternDiagnosis: PatternDiagnosis | null
  /** `detectPyreonPatterns` hits on `componentSource`. Empty when no source given. */
  detectorHits: PyreonDiagnostic[]
  /** Anti-pattern catalog entries whose `detectorCodes` intersect the detector hits. */
  relatedAntiPatterns: AntiPatternEntry[]
  /** Formatted chronological reactive run-up, or `null` when no trace given. */
  reactiveNarrative: string | null
  /**
   * `'string-only'` when no structured context was supplied — the caller
   * gets exactly the v1 behaviour. `'enriched'` when at least one of
   * componentSource / reactiveTrace was provided.
   */
  contextLevel: 'string-only' | 'enriched'
}

/** Dependencies the tool handler injects (keeps this module pure + testable). */
export interface EnrichDeps {
  /** `diagnoseError` from `@pyreon/compiler` — the v1 regex table. */
  diagnoseError: (error: string) => PatternDiagnosis | null
  /** `detectPyreonPatterns` from `@pyreon/compiler`. */
  detectPyreonPatterns: (code: string, filename?: string) => PyreonDiagnostic[]
  /** Parsed anti-pattern catalog (from `parseAntiPatterns(loadAntiPatternsDoc())`), or `[]` when unreachable. */
  antiPatterns: AntiPatternEntry[]
}

/**
 * Format the reactive trace as a chronological run-up. Bounded — the
 * buffer is already capped at ~50 by `@pyreon/reactivity`, but a hostile
 * / oversized client could pass more, so we cap defensively and note the
 * truncation.
 */
function formatReactiveNarrative(trace: ReactiveTraceEntry[]): string | null {
  if (trace.length === 0) return null
  const MAX = 50
  const shown = trace.slice(-MAX)
  const omitted = trace.length - shown.length
  const lines = shown.map((e, i) => {
    const idx = String(i + 1 + omitted).padStart(2, ' ')
    const label = e.name ?? '(anonymous signal)'
    return `  ${idx}. ${label}: ${e.prev} → ${e.next}`
  })
  const head =
    omitted > 0
      ? `Reactive run-up (last ${shown.length} of ${trace.length} signal writes; ${omitted} older omitted):`
      : `Reactive run-up (${shown.length} signal write${shown.length === 1 ? '' : 's'}, oldest → newest):`
  return `${head}\n${lines.join('\n')}`
}

/**
 * Pure enrichment. Backward-compatible: when only `error` is supplied,
 * `detectorHits` / `relatedAntiPatterns` are empty, `reactiveNarrative`
 * is null, and `contextLevel` is `'string-only'` — the tool handler then
 * renders exactly the v1 output.
 */
export function enrichDiagnosis(input: DiagnoseInput, deps: EnrichDeps): EnrichedDiagnosis {
  const patternDiagnosis = deps.diagnoseError(input.error)

  let detectorHits: PyreonDiagnostic[] = []
  let relatedAntiPatterns: AntiPatternEntry[] = []
  if (input.componentSource && input.componentSource.trim().length > 0) {
    detectorHits = deps.detectPyreonPatterns(
      input.componentSource,
      input.filename ?? 'component.tsx',
    )
    if (detectorHits.length > 0) {
      const hitCodes = new Set(detectorHits.map((d) => d.code as string))
      // `AntiPatternEntry.detectorCodes` lists the detector codes a
      // catalog entry documents — the bridge from a static hit to its
      // prose explanation + fix rationale. Dedupe by entry name (an
      // entry can list multiple codes; multiple hits can point to one).
      const seen = new Set<string>()
      for (const entry of deps.antiPatterns) {
        if (entry.detectorCodes.some((c) => hitCodes.has(c)) && !seen.has(entry.name)) {
          seen.add(entry.name)
          relatedAntiPatterns.push(entry)
        }
      }
    }
  }

  const reactiveNarrative = input.reactiveTrace
    ? formatReactiveNarrative(input.reactiveTrace)
    : null

  const hasStructuredContext =
    (input.componentSource != null && input.componentSource.trim().length > 0) ||
    (input.reactiveTrace != null && input.reactiveTrace.length > 0)

  return {
    patternDiagnosis,
    detectorHits,
    relatedAntiPatterns,
    reactiveNarrative,
    contextLevel: hasStructuredContext ? 'enriched' : 'string-only',
  }
}

/**
 * Render the enriched diagnosis to the MCP text payload.
 *
 * **Backward-compat contract:** when `contextLevel === 'string-only'`
 * the output is byte-identical to the v1 `diagnose` tool — the
 * "Could not identify…" block when no pattern matched, or the
 * `**Cause:** / **Fix:** / **Code:** / **Related:**` block when it did.
 * The enrichment sections are only appended when structured context was
 * supplied, so existing string-only callers see no change.
 */
export function formatEnrichedDiagnosis(input: DiagnoseInput, r: EnrichedDiagnosis): string {
  // ── v1 base block (unchanged) ──────────────────────────────────────
  let base: string
  if (!r.patternDiagnosis) {
    base = `Could not identify a Pyreon-specific pattern in this error.\n\nError: ${input.error}\n\nSuggestions:\n- Check for typos in variable/function names\n- Verify all imports are correct\n- Run \`bun run typecheck\` for full TypeScript diagnostics\n- Run \`pyreon doctor\` for project-wide health check`
  } else {
    base = `**Cause:** ${r.patternDiagnosis.cause}\n\n**Fix:** ${r.patternDiagnosis.fix}`
    if (r.patternDiagnosis.fixCode) {
      base += `\n\n**Code:**\n\`\`\`typescript\n${r.patternDiagnosis.fixCode}\n\`\`\``
    }
    if (r.patternDiagnosis.related) {
      base += `\n\n**Related:** ${r.patternDiagnosis.related}`
    }
  }

  if (r.contextLevel === 'string-only') return base

  // ── v2 enrichment sections (only when structured context supplied) ──
  const sections: string[] = [base]

  if (r.reactiveNarrative) {
    sections.push(
      `---\n\n### ${r.reactiveNarrative.split('\n')[0]}\n\n\`\`\`\n${r.reactiveNarrative.split('\n').slice(1).join('\n')}\n\`\`\``,
    )
  }

  if (r.detectorHits.length > 0) {
    const hits = r.detectorHits
      .slice()
      .sort((a, b) => a.line - b.line || a.column - b.column)
      .map(
        (d, i) =>
          `${i + 1}. **${d.code}** (line ${d.line})\n   ${d.message}\n   Current: \`${d.current}\`\n   Fix: \`${d.suggested}\`\n   Auto-fixable: ${d.fixable ? 'yes' : 'no'}`,
      )
      .join('\n\n')
    sections.push(
      `---\n\n### Static detector findings in the component (${r.detectorHits.length})\n\n${hits}`,
    )
  }

  if (r.relatedAntiPatterns.length > 0) {
    const pats = r.relatedAntiPatterns
      .map((e) => `- **${e.name}** (${e.categoryHeading}) — ${e.description.split('\n')[0]}`)
      .join('\n')
    sections.push(
      `---\n\n### Documented anti-patterns matching the detector hits\n\n${pats}\n\nRead the full entries via the \`get_anti_patterns\` tool.`,
    )
  }

  if (r.detectorHits.length === 0 && !r.reactiveNarrative) {
    sections.push(
      `---\n\n_Structured context was supplied but produced no additional findings: the component triggered no static detectors and the reactive trace was empty. The base diagnosis above is the best available._`,
    )
  }

  return sections.join('\n\n')
}
