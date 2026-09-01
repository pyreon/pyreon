import { CATEGORY_GROUP } from '../rules/groups'
import type { ConfigDiagnostic, LintConfigFile, RuleGroup } from '../types'

/**
 * Config keys that name something which does not exist.
 *
 * A misspelled rule id in `.pyreonlintrc.json` used to be perfectly silent:
 * the entry parsed, merged into the config, and then matched no rule, so the
 * rule it was meant to configure kept running at its preset severity — or, for
 * an `"off"` entry, kept running when the author believed it was disabled.
 * There was no error, no warning, and no way to tell a typo from a working
 * line except by reading the registry.
 *
 * This repo shipped one: `.pyreonlintrc.json` carried
 * `pyreon/dangerously-set-inner-html` — with an `exemptPaths` entry — for a
 * rule that has never existed. It sat there being ignored.
 *
 * Reporting it as a config diagnostic makes the failure mode loud. The
 * suggestion list matters as much as the error: a renamed rule should tell you
 * its new name, not just that the old one is gone.
 */

/**
 * Loose "did you mean" test — a shared substring, or two or more shared
 * kebab segments. Deliberately generous: a suggestion that turns out to be
 * unhelpful costs a line of output, while a missing one costs a search.
 */
export function isNear(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 4) return false
  const short = a.length < b.length ? a : b
  const long = a.length < b.length ? b : a
  if (long.includes(short)) return true
  let shared = 0
  for (const part of short.split('-')) {
    if (part.length > 2 && long.includes(part)) shared++
  }
  return shared >= 2
}

const VALID_GROUPS = new Set<string>(Object.values(CATEGORY_GROUP) as RuleGroup[])
// `internal` is a real group but reachable only via `scope: 'monorepo'`, so it
// never appears as a value in CATEGORY_GROUP.
VALID_GROUPS.add('internal')

/**
 * Diagnose `rules` / `groups` keys in a loaded config file that name nothing.
 *
 * @param fileConfig the parsed config file, or null when none was found
 * @param knownRuleIds every registered rule id
 */
export function diagnoseUnknownConfigKeys(
  fileConfig: LintConfigFile | null,
  knownRuleIds: readonly string[],
  knownSettingKeys: readonly string[] = [],
): ConfigDiagnostic[] {
  if (!fileConfig) return []
  const out: ConfigDiagnostic[] = []
  const known = new Set(knownRuleIds)

  for (const id of Object.keys(fileConfig.rules ?? {})) {
    if (known.has(id)) continue
    const near = knownRuleIds.filter((k) => isNear(k, id)).slice(0, 3)
    const hint = near.length > 0 ? ` Did you mean: ${near.join(', ')}?` : ''
    out.push({
      ruleId: id,
      severity: 'error',
      message:
        `Config names an unknown rule \`${id}\`, so that entry does nothing — ` +
        `if it was meant to silence or configure a rule, it is not.${hint}`,
    })
  }

  for (const group of Object.keys(fileConfig.groups ?? {})) {
    if (VALID_GROUPS.has(group)) continue
    const valid = [...VALID_GROUPS].sort().join(', ')
    out.push({
      ruleId: `groups.${group}`,
      severity: 'error',
      message:
        `Config names an unknown rule group \`${group}\`, so that entry does ` +
        `nothing. Valid groups: ${valid}.`,
    })
  }

  // A `settings` key no rule declares is seeded onto nothing. Same silence as
  // a typo'd rule id: the line parses, merges, and protects nothing.
  const knownSettings = new Set(knownSettingKeys)
  for (const key of Object.keys(fileConfig.settings ?? {})) {
    if (knownSettings.has(key)) continue
    const near = knownSettingKeys.filter((k) => isNear(k, key)).slice(0, 3)
    const hint =
      near.length > 0
        ? ` Did you mean: ${near.join(', ')}?`
        : knownSettingKeys.length > 0
          ? ` Known settings: ${[...knownSettings].sort().join(', ')}.`
          : ''
    out.push({
      ruleId: `settings.${key}`,
      severity: 'error',
      message:
        `Config sets an unknown shared setting \`${key}\`, which no rule ` +
        `declares, so it reaches no rule.${hint}`,
    })
  }

  return out
}
