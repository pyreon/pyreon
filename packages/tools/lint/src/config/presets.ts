import { allRules } from '../rules/index'
import type { LintConfig, PresetName, Severity } from '../types'

/**
 * Build a config where every rule uses its default severity, EXCEPT
 * opt-in best-practice rules (`meta.optIn`) which are forced OFF — they
 * never add noise/score-penalty in the standard presets unless the user
 * explicitly enables them (per-rule config) or selects `best-practices`.
 */
function buildRecommended(): LintConfig {
  const rules: Record<string, Severity> = {}
  for (const rule of allRules) {
    rules[rule.meta.id] = isShippedOff(rule) ? 'off' : rule.meta.severity
  }
  return { rules }
}

/**
 * Is this rule forced OFF in every preset a CONSUMER selects?
 *
 * Two independent reasons, deliberately kept separate:
 *  - `optIn` — a best-practice rule the user must ask for.
 *  - `scope: 'monorepo'` — a rule about THIS repository, not about Pyreon.
 *    Shipping it would fire `@pyreon/*`-specific errors in a user's app.
 */
function isShippedOff(rule: (typeof allRules)[number]): boolean {
  return rule.meta.optIn === true || rule.meta.scope === 'monorepo'
}

/**
 * `best-practices` preset — `recommended` PLUS every opt-in
 * best-practice rule enabled at its declared `meta.severity`. A
 * wholesale opt-in for projects that want the full best-practice
 * surface; library-scoped rules still self-gate on package.json deps,
 * so a project only sees rules for libraries it actually uses.
 */
function buildBestPractices(): LintConfig {
  const rules: Record<string, Severity> = {}
  for (const rule of allRules) {
    // `best-practices` is "recommended + every opt-in rule". It is still a
    // CONSUMER preset, so monorepo-scoped rules stay off — enabling them
    // would fire `@pyreon/*` layer-order errors in a user's app.
    rules[rule.meta.id] = rule.meta.scope === 'monorepo' ? 'off' : rule.meta.severity
  }
  return { rules }
}

function severityOf(entry: LintConfig['rules'][string]): Severity {
  // Presets are built from bare severities (no tuple form). If a future
  // preset adds tuple form, extract the severity from the tuple.
  return Array.isArray(entry) ? (entry[0] as Severity) : (entry as Severity)
}

/** Build a config where every warn is promoted to error. */
function buildStrict(): LintConfig {
  const base = buildRecommended()
  const rules: Record<string, Severity> = {}
  for (const [id, entry] of Object.entries(base.rules)) {
    const sev = severityOf(entry)
    rules[id] = sev === 'warn' ? 'error' : sev
  }
  return { rules }
}

/** Build app config — recommended but disable library-only rules. */
function buildApp(): LintConfig {
  const base = buildRecommended()
  return {
    rules: {
      ...base.rules,
      'pyreon/dev-guard-warnings': 'off',
      'pyreon/no-error-without-prefix': 'off',
      'pyreon/no-circular-import': 'off',
      'pyreon/no-cross-layer-import': 'off',
      // `require-browser-smoke-test` is a per-package contract that
      // applies to published libraries — apps don't ship as packages
      // with smoke obligations.
      'pyreon/require-browser-smoke-test': 'off',
      // `no-process-dev-gate` stays ON in `app` preset because the bug
      // hits user-facing browser code regardless of whether it's a lib
      // or an app.
    },
  }
}

/** Build lib config — strict + all architecture rules as error. */
function buildLib(): LintConfig {
  const base = buildStrict()
  return {
    rules: {
      ...base.rules,
      // Library-author rules that are NOT specific to this repository.
      // `no-circular-import` / `no-cross-layer-import` /
      // `no-error-without-prefix` / `require-browser-smoke-test` used to be
      // promoted here too, but each hardcodes `@pyreon/*` specifiers or this
      // repo's layer order, so they only ever produced noise for a consumer
      // publishing their own library. They are `scope: 'monorepo'` now and
      // stay off in every shipped preset.
      'pyreon/dev-guard-warnings': 'error',
      'pyreon/no-process-dev-gate': 'error',
    },
  }
}

const presetBuilders: Record<PresetName, () => LintConfig> = {
  recommended: buildRecommended,
  strict: buildStrict,
  app: buildApp,
  lib: buildLib,
  'best-practices': buildBestPractices,
}

export function getPreset(name: PresetName): LintConfig {
  return presetBuilders[name]()
}

export { buildApp, buildBestPractices, buildLib, buildRecommended, buildStrict }
