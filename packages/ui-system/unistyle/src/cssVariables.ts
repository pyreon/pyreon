import camelToKebab from './styles/styles/camelToKebab'
import type { Value as ValueFn } from './units'
import { value } from './units'

/** CSS units accepted by the `value()` converter (re-derived, not duplicated). */
export type CssVarsUnit = NonNullable<Parameters<ValueFn>[2]>

/**
 * Per-top-level-key emission policy.
 * - a CSS unit (`'rem'`, `'px'`, …) — unitless numbers under that key are
 *   converted via `value(raw, rootSize, unit)` at EMISSION time, so the
 *   custom property already carries its final unit (`8` → `0.5rem`).
 * - `'none'` — the raw value is emitted verbatim (unitless numbers stay
 *   unitless: `lineHeight`, `fontWeight`, `zIndex`, ratio scales, …).
 */
export type CssVarsUnitPolicy = CssVarsUnit | 'none'

/**
 * Top-level theme keys that are never converted to CSS variables.
 * `breakpoints` + `rootSize` are consumed by JS at build/render time
 * (`@media` queries cannot read `var()`); `__PYREON__` carries the
 * `enrichTheme()` runtime helpers.
 */
export const CSS_VARS_DEFAULT_EXCLUDE = ['breakpoints', 'rootSize', '__PYREON__'] as const

type DefaultExcluded = (typeof CSS_VARS_DEFAULT_EXCLUDE)[number]

/**
 * Default emission units for the conventional Pyreon theme keys —
 * mirrors how the styles pipeline consumes each key today (`spacing`
 * flows through `edge()`/`calc()` as rem; `borderWidth` through the
 * edge shorthand as px). Keys not listed here default to `'none'`.
 */
const DEFAULT_UNITS: Readonly<Record<string, CssVarsUnitPolicy>> = {
  spacing: 'rem',
  fontSize: 'rem',
  headingSize: 'rem',
  elementSize: 'rem',
  borderRadius: 'rem',
  borderWidth: 'px',
}

const DEFAULT_PREFIX = 'px'
const DEFAULT_ROOT_SIZE = 16

export interface ThemeToCssVarsOptions<Ex extends readonly string[] = typeof CSS_VARS_DEFAULT_EXCLUDE> {
  /** Variable-name prefix: `--<prefix>-<path>`. Default `'px'` (Pyreon). */
  prefix?: string | undefined
  /** Top-level keys to keep raw (replaces the default list). */
  exclude?: Ex | undefined
  /**
   * Per-top-level-key unit policy overrides, merged over the defaults
   * (`spacing`/`fontSize`/`headingSize`/`elementSize`/`borderRadius` → rem,
   * `borderWidth` → px, everything else `'none'`).
   */
  units?: Record<string, CssVarsUnitPolicy> | undefined
  /** Root font size for px→rem conversion. Default `theme.rootSize ?? 16`. */
  rootSize?: number | undefined
}

/** A leaf is tokenized only when it is a non-empty string or a finite number. */
type VarifyNode<V> = V extends string | number
  ? string
  : V extends readonly unknown[] | ((...args: never[]) => unknown) | boolean | null | undefined
    ? V
    : V extends object
      ? { [K in keyof V]: VarifyNode<V[K]> }
      : V

/**
 * The same shape as the input theme with every eligible leaf replaced by
 * a `'var(--px-…)'` reference string. Excluded top-level keys keep their
 * original types.
 */
export type CssVarsTheme<T, Ex extends string = DefaultExcluded> = {
  [K in keyof T]: K extends Ex ? T[K] : VarifyNode<T[K]>
}

export interface ThemeToCssVarsResult<T, Ex extends string = DefaultExcluded> {
  /** Same-shape theme tree; eligible leaves are `var(--px-…)` strings. */
  vars: CssVarsTheme<T, Ex>
  /** A ready-to-inject `:root { … }` block (empty string when no vars). */
  css: string
  /**
   * `varName → emitted value` (units already baked). Consumers that
   * cannot evaluate `var()` (PDF/DOCX export, devtools) resolve here.
   */
  registry: ReadonlyMap<string, string>
}

const sanitizeSegment = (seg: string): string =>
  camelToKebab(seg)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/, '')

const isTokenizableLeaf = (v: unknown): v is string | number =>
  (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v))

const isWalkableObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Emit a leaf value with its unit baked (strings with units pass through `value()` untouched). */
const emitLeaf = (
  raw: string | number,
  policy: CssVarsUnitPolicy,
  rootSize: number,
): string => {
  if (policy === 'none') return String(raw)
  const converted = value(raw, rootSize, policy)
  /* v8 ignore next — value() only returns null for empty input, which isTokenizableLeaf excludes */
  return converted == null ? String(raw) : String(converted)
}

interface CacheEntry {
  optionsKey: string
  result: ThemeToCssVarsResult<object, string>
}

// Per-theme-identity memo — themes are stable singletons, so repeated
// calls (provider re-mounts, multiple consumers) return the SAME result
// object. Identity stability matters downstream: styler / rocketstyle
// caches key off theme object identity.
const _cache = new WeakMap<object, CacheEntry[]>()

const optionsSignature = (
  prefix: string,
  exclude: readonly string[],
  units: Record<string, CssVarsUnitPolicy>,
  rootSize: number,
): string =>
  JSON.stringify([
    prefix,
    [...exclude].sort(),
    Object.keys(units)
      .sort()
      .map((k) => [k, units[k]]),
    rootSize,
  ])

/**
 * Autogenerate CSS custom properties from a plain theme JSON.
 *
 * Walks the theme and returns:
 * - `vars` — the same-shape tree with every eligible leaf replaced by a
 *   `'var(--px-<path>)'` string. Plain strings, so they flow through the
 *   entire unistyle value pipeline (`value()` / `values()` / `edge` /
 *   `borderRadius` / `styles()` / `makeItResponsive`) untouched.
 * - `css` — the `:root { … }` declaration block to inject once.
 * - `registry` — `varName → emitted value` for consumers that cannot
 *   evaluate `var()` (document export, devtools).
 *
 * Units are baked at emission using the SAME `value()` conversion the
 * pipeline applies today: `spacing.small: 8` emits
 * `--px-spacing-small: 0.5rem`, so themes stay authored in pixels and
 * downstream consumers never convert a var. Unitless scales
 * (`lineHeight`, `fontWeight`, `zIndex`, custom ratio keys) emit raw
 * numbers so `calc(var(--a) * var(--b))` multiplication stays valid.
 *
 * Not tokenized (kept raw in `vars`): excluded top-level keys
 * (`breakpoints` / `rootSize` — `@media` queries cannot read `var()`),
 * arrays, functions, booleans, `null`/`undefined`, empty strings and
 * non-finite numbers. Note CSS also forbids `var()` inside `url(…)`, so
 * never tokenize values destined for `backgroundImage`.
 *
 * Pure — performs no injection; pass `css` to your style sink
 * (`createGlobalStyle`, `sheet.injectRules`, a `<style>` tag).
 *
 * @example
 * const theme = { rootSize: 16, spacing: { small: 8 }, ratio: { medium: 1.5 } }
 * const { vars, css } = themeToCssVars(theme)
 * vars.spacing.small        // 'var(--px-spacing-small)'
 * vars.ratio.medium         // 'var(--px-ratio-medium)'
 * css                       // ':root {\n  --px-spacing-small: 0.5rem;\n  --px-ratio-medium: 1.5;\n}'
 * // proportional sizing is native CSS:
 * const width = `calc(${vars.spacing.small} * ${vars.ratio.medium})`
 */
export function themeToCssVars<
  T extends object,
  const Ex extends readonly string[] = typeof CSS_VARS_DEFAULT_EXCLUDE,
>(theme: T, options?: ThemeToCssVarsOptions<Ex>): ThemeToCssVarsResult<T, Ex[number]> {
  const prefix = options?.prefix ?? DEFAULT_PREFIX
  const exclude: readonly string[] = options?.exclude ?? CSS_VARS_DEFAULT_EXCLUDE
  const units: Record<string, CssVarsUnitPolicy> = { ...DEFAULT_UNITS, ...options?.units }
  const themeRootSize = (theme as { rootSize?: unknown }).rootSize
  const rootSize =
    options?.rootSize ?? (typeof themeRootSize === 'number' ? themeRootSize : DEFAULT_ROOT_SIZE)

  const optionsKey = optionsSignature(prefix, exclude, units, rootSize)
  const cached = _cache.get(theme)
  if (cached) {
    const hit = cached.find((e) => e.optionsKey === optionsKey)
    if (hit) return hit.result as ThemeToCssVarsResult<T, Ex[number]>
  }

  const excludeSet = new Set(exclude)
  const registry = new Map<string, string>()
  const sources = new Map<string, string>()

  const walk = (
    node: Record<string, unknown>,
    out: Record<string, unknown>,
    segs: string[],
    policy: CssVarsUnitPolicy,
  ): void => {
    for (const key of Object.keys(node)) {
      const v = node[key]
      const isTop = segs.length === 0

      if (isTop && excludeSet.has(key)) {
        out[key] = v
        continue
      }

      const keyPolicy = isTop ? (units[key] ?? 'none') : policy

      if (isWalkableObject(v)) {
        const child: Record<string, unknown> = {}
        out[key] = child
        walk(v, child, [...segs, key], keyPolicy)
        continue
      }

      if (!isTokenizableLeaf(v)) {
        out[key] = v
        continue
      }

      const path = [...segs, key]
      const varName = `--${prefix}-${path.map(sanitizeSegment).join('-')}`
      const pathStr = path.join('.')
      const existingPath = sources.get(varName)
      if (existingPath !== undefined && existingPath !== pathStr) {
        throw new Error(
          `[Pyreon] themeToCssVars: variable name collision — '${varName}' is produced by both ` +
            `'${existingPath}' and '${pathStr}' (kebab-case normalization collapsed them). ` +
            `Rename one of the theme keys.`,
        )
      }
      sources.set(varName, pathStr)
      registry.set(varName, emitLeaf(v, keyPolicy, rootSize))
      out[key] = `var(${varName})`
    }
  }

  const vars: Record<string, unknown> = {}
  walk(theme as Record<string, unknown>, vars, [], 'none')

  const css =
    registry.size === 0
      ? ''
      : `:root {\n${[...registry.entries()].map(([n, v]) => `  ${n}: ${v};`).join('\n')}\n}`

  const result: ThemeToCssVarsResult<T, Ex[number]> = {
    vars: vars as CssVarsTheme<T, Ex[number]>,
    css,
    registry,
  }

  const entries = cached ?? []
  entries.push({ optionsKey, result: result as ThemeToCssVarsResult<object, string> })
  if (!cached) _cache.set(theme, entries)

  return result
}

/**
 * Resolve `var(--…)` references in a value back to their raw emitted values
 * using a `themeToCssVars` registry — for consumers that cannot evaluate
 * CSS custom properties (document export to PDF/DOCX/email, devtools,
 * non-CSS render targets).
 *
 * - Strings have every `var(--name)` / `var(--name, fallback)` occurrence
 *   substituted from the registry; unknown names fall back to the inline
 *   fallback when present, else stay verbatim.
 * - Non-strings pass through untouched.
 * - `calc(…)` expressions are NOT evaluated — only their var() references
 *   are inlined (`calc(0.5rem * 1.5)`). Non-CSS targets needing a single
 *   number must evaluate the calc themselves or avoid calc-composed values.
 *
 * @example
 * const { registry } = themeToCssVars(theme)
 * resolveCssVarReferences('var(--px-spacing-small)', registry)        // '0.5rem'
 * resolveCssVarReferences('calc(var(--px-spacing-small) * 2)', registry) // 'calc(0.5rem * 2)'
 * resolveCssVarReferences('var(--px-missing, 1rem)', registry)        // '1rem'
 */
export function resolveCssVarReferences<T>(input: T, registry: ReadonlyMap<string, string>): T {
  if (typeof input !== 'string') return input
  if (input.indexOf('var(') === -1) return input
  // Registry values are literals (themeToCssVars bakes units at emission),
  // but inline fallbacks may themselves contain var() — re-scan until stable,
  // bounded to defend against pathological self-references.
  let out = input as string
  for (let pass = 0; pass < 10; pass++) {
    const next = resolveVarPass(out, registry)
    if (next === out) break
    out = next
  }
  return out as T
}

const isNameChar = (c: string): boolean =>
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '-'

/**
 * ONE left-to-right resolution pass over `s` — a LINEAR character scan (no
 * regex on the input, so no polynomial-ReDoS surface; mirrors the `font.ts`
 * `splitSubsetBlocks` precedent). Finds each `var(name[, fallback])`, reading
 * the fallback up to its matching close paren with paren-depth tracking
 * (handles `var(--x, calc(…))`), and replaces it with the registry value,
 * else the fallback, else leaves it verbatim and advances past it.
 */
function resolveVarPass(s: string, registry: ReadonlyMap<string, string>): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const idx = s.indexOf('var(', i)
    if (idx === -1) {
      out += s.slice(i)
      break
    }
    out += s.slice(i, idx)
    let j = idx + 4 // past 'var('
    while (j < s.length && s[j] === ' ') j++
    const nameStart = j
    while (j < s.length && isNameChar(s[j]!)) j++
    const name = s.slice(nameStart, j)
    while (j < s.length && s[j] === ' ') j++
    let fallback: string | undefined
    if (s[j] === ',') {
      j++
      let depth = 0
      const fbStart = j
      while (j < s.length) {
        const c = s[j]
        if (c === '(') depth++
        else if (c === ')') {
          if (depth === 0) break
          depth--
        }
        j++
      }
      fallback = s.slice(fbStart, j).trim()
    }
    if (s[j] !== ')') {
      // Not a well-formed var() — emit `var(` verbatim and continue scanning
      // after it (never loops: i strictly advances).
      out += 'var('
      i = idx + 4
      continue
    }
    const end = j + 1 // past ')'
    out += registry.get(name) ?? fallback ?? s.slice(idx, end)
    i = end
  }
  return out
}
