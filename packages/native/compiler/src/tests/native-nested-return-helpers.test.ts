// A helper whose every `return` sits inside control flow. The component walk
// only records TOP-LEVEL returns, so `function label(k) { if (…) { return 'a' }
// else { return 'b' } }` used to be dropped with "Component label: no return
// statement found" while the call to it stayed in the emit, and the file did
// not compile on either target. The same walk also parsed `switch` case bodies
// one statement at a time, so a braced case body and a multi-declarator inside
// a case were dropped as well.
import { describe, expect, it } from 'vitest'
import { validateKotlin, validateSwiftWithStubs } from '../validate'
import { transform } from './first-party-plugins'

const app = (helper: string, call = 'String(f(2))') =>
  `import { Text } from '@pyreon/primitives'\n${helper}\nexport function App() { return <Text>{${call}}</Text> }`

const HELPERS: Record<string, string> = {
  'if / else returns': `function f(k: number): number { if (k === 1) { return 1 } else { return 5 } }`,
  'switch returns': `function f(k: number): number { switch (k) { case 1: return 1; default: return 5 } }`,
  'unannotated if / else returns': `function f(k: number) { if (k === 1) { return 'one' } else { return 'many' } }`,
  'braced case body and a multi-declarator in a case': `function f(k: number): number { switch (k) { case 1: { const x = 4; return x } default: const a = 2, b = 3; return a + b } }`,
}

describe('helpers that return only from inside control flow', () => {
  for (const [label, helper] of Object.entries(HELPERS)) {
    it(`${label}: emits a native function on both targets and compiles`, () => {
      const swift = transform(app(helper), { target: 'swift' })
      const kotlin = transform(app(helper), { target: 'kotlin' })
      expect(swift.warnings).toEqual([])
      expect(kotlin.warnings).toEqual([])
      expect(swift.code).toMatch(/func f\(/)
      expect(kotlin.code).toMatch(/fun f\(/)
      const s = validateSwiftWithStubs(swift.code)
      expect(s.ok, s.error).toBe(true)
      const k = validateKotlin(kotlin.code)
      expect(k.ok, k.error).toBe(true)
    })
  }

  it('a lowercase function returning JSX from its branches is not turned into a helper', () => {
    const src = `import { Text } from '@pyreon/primitives'
function row(k: number) { if (k === 1) { return <Text>a</Text> } else { return <Text>b</Text> } }
export function App() { return <Text>x</Text> }`
    // It stays a component: a SwiftUI view / a @Composable, not a value `func`.
    const swift = transform(src, { target: 'swift' }).code
    expect(swift).toContain('struct row: View')
    expect(swift).not.toMatch(/func row\(/)
    expect(transform(src, { target: 'kotlin' }).code).toMatch(/@Composable\s+fun row\(/)
  })

  it('branches that only return null stay a component (the `return null` rule)', () => {
    const src = `import { Text } from '@pyreon/primitives'
function maybe(k: number) { if (k === 1) { return null } else { return null } }
export function App() { return <Text>x</Text> }`
    expect(transform(src, { target: 'swift' }).code).not.toMatch(/func maybe\(/)
  })
})
