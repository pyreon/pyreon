/**
 * Custom-Property Style Extraction (CPSE) — Phase 0 proof-of-concept primitive.
 *
 * See `.claude/audits/custom-property-style-extraction-2026-06-22.md` for the
 * full RFC. The thesis: decouple a style prop's **CSS-rule identity** from its
 * **value identity**. Instead of baking the resolved value into the rule —
 *
 *     gap: 2.25rem            // value-DEPENDENT rule → a new rule + a
 *                             // `styler.resolve` per distinct value
 *                             // (cost O(distinct value tuples), proven by
 *                             //  styler/__tests__/static-styler-resolve-cost)
 *
 * — emit a value-AGNOSTIC rule that reads a custom property, and deliver the
 * value per-instance as an inline custom property —
 *
 *     gap: var(--u-<hash>)    // ONE shared rule, resolved ONCE per
 *                             // definition; cost O(component definitions)
 *     style="--u-<hash>: 2.25rem"   // per-instance, no resolve / no hash /
 *                                   //  no new rule
 *
 * This makes styling cost **flat in app cardinality** and gives **dynamic
 * (signal-driven) values for free** (update the inline custom property — no
 * `styler.resolve`, no rule churn).
 *
 * Phase 0 scope: a single declaration / single property, to PROVE the
 * mechanism (1 rule + 1 resolve for N distinct values; computed-style parity
 * with the value-baked path; nesting-safe). Phases 1-4 (RFC §5) generalize
 * across the 170+ unistyle property mappings, responsive arrays (per-breakpoint
 * vars + media queries), the dynamic path, and rocketstyle integration.
 *
 * Self-contained: depends only on unistyle's own `value()` conversion + an
 * inline FNV-1a. Does NOT import `@pyreon/styler` (keeps the primitive
 * layer-pure; only the measurement TESTS reach for the styler counters).
 */
import { value } from './units'

/** The two halves of an extracted style declaration. */
export interface ExtractedStyleVar {
  /**
   * Value-agnostic CSS declaration, e.g. `"gap:var(--u-1n2k4)"`. Identical for
   * every value of this property, so the styler resolves + inserts it exactly
   * ONCE per component definition regardless of how many distinct values the
   * app renders.
   */
  rule: string
  /** Custom-property name, e.g. `"--u-1n2k4"`. Set inline per instance. */
  varName: string
  /**
   * The value converted via the SAME shipped `value()` pipeline the
   * value-baked path uses (number → rem, unit strings passthrough, `var()` /
   * `calc()` passthrough). Set as the inline custom-property value, so the
   * computed style is byte-identical to baking the value into the rule.
   * `null` when the input isn't a value (so the caller can omit the inline
   * property — the declaration then has no effect, matching today's
   * "no value → no declaration").
   */
  varValue: string | null
}

// FNV-1a 32-bit over the property name. Inlined (5 lines) rather than importing
// `@pyreon/styler`'s `hash` so the primitive stays free of a styler import.
// Phase 0 keys the var on the PROPERTY only: sharing one var name across
// components for the same property is CORRECT — the rule is value-agnostic and
// every instance sets its own inline value, so a shared name never causes
// cross-instance bleed (an element that emits `gap:var(--u-g)` ALWAYS also
// sets `--u-g` inline; nothing relies on inheritance). Verified by the
// nesting test. (Phase 2's dynamic remove-path is the one case that must
// reset rather than drop the inline var — tracked in the RFC.)
const fnv1a = (s: string): string => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

/**
 * Extract one style declaration into a value-agnostic rule + a per-instance
 * custom-property value.
 *
 * @param property CSS property name (already in CSS-spec form, e.g. `gap`).
 * @param rawValue The author-supplied value (`36`, `"1rem"`, `"var(--x)"`, …).
 * @param rootSize px→rem base (defaults to 16, matching `value()`).
 */
export function extractStyleVar(
  property: string,
  rawValue: unknown,
  rootSize = 16,
): ExtractedStyleVar {
  const varName = cpseVarName(property)
  const converted = value(rawValue as Parameters<typeof value>[0], rootSize)
  return {
    rule: `${property}:var(${varName})`,
    varName,
    varValue: converted == null ? null : String(converted),
  }
}

/**
 * Canonical CPSE custom-property name for a CSS property (+ optional
 * breakpoint suffix for the responsive path). Stable + collision-free across
 * distinct property names; shared across components for the same property
 * (intended — every instance sets its own inline value, §nesting test).
 */
export function cpseVarName(property: string, breakpoint?: string): string {
  return breakpoint ? `--u-${fnv1a(property)}-${breakpoint}` : `--u-${fnv1a(property)}`
}

// A fragment is CPSE-rewritable only if it is a flat list of `prop: value`
// declarations — NO selector / nesting / at-rule / pseudo. `extendCss` user
// CSS, `&:empty{…}`, `@media`, `url(…)` all carry structure a flat
// declaration rewrite would corrupt, so they pass through untouched
// (conservative — the collapse-catalogue philosophy: correct-but-unextracted
// beats wrong).
const STRUCTURAL = /[{}&@]|url\(/

/**
 * Rewrite every flat `prop: value;` declaration in a resolved CSS fragment to
 * the value-agnostic `prop: var(--u-<hash>[-bp]);` form, writing each value
 * into `varsOut`. Returns the rewritten fragment. Fragments carrying any
 * structure (selectors, at-rules, nesting, url()) are returned UNCHANGED.
 *
 * This operates on `processDescriptor`'s ALREADY-RESOLVED output, so it
 * inherits every unit-conversion / shorthand correctness for free and stays
 * general across the whole property map.
 *
 * @param frag       a resolved CSS fragment, e.g. `"gap: 2.25rem;"` or
 *                   `"margin: 1rem 2rem;"` (possibly several `;`-separated).
 * @param varsOut    sink: `varName → value` for the per-instance inline props.
 * @param breakpoint optional suffix so per-breakpoint values get distinct vars.
 */
export function cpseRewrite(
  frag: string,
  varsOut: Record<string, string>,
  breakpoint?: string,
): string {
  if (!frag || STRUCTURAL.test(frag)) return frag
  let out = ''
  for (const decl of frag.split(';')) {
    const trimmed = decl.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(':')
    if (colon < 1) {
      out += `${trimmed};` // malformed / valueless → leave verbatim
      continue
    }
    const prop = trimmed.slice(0, colon).trim()
    const val = trimmed.slice(colon + 1).trim()
    // Skip already-var values (idempotent) and empty values. A property name
    // must be a plain CSS ident (kebab); anything else → leave verbatim.
    if (!val || val.startsWith('var(') || !/^[a-z][a-z-]*$/.test(prop)) {
      out += `${trimmed};`
      continue
    }
    const varName = cpseVarName(prop, breakpoint)
    varsOut[varName] = val
    out += `${prop}:var(${varName});`
  }
  return out
}
