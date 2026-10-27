// A top-level function that returns no value is a side-effect HELPER, not a component.
//
// `function notify(msg: string) { toast(msg) }` was classified as a component, reported as "Component notify: no return
// statement found; skipping.", and DROPPED — while every call to it stayed in the emit, so the file failed to compile
// on both targets. A component must return JSX, so a lowercase function with no value return and no JSX is a void
// helper: it lowers to a plain `func` / `fun` with no result type.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const head = `import { Text, Press } from '@pyreon/primitives'
import { toast } from '@pyreon/toast'
`
const app = (call: string): string =>
  `export function P() { return <Press onPress={() => ${call}}><Text>Go</Text></Press> }\n`

const SHAPES: Record<string, string> = {
  'a one-statement helper': `${head}function notify(msg: string) { toast(msg) }\n${app('notify("Hi")')}`,
  'an early bare return': `${head}function maybe(msg: string, on: boolean) { if (!on) return; toast(msg) }\n${app('maybe("Hi", true)')}`,
  'locals and a loop': `${head}function each(xs: string[]) { for (const x of xs) { const m = x + "!"; toast(m) } }\n${app('each(["a"])')}`,
  'no parameters': `${head}function ping() { toast("ping") }\n${app('ping()')}`,
}

describe('top-level void helpers', () => {
  for (const [label, src] of Object.entries(SHAPES)) {
    describe(label, () => {
      it('lowers with no warning and keeps the helper', () => {
        for (const target of ['swift', 'kotlin'] as const) {
          const r = transform(src, { target })
          expect(r.warnings, target).toEqual([])
          expect(r.code, target).toMatch(target === 'swift' ? /\bfunc (notify|maybe|each|ping)\(/ : /\bfun (notify|maybe|each|ping)\(/)
        }
      })

      it('declares no result type', () => {
        expect(transform(src, { target: 'swift' }).code).not.toMatch(/func (notify|maybe|each|ping)\([^)]*\) ->/)
        expect(transform(src, { target: 'kotlin' }).code).not.toMatch(/fun (notify|maybe|each|ping)\([^)]*\):/)
      })

      it.runIf(isSwiftcAvailable())('Swift emit typechecks', () => {
        const v = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
        expect(v.ok, v.error).toBe(true)
      })

      it.runIf(isKotlincAvailable())('Kotlin emit typechecks', () => {
        const v = validateKotlin(transform(src, { target: 'kotlin' }).code)
        expect(v.ok, v.error).toBe(true)
      })
    })
  }

  it('a PascalCase function with no return is still a component missing its JSX, and still warns', () => {
    const src = `import { Text } from '@pyreon/primitives'
function Broken(p: { a: string }) { const x = p.a }
export function P() { return <Text>x</Text> }
`
    expect(transform(src, { target: 'swift' }).warnings).toContain('Component Broken: no return statement found; skipping.')
  })

  it('a helper that returns a value is unchanged: it keeps its inferred result type', () => {
    const src = `${head}function twice(n: number) { return n * 2 }\n${app('toast(String(twice(2)))')}`
    expect(transform(src, { target: 'swift' }).code).toMatch(/func twice\(_ n: Int\) -> Int/)
  })
})
