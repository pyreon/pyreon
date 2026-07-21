import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * PRIMITIVE-FIRST — the library's keystone architectural rule.
 *
 * Every INTERACTIVE component must delegate its behavior + accessibility to a
 * headless `*Base` primitive from `@pyreon/ui-primitives`, via
 * `.config({ component: XBase })`, and add ONLY styling on top. A styled `<div>`
 * with missing (or hand-rolled) keyboard handling and ARIA is a bug — that is
 * exactly how `Tree`, `Menu`, `Popover`, `Accordion` and the whole DatePicker
 * family shipped as inert shells while a fully-built, keyboard-tested
 * `TreeBase` sat orphaned.
 *
 * `KNOWN_HOLLOW` is a SHRINKING allowlist of the components that violate the
 * rule today. It works like `lint-baseline.json` / `BELOW_FLOOR_EXEMPTIONS`:
 *
 *   - NEVER add an entry. A new interactive component must wrap a primitive.
 *   - Each PR that builds a primitive and wires its component REMOVES its entry.
 *   - Drift is detected in BOTH directions: if a listed component starts
 *     delegating, this test FAILS telling you to delete the entry, so the
 *     allowlist can never silently rot into a permanent excuse list.
 */

const COMPONENTS_DIR = join(import.meta.dirname, '..', 'components')

/**
 * Components whose whole job involves behavior + a11y (keyboard nav, focus
 * management, ARIA roles/state). Presentational components (Badge, Card,
 * Loader…) are deliberately NOT here — they carry static ARIA defaults in
 * `.attrs()` instead, which is a different contract.
 *
 * Stepper / Pagination / NavLink are excluded on purpose: they need
 * `aria-current`, not a behavior primitive.
 */
const INTERACTIVE = [
  'Accordion',
  'Autocomplete',
  'Calendar',
  'Checkbox',
  'ColorPicker',
  'Combobox',
  'DatePicker',
  'DateRangePicker',
  'DateTimePicker',
  'Dialog',
  'Drawer',
  'FileUpload',
  'HoverCard',
  'Menu',
  'Modal',
  'MonthPicker',
  'MultiSelect',
  'NumberInput',
  'PinInput',
  'Popover',
  'Radio',
  'RangeSlider',
  'Rating',
  'SegmentedControl',
  'Select',
  'Slider',
  'Spoiler',
  'Switch',
  'Tabs',
  'TagsInput',
  'TimePicker',
  'Tree',
] as const

/** Interactive components that do NOT yet delegate. Only ever shrinks. */
const KNOWN_HOLLOW: Record<string, string> = {
  Menu: 'Needs a MenuBase (role=menu/menuitem, roving tabindex, typeahead, Esc + focus return).',
  Popover: 'Needs a PopoverBase built on @pyreon/elements useOverlay (open state, Esc, click-outside, positioning).',
  HoverCard: 'Inherits the hollow Popover via `Popover.config()`. Fixed when Popover gets PopoverBase.',
  DatePicker: 'Needs a DatePickerBase (compose PopoverBase + CalendarBase) — a styled div today.',
  DateRangePicker: 'Inherits hollow DatePicker; also needs CalendarBase range mode. JSDoc currently overclaims.',
  DateTimePicker: 'Inherits hollow DatePicker; also needs a time surface.',
  TimePicker: 'Inherits hollow DatePicker; needs its own time-list behavior.',
  MonthPicker: 'Needs CalendarBase in month view.',
}

type Classification =
  | { kind: 'delegates' }
  | { kind: 'extends'; parent: string }
  | { kind: 'hollow' }

/**
 * Classify a component from its source. Two ways to satisfy the rule:
 *  1. DIRECT   — imports a `*Base` from @pyreon/ui-primitives and passes it as
 *                `.config({ component: XBase })`.
 *  2. INHERITED — re-configures another component (`X = Y.config({ name })`),
 *                 which inherits Y's `component` (this is how Autocomplete
 *                 legitimately rides on Combobox → ComboboxBase).
 */
/**
 * Strip comments before classifying. This is LOAD-BEARING, not hygiene: every
 * wired component carries a JSDoc note explaining why it has no `.attrs()` —
 * "with `component: XBase`, Element is no longer the rendered component" — and
 * that prose MATCHES the `component:\s*\w+Base` probe. Reading the raw text made
 * the gate answer "delegates" from a COMMENT, so it could not fail for any
 * component it was meant to protect: un-wiring one left the JSDoc behind and the
 * gate stayed green (verified). It also broke drift detection in the other
 * direction — an allowlisted component whose docs merely MENTIONED a Base would
 * report as "now delegates".
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** Components live as index.ts OR index.tsx (Element-first conversions). */
function readComponentSource(name: string): string {
  for (const f of ['index.ts', 'index.tsx']) {
    try {
      return readFileSync(join(COMPONENTS_DIR, name, f), 'utf-8')
    } catch {
      /* try next */
    }
  }
  throw new Error(`No index.ts(x) for component ${name}`)
}

function classify(name: string): Classification {
  const src = stripComments(readComponentSource(name))

  // Two delegation shapes: the rocketstyle wrapper (`.config({ component:
  // XBase })`) and the batteries-included COMPOSITION (`h(XBase, …)` — the
  // Element-first conversions: Rating/TagsInput/RangeSlider/Tree).
  if (src.includes('@pyreon/ui-primitives') && (/component:\s*\w+Base/.test(src) || /\bh\(\s*\w+Base\b/.test(src))) {
    return { kind: 'delegates' }
  }

  // `import Parent from '../Parent'` + `Parent.config(` — default OR named
  // import (Autocomplete rides the NAMED `ComboboxStyled` chain since the
  // Combobox default export became a ComponentFn).
  const imported = [
    ...src.matchAll(/import\s+(\w+)\s+from\s+'\.\.\/(\w+)'/g),
    ...src.matchAll(/import\s+\{\s*(\w+)\s*\}\s+from\s+'\.\.\/(\w+)'/g),
  ]
  for (const [, local, dir] of imported) {
    if (local && dir && new RegExp(`\\b${local}\\.config\\(`).test(src)) {
      return { kind: 'extends', parent: dir }
    }
  }

  return { kind: 'hollow' }
}

/** Resolve the re-config chain: does this component (transitively) delegate? */
function delegates(name: string, seen = new Set<string>()): boolean {
  if (seen.has(name)) return false // cycle guard
  seen.add(name)
  const c = classify(name)
  if (c.kind === 'delegates') return true
  if (c.kind === 'extends') return delegates(c.parent, seen)
  return false
}

describe('primitive-first architecture', () => {
  it('the INTERACTIVE list only names components that exist', () => {
    const dirs = new Set(
      readdirSync(COMPONENTS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name),
    )
    for (const name of INTERACTIVE) expect(dirs.has(name), `${name} is not a component`).toBe(true)
  })

  it('KNOWN_HOLLOW only lists INTERACTIVE components', () => {
    for (const name of Object.keys(KNOWN_HOLLOW)) {
      expect(INTERACTIVE as readonly string[], `${name} is allowlisted but not INTERACTIVE`).toContain(name)
    }
  })

  for (const name of INTERACTIVE) {
    const allowlisted = name in KNOWN_HOLLOW

    if (allowlisted) {
      // Drift detection: when someone finally wires this up, this test fails and
      // tells them to delete the entry — the allowlist can only shrink.
      it(`${name} is still hollow (allowlisted) — delete its KNOWN_HOLLOW entry once wired`, () => {
        expect(
          delegates(name),
          `${name} now delegates to a primitive. Remove it from KNOWN_HOLLOW in this file — the allowlist only shrinks.`,
        ).toBe(false)
      })
    } else {
      it(`${name} delegates behavior + a11y to a *Base primitive`, () => {
        expect(
          delegates(name),
          `${name} is an interactive component but does not wrap a primitive from @pyreon/ui-primitives. ` +
            `Give it \`.config({ component: XBase })\` (or re-config a component that has one). ` +
            `Do NOT add it to KNOWN_HOLLOW — that list only shrinks.`,
        ).toBe(true)
      })
    }
  }

  it('reports the burn-down: every allowlisted component is tracked debt', () => {
    const remaining = Object.keys(KNOWN_HOLLOW).length
    const total = INTERACTIVE.length
    // Locks the count so progress is visible and regressions are impossible.
    // Ratchets DOWN as each PR wires a component: 14 → 13 (Tree) → 12
    // (SegmentedControl) → 11 (Accordion) → 10 (PinInput) → 9 (NumberInput).
    expect(remaining).toBeLessThanOrEqual(8)
    expect(total - remaining).toBeGreaterThanOrEqual(21)
  })
})
