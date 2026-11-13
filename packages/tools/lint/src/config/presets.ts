import { allRules } from '../rules/index'
import type { LintConfig, PresetName, RuleEntry, Severity } from '../types'

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
    //
    // `style` rules stay off too. They are a TASTE a team adopts on purpose,
    // through the `readable` layer, with thresholds that only that layer
    // carries; "every best practice" must not quietly include them.
    const off = rule.meta.scope === 'monorepo' || rule.meta.category === 'style'
    rules[rule.meta.id] = off ? 'off' : rule.meta.severity
  }
  return { rules }
}

function severityOf(entry: RuleEntry): Severity {
  return Array.isArray(entry) ? (entry[0] as Severity) : (entry as Severity)
}

/**
 * Build a config where every warn is promoted to error.
 *
 * A tuple keeps its options and only has its severity promoted. The promotion
 * covers only the rules THIS preset sets, so a layer composed after it
 * (`["strict", "readable"]`) keeps its own `warn`: readability findings never
 * become build-breaking errors by accident.
 */
function buildStrict(): LintConfig {
  const base = buildRecommended()
  const rules: Record<string, RuleEntry> = {}
  for (const [id, entry] of Object.entries(base.rules)) {
    const sev = severityOf(entry)
    const promoted: Severity = sev === 'warn' ? 'error' : sev
    rules[id] = Array.isArray(entry) ? [promoted, entry[1] ?? {}] : promoted
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

/**
 * The `readable` LAYER: how code reads, nothing about whether it works.
 *
 * Every rule here is either autofixable (the blank-line rules) or a limit near
 * this repository's p99 that only flags genuine outliers (JSX depth 6, a
 * ternary chain of more than 4 outcomes). Thresholds are measured, not taste:
 * see the "Readable preset" docs page for the distributions behind them.
 *
 * A layer sets ONLY its own rules, so it composes on top of any base preset
 * without undoing it: `["strict", "readable"]` keeps strict's errors and adds
 * readability warnings.
 */
function buildReadable(): LintConfig {
  return {
    rules: {
      'pyreon/padding-between-declarations': 'warn',
      'pyreon/padding-before-return': 'warn',
      'pyreon/padding-between-component-sections': 'warn',
      'pyreon/max-jsx-depth': ['warn', { max: 6 }],
      'pyreon/no-nested-ternary-branch': ['warn', { maxOutcomes: 4 }],
    },
  }
}

/**
 * `readable-strict` — `readable` plus paragraph spacing INSIDE functions
 * (a blank line around every multi-line `if`/`for`/`try`/`switch`) and the p95
 * limits (JSX depth 5, ternary chains of at most 3 outcomes). The full
 * discipline; best adopted on new code, where the spacing costs nothing.
 */
function buildReadableStrict(): LintConfig {
  const base = buildReadable()
  return {
    rules: {
      ...base.rules,
      'pyreon/padding-around-multiline-blocks': 'warn',
      'pyreon/max-jsx-depth': ['warn', { max: 5 }],
      'pyreon/no-nested-ternary-branch': ['warn', { maxOutcomes: 3 }],
    },
  }
}

const presetBuilders: Record<PresetName, () => LintConfig> = {
  recommended: buildRecommended,
  strict: buildStrict,
  app: buildApp,
  lib: buildLib,
  'best-practices': buildBestPractices,
  readable: buildReadable,
  'readable-strict': buildReadableStrict,
}

/**
 * Presets that set only their own rules. Composed on top of a base preset;
 * on their own they sit on `recommended`, so `"preset": "readable"` never
 * means "only readability, no correctness".
 */
const LAYER_PRESETS: ReadonlySet<PresetName> = new Set<PresetName>(['readable', 'readable-strict'])

/** Is this a preset name `getPreset` knows? */
export function isPresetName(name: unknown): name is PresetName {
  return typeof name === 'string' && Object.hasOwn(presetBuilders, name)
}

/**
 * Build one preset, or compose a list LEFT TO RIGHT.
 *
 * `["recommended", "readable"]` is recommended with the readable layer on top.
 * A later entry overrides an earlier one rule by rule. A list made only of
 * layers starts from `recommended`.
 *
 * @example
 * ```ts
 * getPreset('recommended')
 * getPreset(['strict', 'readable'])
 * ```
 */
export function getPreset(name: PresetName | readonly PresetName[]): LintConfig {
  const names: readonly PresetName[] = typeof name === 'string' ? [name] : name
  for (const n of names) {
    if (!isPresetName(n)) {
      throw new Error(
        `[Pyreon] Unknown lint preset "${String(n)}". Use one of: ${Object.keys(presetBuilders).join(', ')}.`,
      )
    }
  }
  const list: PresetName[] = names.some((n) => !LAYER_PRESETS.has(n))
    ? [...names]
    : ['recommended', ...names]
  const rules: Record<string, RuleEntry> = {}
  for (const n of list) Object.assign(rules, presetBuilders[n]().rules)

  return { rules }
}

export {
  buildApp,
  buildBestPractices,
  buildLib,
  buildReadable,
  buildReadableStrict,
  buildRecommended,
  buildStrict,
}
