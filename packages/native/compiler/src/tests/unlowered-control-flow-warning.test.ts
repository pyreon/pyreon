// Half the documented control-flow vocabulary silently emitted uncompilable
// native code.
//
// `docs/multiplatform.md` lists eight: `<For>`, `<Show>`, `<Match>`,
// `<Switch>`, `<Suspense>`, `<ErrorBoundary>`, `<Dynamic>`, `<Portal>`.
// Measured against the Swift stub type-check:
//
//   lowers        Show · For · Suspense · ErrorBoundary
//   does NOT      Switch · Match · Dynamic · Portal
//
// The four that do not fall through to the generic component emit, which
// reproduces the tag verbatim — `Switch { Match(when: …) { … } }`,
// `Portal { … }` — and SwiftUI has no such view. Zero warnings, so the first
// sign is a device build failing.
//
// `<Index>` (not in that list, but exported and natural to reach for) is worse:
// it stringifies the render callback INTO a Text,
// `Text(verbatim: "\({ x in … })")`. Nonsense rather than an error, which is
// the harder failure to notice.
//
// Fixed as named warnings with a concrete alternative each, not as four
// lowerings — `<Dynamic>` needs AnyView-style erasure and `<Portal>` is a
// category error on native (sheets and dialogs are a different model, which
// the styling table already called web-only; the control-flow list simply
// disagreed with it).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, validateSwiftWithStubs } from '../validate'

const head = `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
`

const SWITCH = `${head}import { Switch, Match } from '@pyreon/core'
export function C(){ const n=signal(1); return (<Stack><Switch><Match when={n()===1}><Text>one</Text></Match></Switch></Stack>) }`

const PORTAL = `${head}import { Portal } from '@pyreon/core'
export function C(){ return (<Stack><Portal><Text>p</Text></Portal></Stack>) }`

const SHOW = `${head}import { Show } from '@pyreon/core'
export function C(){ const f=signal(true); return (<Stack><Show when={f()}><Text>s</Text></Show></Stack>) }`

const warns = (src: string, target: 'swift' | 'kotlin' = 'swift') =>
  transform(src, { target }).warnings ?? []

describe('control-flow components with no native lowering', () => {
  it('warns for <Switch>, naming the tag', () => {
    const hit = warns(SWITCH).find((w) => w.includes('<Switch>'))
    expect(hit, `no <Switch> warning; got ${JSON.stringify(warns(SWITCH))}`).toBeTruthy()
  })

  it('quotes the error the author would otherwise hit', () => {
    expect(warns(SWITCH).some((w) => w.includes(`cannot find 'Switch' in scope`))).toBe(true)
  })

  it('names a concrete alternative, not just a refusal', () => {
    // Each tag gets its OWN advice — "use <Show>" for Switch, "<Modal>" for
    // Portal — because a generic "unsupported" would leave the author to guess
    // which of the eight documented primitives is safe.
    expect(warns(SWITCH).some((w) => w.includes('<Show>'))).toBe(true)
    expect(warns(PORTAL).some((w) => w.includes('<Modal>'))).toBe(true)
  })

  it('lists what DOES lower, so the author can pick', () => {
    expect(
      warns(PORTAL).some((w) => w.includes('<Show>, <For>, <Suspense>, <ErrorBoundary>')),
    ).toBe(true)
  })

  it('warns on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(warns(PORTAL, target).some((w) => w.includes('<Portal>')), target).toBe(true)
    }
  })

  it('does NOT warn for the four that lower', () => {
    expect(warns(SHOW).filter((w) => w.includes('NO native lowering'))).toEqual([])
  })

  it('does NOT warn for a same-named component from the USER\'s own module', () => {
    const own = `${head}import { Switch } from './my-controls'
export function C(){ return (<Stack><Switch><Text>x</Text></Switch></Stack>) }`
    expect(warns(own).filter((w) => w.includes('NO native lowering'))).toEqual([])
  })

  // The measurement the warning list is derived from. If one of these four ever
  // starts lowering, this fails and the entry should move out of
  // UNLOWERED_CONTROL_FLOW — the list must not outlive the defect.
  it.skipIf(!isSwiftcAvailable())('the four supported ones really do type-check', () => {
    expect(validateSwiftWithStubs(transform(SHOW, { target: 'swift' }).code).ok).toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('<Switch> really does NOT type-check — the warning is earned', () => {
    const res = validateSwiftWithStubs(transform(SWITCH, { target: 'swift' }).code)
    expect(res.ok).toBe(false)
    expect(res.error ?? '').toContain('Switch')
  })
})
