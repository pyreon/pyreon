// `createMachine` / `createI18n` / `syncedSignal` lower to native ONLY inside a
// component body — they become a `remember {}` / an `@State`, which has no
// meaning at file scope. Their recognizers live in the component-body statement
// walk and are structurally unreachable from the module-scope walk.
//
// So a module-scope declaration fell straight through to the module-decl
// catch-all, which printed the call VERBATIM into Swift/Kotlin with ZERO
// diagnostics. The native build then failed naming a function the user never
// wrote in that language, with nothing pointing at the real problem — which was
// only ever the PLACEMENT.
//
// This was found by two independent audits of the coverage registry: three of
// its snippets were written this way and had been reported as "crossing"
// because the gate counted warnings and there were none to count.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const atModuleScope = (call: string, imp: string) => `
import { ${imp} } from '@pyreon/${imp === 'createMachine' ? 'machine' : imp === 'createI18n' ? 'i18n' : 'sync'}'
import { Stack, Text } from '@pyreon/primitives'
const thing = ${call}
export function C() { return (<Stack><Text>x</Text></Stack>) }
`

const CASES: ReadonlyArray<[string, string]> = [
  ['createMachine', `createMachine({ initial: 'off', states: { off: { on: { T: 'on' } } } })`],
  ['createI18n', `createI18n({ locale: 'en', messages: { en: { hello: 'Hello' } } })`],
  ['syncedSignal', `syncedSignal({ doc, key: 'count', initial: 0 })`],
]

describe('a component-body-only lowering declines by NAME at module scope', () => {
  for (const [name, call] of CASES) {
    it(`${name} warns instead of falling through silently`, () => {
      const { warnings } = transform(atModuleScope(call, name), { target: 'swift' })
      const w = warnings.find((x) => x.includes(`${name}()`))
      expect(w, `no warning naming ${name}`).toBeDefined()
      // The message must say the SHAPE is fine and the PLACEMENT is not. A
      // generic "unsupported" sends someone hunting for a missing feature that
      // is in fact implemented one scope down.
      expect(w).toContain('INSIDE a component body')
      expect(w).toContain('module scope')
    })

    it(`${name} is no longer reproduced verbatim in the emit`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const { code } = transform(atModuleScope(call, name), { target })
        // Free call only — a member call would be a correct lowering.
        expect(new RegExp(`(^|[^.\\w])${name}\\s*\\(`, 'm').test(code)).toBe(false)
      }
    })
  }

  it('still lowers CLEANLY when the same call sits inside the component', () => {
    // The half that proves the fix targets placement and not the feature: move
    // the identical call one scope down and it lowers with no warnings at all.
    const src = `
import { createMachine } from '@pyreon/machine'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const toggle = createMachine({ initial: 'off', states: { off: { on: { T: 'on' } } } })
  return (<Stack><Text>{toggle()}</Text></Stack>)
}
`
    const r = transform(src, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonMachine(')
  })
})
