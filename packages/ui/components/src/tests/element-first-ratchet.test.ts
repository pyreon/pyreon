/**
 * ELEMENT-FIRST RATCHET (2026-07-21 architecture decision): layout belongs to
 * Element PROPS (contentDirection/contentAlignX/contentAlignY/gap on the
 * content axis; direction/alignX/alignY on the slot axis), NOT hand-written
 * `display` CSS in rocketstyle themes.
 *
 * Two locks, primitive-first.test.ts-style burn-down semantics:
 *
 * 1. DISPLAY ALLOWLIST — the set of component files still using `display:` in
 *    a theme can only SHRINK. Converting a component to Element props?
 *    Remove it from the list in the SAME PR. Adding `display:` to a NEW
 *    component fails this test — use Element content-axis props instead.
 * 2. CONTENT-AXIS INVARIANT — an Element-backed component whose `.attrs()`
 *    declares the slot-axis `direction` must ALSO declare `contentDirection`:
 *    on a SIMPLE (slot-less) element the slot axis is INERT (children follow
 *    the content axis, default `rows`), so slot-axis-only attrs are a latent
 *    "my children stack vertically" bug (the NavLink icon+label case).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const COMPONENTS_DIR = join(__dirname, '../components')

// Files still carrying `display:` in a theme — BURN-DOWN ONLY (never add).
// Most are primitive-backed components awaiting their batteries-included
// Element conversion (Rating/TagsInput/RangeSlider are already converted).
const DISPLAY_ALLOWLIST = new Set([
  'Accordion',
  'Badge',
  'Checkbox',
  'Code',
  'ColorSwatch',
  'Dialog',
  'Drawer',
  'Image',
  'Indicator',
  'Kbd',
  'Loader',
  'Modal',
  'MultiSelect',
  'NumberInput',
  'PinInput',
  'Radio',
  'RangeSlider',
  'SegmentedControl',
  'Switch',
  'Tabs',
  'Tree',
])

const componentSources = (): Array<{ name: string; src: string }> =>
  readdirSync(COMPONENTS_DIR).flatMap((name) => {
    for (const f of ['index.ts', 'index.tsx']) {
      try {
        return [{ name, src: readFileSync(join(COMPONENTS_DIR, name, f), 'utf8') }]
      } catch {
        /* try next */
      }
    }
    return []
  })

describe('element-first ratchet', () => {
  it('display: in themes only shrinks (allowlist ratchet)', () => {
    const offenders = componentSources()
      .filter(({ src }) => /display: '/.test(src))
      .map(({ name }) => name)

    const newOffenders = offenders.filter((n) => !DISPLAY_ALLOWLIST.has(n))
    expect(
      newOffenders,
      `NEW display: CSS in ${newOffenders.join(', ')} — use Element content-axis props ` +
        '(contentDirection/contentAlignX/contentAlignY) instead; see the element-first decision.',
    ).toEqual([])

    // Burn-down bookkeeping: a converted component must leave the allowlist.
    const stale = [...DISPLAY_ALLOWLIST].filter((n) => !offenders.includes(n))
    expect(
      stale,
      `Converted components still on the allowlist — remove: ${stale.join(', ')}`,
    ).toEqual([])
  })

  it('slot-axis direction in .attrs() is always paired with contentDirection', () => {
    const unpaired = componentSources()
      .filter(({ src }) => {
        // Only inspect .attrs blocks (not themes/comments) — cheap heuristic:
        // a direction: within 400 chars after ".attrs(" without a
        // contentDirection anywhere in the file.
        const attrsIdx = src.indexOf('.attrs(')
        if (attrsIdx === -1) return false
        const window = src.slice(attrsIdx, attrsIdx + 800)
        return /direction: '(inline|rows|reverseInline|reverseRows)'/.test(window) &&
          !src.includes('contentDirection')
      })
      .map(({ name }) => name)
    expect(
      unpaired,
      `slot-axis direction without contentDirection (inert on simple elements): ${unpaired.join(', ')}`,
    ).toEqual([])
  })
})
