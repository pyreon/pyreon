/**
 * `explain_error` — assemble a structured failure dossier from a Pyreon
 * error report.
 *
 * The distinctive input no other framework's tooling has: the
 * `reactiveTrace` (shipped in @pyreon/core's ErrorContext) — the causal
 * SEQUENCE of signal writes leading up to the crash. Combined with the
 * error, the failing component's source (optional), and Pyreon's own
 * static pattern detectors + anti-pattern catalogue, this produces a
 * dossier rich enough for an AI agent (the MCP consumer) to reason about
 * a *reactive* bug instead of guessing at a stack trace.
 *
 * Architecture (deliberate, matches `validate` / `diagnose`):
 *   - This module ASSEMBLES + applies cheap heuristics. It does NOT call
 *     an LLM and does NOT mutate anything. No API keys, no autonomy.
 *   - The agent driving the MCP session does the reasoning over the
 *     dossier. The human is the gate on any patch — by construction,
 *     because the tool only ever returns text.
 *
 * This is the sound core of "AI-native self-healing": self-EXPLAINING,
 * human-gated, built on already-shipped substrate. The rejected part
 * (autonomous in-production repair) is structurally impossible here —
 * the tool has no write capability.
 */

import { detectPyreonPatterns, detectReactPatterns } from '@pyreon/compiler'
import { type AntiPatternEntry } from './anti-patterns'

/**
 * One recorded signal write, as it arrives serialized in the report.
 * Structural (duck-typed) — we parse untrusted JSON, so we validate the
 * shape rather than import the `ReactiveTraceEntry` type from
 * `@pyreon/core` (which would also add an unwanted mcp→core dep edge).
 */
export interface TraceEntry {
  name?: string | null
  prev: string
  next: string
  timestamp: number
}

/** Loosely-shaped error report — mirrors `@pyreon/core`'s `ErrorContext` but tolerant of partial / hand-built input. */
export interface ErrorReport {
  error: string | { message?: string; name?: string; stack?: string }
  phase?: string
  /** Component function name (not source). */
  component?: string
  props?: Record<string, unknown>
  reactiveTrace?: TraceEntry[]
}

export type Confidence = 'low' | 'medium' | 'high'

export interface ReactiveFinding {
  code:
    | 'empty-trace'
    | 'nullish-then-crash'
    | 'write-storm'
    | 'last-write-correlation'
    | 'type-flip'
  confidence: Confidence
  /** Human-readable explanation of what the heuristic saw. */
  detail: string
  /** Anti-pattern detector codes this finding correlates with (for catalogue lookup). */
  relatedDetectors: string[]
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Safe parse of the serialized report. Never throws — a malformed
 * report yields `null` so the tool can return an actionable message
 * instead of a stack trace.
 */
export function parseErrorReport(raw: string): ErrorReport | null {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (obj === null || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  if (o.error === undefined) return null
  const report: ErrorReport = {
    error:
      typeof o.error === 'string'
        ? o.error
        : (o.error as { message?: string; name?: string; stack?: string }),
  }
  if (typeof o.phase === 'string') report.phase = o.phase
  if (typeof o.component === 'string') report.component = o.component
  if (o.props && typeof o.props === 'object')
    report.props = o.props as Record<string, unknown>
  if (Array.isArray(o.reactiveTrace)) {
    report.reactiveTrace = o.reactiveTrace.filter(
      (e): e is TraceEntry =>
        e != null &&
        typeof e === 'object' &&
        typeof (e as TraceEntry).prev === 'string' &&
        typeof (e as TraceEntry).next === 'string',
    )
  }
  return report
}

/** Normalise the error to a single message string for substring correlation. */
export function errorMessage(report: ErrorReport): string {
  if (typeof report.error === 'string') return report.error
  return report.error.message ?? report.error.name ?? ''
}

// ── Reactive-trace heuristics ────────────────────────────────────────────────

const NULLISH = new Set(['null', 'undefined'])
/** Same-signal write count above which we suspect a render/effect loop. */
const WRITE_STORM_THRESHOLD = 8

/**
 * Cheap, conservative heuristics over the write sequence. These are
 * *suspicions*, not verdicts — every finding carries a confidence and
 * the raw trace is always shown alongside so the agent / human can
 * override. The goal is to point at the likely region, not to be right
 * every time.
 */
export function analyzeReactiveTrace(
  trace: TraceEntry[] | undefined,
  message: string,
): ReactiveFinding[] {
  const findings: ReactiveFinding[] = []

  if (!trace || trace.length === 0) {
    findings.push({
      code: 'empty-trace',
      confidence: 'high',
      detail:
        'No signal writes were recorded before the crash. This strongly suggests the failure is in setup / first render / a non-reactive code path — NOT state-driven. Do not chase a reactive bug; inspect the component body, props, and imports at mount time.',
      relatedDetectors: [],
    })
    return findings
  }

  const lower = message.toLowerCase()
  const last = trace[trace.length - 1]!

  // 1. The most recent write's signal name appears in the error message —
  //    the change that likely tipped the app into the failing state.
  if (last.name && lower.includes(last.name.toLowerCase())) {
    findings.push({
      code: 'last-write-correlation',
      confidence: 'high',
      detail: `The last recorded write was to "${last.name}" (${last.prev} → ${last.next}), and "${last.name}" appears in the error message. This is very likely the write that produced the crashing state.`,
      relatedDetectors: ['signal-write-as-call'],
    })
  }

  // 2. A signal was set to null/undefined and its name is in the message
  //    — classic read-of-nullish after a clear/reset.
  for (const e of trace) {
    if (e.name && NULLISH.has(e.next.trim()) && lower.includes(e.name.toLowerCase())) {
      findings.push({
        code: 'nullish-then-crash',
        confidence: 'medium',
        detail: `"${e.name}" was set to ${e.next} (from ${e.prev}) and appears in the error message. Suspect a read of "${e.name}" that assumes it is non-nullish — guard the access, or ensure the consumer re-checks after the reset.`,
        relatedDetectors: ['static-return-null-conditional', 'on-click-undefined'],
      })
      break
    }
  }

  // 3. Write storm — the same signal written many times in the ~50-entry
  //    window. Often a render-phase write or an effect feeding itself.
  const counts = new Map<string, number>()
  for (const e of trace) {
    const k = e.name ?? '(anonymous)'
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  for (const [name, n] of counts) {
    if (n >= WRITE_STORM_THRESHOLD) {
      findings.push({
        code: 'write-storm',
        confidence: n >= WRITE_STORM_THRESHOLD * 2 ? 'high' : 'medium',
        detail: `"${name}" was written ${n} times within the recorded window. A signal written this often right before a crash often means a write during render, an effect that writes a signal it also reads, or an unbatched update loop. Check for \`signal.set\` in a component body / computed, or an \`effect\` whose body writes its own dependency.`,
        relatedDetectors: ['no-imperative-effect-on-create'],
      })
    }
  }

  // 4. Type-flip — a signal whose value SHAPE changed (e.g. Array → null,
  //    string → object) in the run-up. Common cause of "x.map is not a
  //    function" / "cannot read property of …".
  for (const e of trace) {
    const prevShape = shapeOf(e.prev)
    const nextShape = shapeOf(e.next)
    if (prevShape !== 'unknown' && nextShape !== 'unknown' && prevShape !== nextShape) {
      findings.push({
        code: 'type-flip',
        confidence: 'low',
        detail: `"${e.name ?? '(anonymous)'}" changed value shape (${prevShape} → ${nextShape}: ${e.prev} → ${e.next}). If a consumer assumed the old shape (\`.map\`, \`.length\`, property access), this is a likely crash source.`,
        relatedDetectors: [],
      })
      break
    }
  }

  return findings
}

/** Coarse shape classifier over a trace preview string (the previews are produced by reactive-trace.ts). */
function shapeOf(preview: string): 'array' | 'object' | 'string' | 'nullish' | 'scalar' | 'unknown' {
  const p = preview.trim()
  if (NULLISH.has(p)) return 'nullish'
  if (p.startsWith('Array(')) return 'array'
  if (p.startsWith('{') || /^[A-Z][\w$]* \{/.test(p)) return 'object'
  if (p.startsWith('"')) return 'string'
  if (p === 'true' || p === 'false' || /^-?\d/.test(p)) return 'scalar'
  return 'unknown'
}

// ── Dossier assembly ─────────────────────────────────────────────────────────

export interface DossierOptions {
  /** Optional raw source of the failing component — enables static detection. */
  componentSource?: string
  /** Parsed anti-pattern catalogue (from the consumer; mcp/index.ts owns file loading). */
  antiPatterns?: AntiPatternEntry[]
}

function formatTrace(trace: TraceEntry[]): string {
  return trace
    .map((e, i) => `  ${i + 1}. ${e.name ?? '(anonymous)'}: ${e.prev} → ${e.next}`)
    .join('\n')
}

/**
 * Builds the markdown dossier. Pure (no IO) — the caller injects the
 * anti-pattern catalogue + optional component source. Returns the text
 * the MCP tool hands back; the consuming agent reasons over it.
 */
export function buildErrorDossier(report: ErrorReport, opts: DossierOptions = {}): string {
  const msg = errorMessage(report)
  const errName =
    typeof report.error === 'object' ? (report.error.name ?? 'Error') : 'Error'
  const sections: string[] = []

  // 1. Error summary
  const summaryBits = [
    `**Error:** ${errName}: ${msg || '(no message)'}`,
    report.phase ? `**Phase:** ${report.phase}` : '',
    report.component ? `**Component:** ${report.component}` : '',
  ].filter(Boolean)
  sections.push(`## Failure summary\n\n${summaryBits.join('\n')}`)
  if (typeof report.error === 'object' && report.error.stack) {
    sections.push(
      `### Stack\n\n\`\`\`\n${report.error.stack.split('\n').slice(0, 12).join('\n')}\n\`\`\``,
    )
  }

  // 2. Reactive narrative + heuristic findings — the distinctive part.
  const findings = analyzeReactiveTrace(report.reactiveTrace, msg)
  if (report.reactiveTrace && report.reactiveTrace.length > 0) {
    sections.push(
      `## Reactive run-up (${report.reactiveTrace.length} write${report.reactiveTrace.length === 1 ? '' : 's'}, oldest → newest)\n\n${formatTrace(report.reactiveTrace)}`,
    )
  }
  const findingText = findings
    .map(
      (f) =>
        `- **${f.code}** (confidence: ${f.confidence})\n  ${f.detail}`,
    )
    .join('\n')
  sections.push(`## Suspected cause (heuristic — verify, do not assume)\n\n${findingText}`)

  // 3. Static analysis of the failing component (optional)
  if (opts.componentSource) {
    const fname = `${report.component ?? 'component'}.tsx`
    const diags = [
      ...detectReactPatterns(opts.componentSource, fname),
      ...detectPyreonPatterns(opts.componentSource, fname),
    ].sort((a, b) => a.line - b.line)
    if (diags.length > 0) {
      sections.push(
        `## Static issues in the component source (${diags.length})\n\n${diags
          .map(
            (d) =>
              `- **${d.code}** (line ${d.line}): ${d.message}\n  Fix: \`${d.suggested}\``,
          )
          .join('\n')}`,
      )
    } else {
      sections.push(
        `## Static analysis\n\nNo Pyreon/React anti-patterns detected in the supplied component source. The bug is likely logic-level or data-shape, not a known footgun — focus on the reactive run-up above.`,
      )
    }
  }

  // 4. Correlated anti-pattern catalogue entries
  if (opts.antiPatterns && opts.antiPatterns.length > 0) {
    const wanted = new Set<string>()
    for (const f of findings) for (const d of f.relatedDetectors) wanted.add(d)
    const matched = opts.antiPatterns.filter((ap) =>
      ap.detectorCodes.some((c) => wanted.has(c)),
    )
    if (matched.length > 0) {
      sections.push(
        `## Related anti-patterns from the catalogue\n\n${matched
          .map((ap) => `### ${ap.name} (${ap.categoryHeading})\n${ap.description}`)
          .join('\n\n')}`,
      )
    }
  }

  // 5. Investigation guidance — framed as direction, never an applied fix.
  sections.push(
    `## How to use this\n\nThis dossier is structured context, not a verdict. Reason over the reactive run-up + static issues to form a root-cause hypothesis, propose a patch, and have a human review it before applying. The reactive sequence is the highest-signal input — it shows *how* the app reached the failing state, which the stack trace alone cannot.`,
  )

  return sections.join('\n\n')
}
