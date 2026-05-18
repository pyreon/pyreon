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
    rules[rule.meta.id] = rule.meta.optIn ? 'off' : rule.meta.severity
  }
  return { rules }
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
    rules[rule.meta.id] = rule.meta.severity
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
      'pyreon/no-circular-import': 'error',
      'pyreon/no-cross-layer-import': 'error',
      'pyreon/dev-guard-warnings': 'error',
      'pyreon/no-error-without-prefix': 'error',
      'pyreon/no-process-dev-gate': 'error',
      'pyreon/require-browser-smoke-test': 'error',
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
