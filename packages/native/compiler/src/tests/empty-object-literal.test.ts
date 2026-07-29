// An EMPTY object literal `{}` failed both targets — and on Swift it failed
// SILENTLY, which is the worse half.
//
// Both emitters render a fieldless object as `()` — Swift's empty TUPLE, i.e.
// Void:
//
//   signal({})                     Swift  @State private var u: Any = ()
//                                         COMPILES. The value is Void, not an
//                                         object. Nothing warns.
//                                  Kotlin cannot infer T -> loud failure.
//
//   signal<{ name?: string }>({})  Swift  @State private var u: CU = ()
//                                         "cannot convert value of type '()'"
//                                  Kotlin same -> loud on both.
//
// So the shape was inconsistent ACROSS targets and silent on one of them, which
// is exactly the combination that ships broken apps: the author builds for iOS,
// sees green, and the semantic break surfaces later or on the other platform.
//
// Found by probing nine everyday authoring idioms against both targets. The
// other eight — `&&` conditional children, `.map` over a signal array, nested
// components with props, a handler taking a parameter, template literals,
// computeds, `.filter().length`, and a ternary between two DIFFERENT view types
// — are all clean on both, so this is a narrow gap in an otherwise solid core.
//
// WARNED, NOT LOWERED, deliberately. Emitting an empty struct would fix the
// first shape and not the second: there the literal is empty while the TYPE
// ANNOTATION carries the fields, so a struct synthesized from the literal would
// drop `name` and the later `u().name` would fail regardless. Synthesizing from
// the annotation is a real feature; a warning naming the shape and the fix is
// what is honest to ship today.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'
const R = '@pyreon/reactivity'

const emptyObjWarnings = (src: string, target: 'swift' | 'kotlin') =>
  (transform(src, { target }).warnings ?? []).filter((w) =>
    w.includes('EMPTY object literal'),
  )

describe('empty object literal warns instead of emitting Void', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: signal({}) warns`, () => {
      const src = `import { signal } from '${R}'
        import { Stack, Text } from '${P}'
        export function C() { const u = signal({}); return (<Stack><Text>x</Text></Stack>) }`
      const w = emptyObjWarnings(src, target)
      expect(w).toHaveLength(1)
      // The fix instruction is the point — assert it, not merely that something
      // warned.
      expect(w[0]).toContain('Give the literal its fields')
    })

    it(`${target}: an annotated empty literal warns too`, () => {
      const src = `import { signal } from '${R}'
        import { Stack, Text } from '${P}'
        export function C() {
          const u = signal<{ name?: string }>({})
          return (<Stack><Text>{u().name ?? 'anon'}</Text></Stack>)
        }`
      expect(emptyObjWarnings(src, target)).toHaveLength(1)
    })
  }

  it('Swift really did emit Void — the silent half of the bug', () => {
    const src = `import { signal } from '${R}'
      import { Stack, Text } from '${P}'
      export function C() { const u = signal({}); return (<Stack><Text>x</Text></Stack>) }`
    // Documents WHY a warning is warranted for a shape that compiles: `()` is
    // Void. If a future change lowers this to a real empty struct, this
    // assertion should be updated deliberately, not deleted.
    expect(transform(src, { target: 'swift' }).code ?? '').toContain('= ()')
  })
})

// THE GUARD. Over-warning turns a diagnostic into noise people learn to ignore,
// and object literals are everywhere — every hook config, every nested message
// map. Each of these contains object literals and must stay SILENT.
describe('does NOT warn on legitimate object literals', () => {
  const CASES: Array<[string, string]> = [
    [
      'a non-empty literal',
      `import { signal } from '${R}'
       import { Stack, Text } from '${P}'
       export function C() { const u = signal({ name: 'a' }); return (<Stack><Text>{u().name}</Text></Stack>) }`,
    ],
    [
      'a spread-only literal (no fields, but not empty)',
      `import { signal } from '${R}'
       import { Stack, Text } from '${P}'
       export function C() {
         const b = signal({ n: 1 })
         const u = signal({ ...b() })
         return (<Stack><Text>{u().n}</Text></Stack>)
       }`,
    ],
    [
      'a nested i18n message map',
      `import { createI18n } from '@pyreon/i18n'
       import { Stack, Text } from '${P}'
       export function C() {
         const i = createI18n({ locale: 'en', messages: { en: { hi: 'Hi' } } })
         return (<Stack><Text>{i.t('hi')}</Text></Stack>)
       }`,
    ],
    [
      'a machine config',
      `import { createMachine } from '@pyreon/machine'
       import { Stack, Text } from '${P}'
       export function C() {
         const m = createMachine({ initial: 'off', states: { off: { on: { GO: 'on' } }, on: { on: { GO: 'off' } } } })
         return (<Stack><Text>{m()}</Text></Stack>)
       }`,
    ],
    [
      'a defineStore setup',
      `import { defineStore } from '@pyreon/store'
       import { signal } from '${R}'
       import { Stack, Text } from '${P}'
       const useApp = defineStore('app', () => { const n = signal(1); return { n } })
       export function C() { const s = useApp(); return (<Stack><Text>{s.store.n()}</Text></Stack>) }`,
    ],
  ]
  for (const [label, src] of CASES) {
    for (const target of ['swift', 'kotlin'] as const) {
      it(`${target}: ${label} stays silent`, () => {
        expect(emptyObjWarnings(src, target)).toEqual([])
      })
    }
  }
})
