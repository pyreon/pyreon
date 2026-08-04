/**
 * `validateUsage` — check a proposed component usage against the DERIVED
 * contract, before it is written.
 *
 * ── Why this is the point of the whole catalog ────────────────────────────
 *
 * Atlas already knows that `Button`'s `state` accepts exactly `primary`,
 * `secondary` or `danger`. Until now that knowledge could only be READ — an
 * agent (or a person) had to consume the guide and get it right. Reading is not
 * checking, and the single most common failure when an AI writes UI code is a
 * plausible prop value that does not exist: `state="primry"`, `size="medium"`,
 * `variant="ghost"`. Every one of those typechecks in a JS file, renders
 * without throwing, and silently does nothing.
 *
 * This turns the catalog from a document into a guardrail. The knowledge is
 * already derived and already verified; the only thing missing was an
 * answer to "is this right?".
 *
 * ── Suggestions, not just rejections ──────────────────────────────────────
 *
 * A finding names the nearest legal value when there is one. `state="primry"` →
 * "did you mean `primary`?" is a fix; "invalid value" is homework. The distance
 * function is deliberately cheap (edit distance over short identifiers) because
 * the alternative is offering no suggestion at all.
 */
import type { ComponentIntelligence, PropControl } from './types'

/** What is wrong with one prop of a proposed usage. */
export interface UsageFinding {
  /** The prop this is about. */
  prop: string
  /** What kind of problem — so a caller can filter or colour by severity. */
  kind: 'unknown-prop' | 'invalid-value' | 'missing-required' | 'wrong-type'
  /** Human/agent-readable, and actionable. */
  message: string
  /** The nearest legal value or prop name, when one is close enough to suggest. */
  suggestion?: string
}

export interface UsageResult {
  /** True when nothing is wrong. */
  ok: boolean
  findings: readonly UsageFinding[]
}

/**
 * Levenshtein distance, bounded.
 *
 * Bounded because the input is a prop name or a literal value — short strings —
 * and an unbounded implementation over attacker-supplied text is a quadratic
 * hazard for no benefit. Anything past the cap is "not close", which is the
 * only answer the caller needs.
 */
export function editDistance(a: string, b: string, cap = 8): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[b.length] ?? cap + 1
}

/**
 * The closest candidate, when one is close ENOUGH.
 *
 * The threshold scales with length so `sm`/`lg` are not "suggestions" for each
 * other (two characters, one edit apart, and genuinely different values) while
 * `primry`/`primary` is. A wrong suggestion is worse than none: it sends the
 * reader to change something that was not the problem.
 */
export function nearest(value: string, candidates: readonly string[]): string | undefined {
  if (candidates.length === 0) return undefined
  const lower = value.toLowerCase()
  let best: { candidate: string; distance: number } | undefined
  for (const candidate of candidates) {
    const distance = editDistance(lower, candidate.toLowerCase())
    if (!best || distance < best.distance) best = { candidate, distance }
  }
  if (!best) return undefined
  // At most a third of the value's length, and never more than 3 edits.
  const threshold = Math.min(3, Math.max(1, Math.floor(value.length / 3)))
  return best.distance <= threshold ? best.candidate : undefined
}

/** Does this value satisfy the control's declared type? */
function typeMismatch(control: PropControl, value: unknown): string | undefined {
  switch (control.kind) {
    case 'boolean':
      return typeof value === 'boolean' ? undefined : 'boolean'
    case 'number':
      return typeof value === 'number' ? undefined : 'number'
    case 'text':
    case 'color':
      return typeof value === 'string' ? undefined : 'string'
    case 'reactive':
      // An accessor or an event handler. A non-function here is the documented
      // footgun: the runtime warns on every render and the control does nothing.
      return typeof value === 'function' ? undefined : 'function'
    default:
      return undefined
  }
}

/**
 * Check a proposed `{ prop: value }` usage against a component's contract.
 *
 * Unknown props are reported rather than ignored, because a typo'd prop name is
 * the same silent failure as a typo'd value — the component renders, the prop
 * does nothing, and nothing says so.
 */
export function validateUsage(
  component: ComponentIntelligence,
  args: Record<string, unknown>,
): UsageResult {
  const findings: UsageFinding[] = []
  const byName = new Map(component.controls.map((c) => [c.name, c]))
  const names = component.controls.map((c) => c.name)

  for (const [prop, value] of Object.entries(args)) {
    const control = byName.get(prop)
    if (!control) {
      const suggestion = nearest(prop, names)
      findings.push({
        prop,
        kind: 'unknown-prop',
        message: `\`${prop}\` is not a prop of ${component.name}`,
        ...(suggestion ? { suggestion } : {}),
      })
      continue
    }

    // A select's options are the whole point — this is the check that catches
    // `state="primry"`, which typechecks in JS and renders silently wrong.
    if (control.kind === 'select' && control.options && control.options.length > 0) {
      if (typeof value === 'string' && !control.options.includes(value)) {
        const suggestion = nearest(value, control.options)
        findings.push({
          prop,
          kind: 'invalid-value',
          message: `\`${prop}\` must be one of ${control.options.map((o) => `\`${o}\``).join(', ')} — got \`${String(value)}\``,
          ...(suggestion ? { suggestion } : {}),
        })
      }
      continue
    }

    const expected = typeMismatch(control, value)
    if (expected) {
      findings.push({
        prop,
        kind: 'wrong-type',
        message: `\`${prop}\` expects ${expected} — got ${typeof value}`,
      })
    }
  }

  // Required props that were not supplied. Reported LAST so the findings read
  // in the order a reader works: fix what is wrong, then add what is missing.
  for (const control of component.controls) {
    if (!control.required) continue
    if (Object.hasOwn(args, control.name)) continue
    findings.push({
      prop: control.name,
      kind: 'missing-required',
      message: `\`${control.name}\` is required and was not supplied`,
    })
  }

  return { ok: findings.length === 0, findings }
}

/**
 * The findings as text — the form an agent or a CLI prints.
 *
 * Suggestions are attached inline rather than listed separately, because the
 * fix belongs next to the problem it fixes.
 */
export function formatUsage(component: string, result: UsageResult): string {
  if (result.ok) return `${component}: usage is valid.`
  const lines = [`${component}: ${result.findings.length} problem(s):`]
  for (const finding of result.findings) {
    lines.push(
      `  · ${finding.message}${finding.suggestion ? ` — did you mean \`${finding.suggestion}\`?` : ''}`,
    )
  }
  return lines.join('\n')
}
