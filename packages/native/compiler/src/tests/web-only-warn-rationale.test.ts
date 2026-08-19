// The blanket web-only warning used to give IDENTICAL advice for every
// package in the set — "render it behind a `<Web>` escape hatch". That set
// spans a linter, a `<head>` manager, a virtualization library and an
// animation engine, and the advice is wrong for most of them:
//
//   - `@pyreon/lint` is dev-time tooling that never reaches a component.
//   - `@pyreon/head` has no device analogue at all.
//   - `@pyreon/virtual` has a BETTER native answer — native lists are lazy by
//     construction, so a WebView is strictly worse than `<For>` in `<Scroll>`.
//   - `@pyreon/kinetic`'s preset vocabulary genuinely DOES cross via
//     `<Transition name>`, so the old advice steered users away from a working
//     native path.
//
// The reason now comes from each package's manifest `rationale` — the one
// place that truth is already written, and already required for web-only by
// `check-multiplatform-tier`. That gate regenerates this mapping, so it
// cannot drift from the docs tier table.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const importing = (pkg: string, sym: string) => `
  import { Stack } from '@pyreon/primitives'
  import { ${sym} } from '${pkg}'
  export function C() { const v = ${sym}; return (<Stack><Stack/></Stack>) }
`

const webOnlyWarn = (pkg: string, sym: string): string => {
  const warnings = transform(importing(pkg, sym), { target: 'swift' }).warnings ?? []
  // The per-SYMBOL hook warning also fires for hook-shaped exports; this is
  // the blanket package-level one.
  return warnings.find((w) => w.startsWith(pkg)) ?? ''
}

describe('the web-only warning carries the package’s own reason', () => {
  it.each([
    // pkg, sym, a distinctive phrase from that package's manifest rationale
    ['@pyreon/virtual', 'useVirtualizer', 'native lists are lazy by construction'],
    ['@pyreon/head', 'useHead', 'no equivalent surface exists on iOS/Android'],
    ['@pyreon/lint', 'lintFile', 'runs at dev time, not app runtime'],
    // `@pyreon/dnd` is deliberately NOT here any more: `useSortable` lowers to
    // the native PyreonSortableState engine, so the package declares a
    // `nativeFrontend` and is no longer in the blanket web-only set. Its
    // still-web members (useDraggable / useDroppable / useDragMonitor /
    // useFileDrop) warn per-HOOK by name instead, which is strictly more
    // actionable than a package-wide sentence — asserted in
    // `native-sortable.test.ts`, so dropping the row loses no coverage.
  ])('%s explains itself', (pkg, sym, phrase) => {
    expect(webOnlyWarn(pkg, sym)).toContain(phrase)
  })

  it('does NOT give four different packages one identical sentence', () => {
    // Compare with the package NAME STRIPPED. Every message opens with the
    // name, so comparing raw strings finds four "distinct" messages even when
    // the advice is byte-identical — which is exactly the bug this locks.
    const body = (pkg: string, sym: string) => webOnlyWarn(pkg, sym).replaceAll(pkg, '')
    const reasons = [
      body('@pyreon/virtual', 'useVirtualizer'),
      body('@pyreon/head', 'useHead'),
      body('@pyreon/lint', 'lintFile'),
      body('@pyreon/kinetic', 'kinetic'),
    ]
    expect(new Set(reasons).size).toBe(4)
  })

  it('still names the escape hatch, but AFTER the native-first advice', () => {
    const w = webOnlyWarn('@pyreon/charts', 'Chart')
    expect(w).toContain('<Web>')
    // Native-equivalent first: the escape hatch is right for a genuine
    // rendering engine, but it was previously the ONLY option offered, for
    // every package in the set.
    expect(w.indexOf('@pyreon/primitives')).toBeLessThan(w.indexOf('<Web>'))
  })

  it('falls back to generic phrasing for a package with no manifest', () => {
    // ui-components/ui-primitives are the two hand-listed entries — they have
    // no manifest to read a rationale from, so the sentence must still parse.
    const w = webOnlyWarn('@pyreon/ui-components', 'Button')
    expect(w).toContain('renders via the DOM')
    expect(w).not.toContain('undefined')
  })

  it('never emits a double em-dash (several rationales contain their own)', () => {
    // `@pyreon/head`'s rationale has an em-dash in it; joining with another
    // one produced two in a sentence, which reads as a typo.
    const w = webOnlyWarn('@pyreon/head', 'useHead')
    const upToAdvice = w.slice(0, w.indexOf('On native'))
    expect(upToAdvice.split('—').length - 1).toBeLessThanOrEqual(1)
  })
})
