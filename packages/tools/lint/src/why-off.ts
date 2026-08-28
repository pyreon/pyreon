import { allRules } from './rules/index'
import type { LintConfig, RuleOptions, Severity } from './types'
import { isProjectDependency } from './utils/project-deps'
import { isNear } from './utils/unknown-config'

/**
 * Answering "why isn't this rule firing?".
 *
 * A rule can be silently inert for four independent reasons, three of which
 * are invisible in config:
 *
 *   1. its severity is `off` (visible — the config says so)
 *   2. `meta.optIn` — a best-practice rule the user must ask for
 *   3. `meta.scope: 'monorepo'` — a rule about the Pyreon repo, not the framework
 *   4. `meta.requiresDependency` — the project doesn't use the library it covers
 *
 * They compose, so a rule is often off for two reasons at once and fixing one
 * changes nothing. Before this, the only way to find out was to read the rule
 * source. `pyreon-lint --why-off <rule>` reports every reason that applies,
 * each with the specific edit that lifts it.
 */

export interface OffReason {
  /** Stable, greppable class — branch on this, not on `detail`. */
  code:
    | 'unknown-rule'
    | 'severity-off'
    | 'opt-in'
    | 'monorepo-scope'
    | 'dependency-missing'
  detail: string
  /** The one edit that lifts THIS reason. */
  fix: string
}

export interface RuleState {
  ruleId: string
  found: boolean
  /** Close matches, when the id was not found. */
  suggestions: string[]
  /** Resolved severity from the config, or `null` for an unknown rule. */
  severity: Severity | null
  /** True only when nothing at all is suppressing the rule. */
  willRun: boolean
  reasons: OffReason[]
  /** Configured `exemptPaths`, if any — reported, never evaluated here. */
  exemptPaths: string[]
}

function severityOf(entry: LintConfig['rules'][string] | undefined): Severity | undefined {
  if (entry === undefined) return undefined
  return Array.isArray(entry) ? (entry[0] as Severity) : (entry as Severity)
}

function optionsOf(entry: LintConfig['rules'][string] | undefined): RuleOptions {
  return Array.isArray(entry) ? ((entry[1] ?? {}) as RuleOptions) : {}
}

/** Levenshtein-ish closeness, enough for a did-you-mean over ~100 ids. */

/**
 * Explain whether `ruleId` will run, and if not, every reason why.
 *
 * Pure apart from `isProjectDependency`, which reads the nearest
 * `package.json` — pass `filePath` to make that check meaningful.
 */
export function explainRuleState(
  ruleId: string,
  opts: { config: LintConfig; filePath?: string | undefined },
): RuleState {
  const normalized = ruleId.startsWith('pyreon/') ? ruleId : `pyreon/${ruleId}`
  const rule = allRules.find((r) => r.meta.id === normalized)

  if (!rule) {
    return {
      ruleId: normalized,
      found: false,
      suggestions: allRules
        .map((r) => r.meta.id)
        .filter((id) => isNear(id, normalized))
        .slice(0, 5),
      severity: null,
      willRun: false,
      reasons: [
        {
          code: 'unknown-rule',
          detail: `No rule with id \`${normalized}\`.`,
          fix: 'Run `pyreon-lint --list` for the authoritative set of rule ids.',
        },
      ],
      exemptPaths: [],
    }
  }

  const entry = opts.config.rules[rule.meta.id]
  const severity = severityOf(entry) ?? 'off'
  const options = optionsOf(entry)
  const exemptPaths = Array.isArray(options['exemptPaths'])
    ? (options['exemptPaths'] as string[])
    : []

  const reasons: OffReason[] = []

  if (severity === 'off') {
    reasons.push({
      code: 'severity-off',
      detail: 'The resolved config sets this rule to `off`.',
      fix: `Set \`"${rule.meta.id}": "${rule.meta.severity}"\` in .pyreonlintrc.json.`,
    })
  }

  // WHY it is off in a preset — reported even when the user has already
  // enabled it, because these explain the default rather than the current state.
  if (rule.meta.optIn) {
    reasons.push({
      code: 'opt-in',
      detail:
        'This is an opt-in best-practice rule, so every standard preset forces it off.',
      fix: 'Select the `best-practices` preset, or enable this rule by id.',
    })
  }

  if (rule.meta.scope === 'monorepo') {
    reasons.push({
      code: 'monorepo-scope',
      detail:
        'This rule encodes the Pyreon repository itself (its layer order, its private internal packages, its `[Pyreon]` error prefix), so every preset a consumer selects forces it off.',
      fix: 'Enable it by id only if your project genuinely shares those conventions.',
    })
  }

  const dep = rule.meta.requiresDependency
  let depMissing = false
  if (dep && opts.filePath) {
    depMissing = !isProjectDependency(opts.filePath, dep)
    if (depMissing) {
      reasons.push({
        code: 'dependency-missing',
        detail: `This rule only applies to projects using \`${dep}\`, which is not a declared dependency here.`,
        fix: `Nothing to fix — the rule is correctly silent. Add \`${dep}\` if you meant to use it.`,
      })
    }
  }

  return {
    ruleId: rule.meta.id,
    found: true,
    suggestions: [],
    severity,
    willRun: severity !== 'off' && !depMissing,
    reasons,
    exemptPaths,
  }
}

/** Render a `RuleState` for the terminal. */
export function formatRuleState(state: RuleState): string {
  const lines: string[] = []
  lines.push('')
  lines.push(`  ${state.ruleId}`)

  if (!state.found) {
    lines.push('')
    lines.push('  ✗ unknown rule')
    if (state.suggestions.length > 0) {
      lines.push('')
      lines.push('  Did you mean:')
      for (const s of state.suggestions) lines.push(`    ${s}`)
    }
    lines.push('')
    lines.push('  Run `pyreon-lint --list` for the full set.')
    lines.push('')
    return lines.join('\n')
  }

  lines.push('')
  lines.push(
    state.willRun
      ? `  ✓ WILL RUN — severity: ${state.severity}`
      : `  ✗ WILL NOT RUN — severity: ${state.severity}`,
  )

  if (state.reasons.length > 0) {
    lines.push('')
    for (const r of state.reasons) {
      lines.push(`  [${r.code}]`)
      lines.push(`    ${r.detail}`)
      lines.push(`    fix: ${r.fix}`)
      lines.push('')
    }
  } else {
    lines.push('')
    lines.push('  Nothing is suppressing it.')
    lines.push('')
  }

  if (state.exemptPaths.length > 0) {
    lines.push('  Configured exemptPaths (a file under any of these is skipped):')
    for (const p of state.exemptPaths) lines.push(`    ${p}`)
    lines.push('')
  }

  return lines.join('\n')
}
