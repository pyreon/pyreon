// Component-scope destructuring beyond the flat shapes (deferred item O41).
//
// Before: only `const { x, y } = …` and `const [a, b] = …` lowered. A nested
// pattern, an array hole or a trailing array rest warned and the whole
// declaration was skipped, so ordinary code like `const { user: { name } } =
// profile()` or `const [head, ...tail] = items()` did not cross to native.
//
// Now every binding is recorded as a PATH from one synthesized container
// (`__pyDestrN`): `.user.name`, `[0]`, `.slice(1)` — the same IR the explicit
// shapes (`profile().user.name`, `xs()[0]`, `xs().slice(1)`) produce, so emit
// and type inference reuse proven paths. What still warns is what an alias
// cannot express faithfully: an OBJECT rest (a new object without the named
// keys), a default (JS applies it only for `undefined`, which native cannot
// tell from `null`), and a NESTED pattern over a hook result (its fields are
// signal accessors, which do not destructure).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { transform as transformWithPlugins } from './first-party-plugins'
import { destructureBindings } from '../parse'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const SRC = `import { Stack, Text } from '@pyreon/primitives'
type User = { name: string; tags: string[] }
type Profile = { user: User; score: number }
function App() {
  const profile = signal<Profile>({ user: { name: 'ada', tags: ['a', 'b', 'c'] }, score: 3 })
  const xs = signal<number[]>([10, 20, 30, 40])
  const { user: { name, tags: [firstTag] }, score } = profile()
  const [head, , third, ...tail] = xs()
  return (
    <Stack>
      <Text>{name}</Text>
      <Text>{firstTag}</Text>
      <Text>{String(score + head + third)}</Text>
      <Text>{String(tail.length)}</Text>
    </Stack>
  )
}`

describe('nested / hole / rest destructuring at component scope', () => {
  it('records every binding as a path from the destructured value', () => {
    const pattern = {
      type: 'ObjectPattern',
      properties: [
        {
          type: 'Property',
          key: { type: 'Identifier', name: 'a' },
          value: {
            type: 'ArrayPattern',
            elements: [{ type: 'Identifier', name: 'x' }, null, { type: 'RestElement', argument: { type: 'Identifier', name: 'r' } }],
          },
        },
      ],
    }
    expect(Object.fromEntries(destructureBindings(pattern)!)).toEqual({
      x: [{ field: 'a' }, { index: 0 }],
      r: [{ field: 'a' }, { sliceFrom: 2 }],
    })
  })

  it('lowers to path reads off one container on both targets, with no warnings', () => {
    const swift = transform(SRC, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toMatch(/__pyDestr\d+\.user\.name/)
    expect(swift.code).toMatch(/__pyDestr\d+\.user\.tags\[0\]/)
    expect(swift.code).toMatch(/__pyDestr\d+\[2\]/)
    const kotlin = transform(SRC, { target: 'kotlin' })
    expect(kotlin.warnings).toEqual([])
    expect(kotlin.code).toMatch(/__pyDestr\d+\.user\.name/)
    expect(kotlin.code).toMatch(/__pyDestr\d+\[2\]/)
  })

  it('what an alias cannot express still warns by name and never half-binds', () => {
    for (const bad of [
      'const { score, ...others } = profile()',
      'const { score = 1 } = profile()',
      'const [h = 0] = xs()',
    ]) {
      const src = SRC.replace(/  const \{ user: [^\n]*\n  const \[head[^\n]*\n/, `  ${bad}\n`).replace(
        /<Stack>[\s\S]*<\/Stack>/,
        '<Stack><Text>x</Text></Stack>',
      )
      const r = transform(src, { target: 'swift' })
      expect(r.warnings.join('\n'), bad).toContain('destructuring in this shape')
      expect(r.code, bad).not.toContain('__pyDestr')
    }
  })

  it('a nested pattern over a hook result stays a warning (its fields are accessors)', () => {
    const src = `import { useFetch } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
function App() {
  const { data: { id } } = useFetch('https://x/y')
  return (<Stack><Text>x</Text></Stack>)
}`
    expect(transformWithPlugins(src, { target: 'swift' }).warnings.join('\n')).toContain('useFetch() destructure form')
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
    const v = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('Kotlin emit compiles', () => {
    const v = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(v.ok, v.error).toBe(true)
  })
})
