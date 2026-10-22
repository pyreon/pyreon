// Props destructuring is rewritten into `props.x` reads before native parsing (`props-destructure.ts`).
//
// A native component's props ARE its fields, so `props.title` lowers to `title`. Two common destructuring shapes did
// not lower, and both compiled with ZERO warnings into code `swiftc` / `kotlinc` reject:
// - `const { title, count: n } = props` in the body emitted `let __pyDestr0 = props`, a `props` that does not exist;
// - a destructured parameter with a rename or a default declared NO props, so the body read unbound names.
// Every zero-warning spec here also asserts the broken artifacts are gone, because zero warnings is exactly what the
// broken state looked like.
import { describe, expect, it } from 'vitest'
import { rewritePropsDestructuring } from '../props-destructure'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const both = ['swift', 'kotlin'] as const

const BODY = `import { Stack, Text } from '@pyreon/primitives'

function Card(props: { title: string; count: number; size?: string }) {
  const { title, count: n, size = 'm' } = props
  return (
    <Stack>
      <Text>{title}: {n}</Text>
      <Text>{size}</Text>
    </Stack>
  )
}

export function App() {
  return <Card title="x" count={2} />
}
`

const PARAM = `import { Stack, Text } from '@pyreon/primitives'

type CardProps = { title: string; count: number; size?: string }

function Card({ title, count: n, size = 'm' }: CardProps) {
  return (
    <Stack>
      <Text>{title}: {n}</Text>
      <Text>{size}</Text>
    </Stack>
  )
}

function Badge({ label = 'new' }: { label?: string }) {
  return <Text>{label}</Text>
}

export function App() {
  return (
    <Stack>
      <Card title="x" count={2} size="l" />
      <Badge />
    </Stack>
  )
}
`

function noWarnings(source: string, target: 'swift' | 'kotlin'): string {
  const r = transform(source, { target, filename: 'Card.tsx' })
  expect(r.warnings).toEqual([])
  return r.code
}

describe('const { … } = props in the body', () => {
  it.each(both)('lowers each name to its field, with renames and defaults (%s)', (target) => {
    const code = noWarnings(BODY, target)
    expect(code).not.toMatch(/__pyDestr|\bprops\b/)
    if (target === 'swift') {
      expect(code).toContain('Text(verbatim: "\\(title): \\(count)")')
      expect(code).toContain('size ?? "m"')
    } else {
      expect(code).toContain('Text(text = "${title}: ${count}")')
      expect(code).toContain('size ?: "m"')
    }
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(BODY, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(BODY, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

describe('a destructured parameter with renames and defaults', () => {
  it.each(both)('declares every prop and reads it through its field (%s)', (target) => {
    const code = noWarnings(PARAM, target)
    if (target === 'swift') {
      expect(code).toMatch(/struct Card: View \{\s+let title: String\s+let count: Int\s+var size: String\? = nil/)
      expect(code).toMatch(/struct Badge: View \{\s+var label: String\? = nil/)
      expect(code).toContain('label ?? "new"')
    } else {
      expect(code).toContain('fun Card(title: String, count: Long, size: String? = null)')
      expect(code).toContain('fun Badge(label: String? = null)')
      expect(code).toContain('label ?: "new"')
    }
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(PARAM, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(PARAM, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

describe('the rewrite itself', () => {
  it('reads a shorthand object property through its field', () => {
    const out = rewritePropsDestructuring(
      `function Card(props: { id: string }) { const { id } = props; return <Text>{JSON.stringify({ id })}</Text> }`,
      'c.tsx',
    )
    expect(out?.code).toContain('{ id: props.id }')
  })

  it('picks a fresh parameter name when the body already uses `props`', () => {
    const out = rewritePropsDestructuring(
      `function Card({ a = 1 }: { a?: number }) { const props = 2; return <Text>{a + props}</Text> }`,
      'c.tsx',
    )
    expect(out?.code).toContain('function Card(props1: { a?: number })')
    expect(out?.code).toContain('(props1.a ?? 1) + props')
  })

  it('leaves the plain `{ a, b }` parameter alone — the parser already lowers it', () => {
    expect(rewritePropsDestructuring(`function Card({ a, b }: { a: string; b: string }) { return <Text>{a}{b}</Text> }`, 'c.tsx')).toBeNull()
  })

  it('leaves a lower-case function alone', () => {
    expect(rewritePropsDestructuring(`function format({ a = 1 }: { a?: number }) { return a }`, 'c.tsx')).toBeNull()
  })

  it('leaves a destructure of something other than the props parameter alone', () => {
    expect(
      rewritePropsDestructuring(`function Card(props: { o: { x: number } }) { const { x } = props.o; return <Text>{x}</Text> }`, 'c.tsx'),
    ).toBeNull()
  })
})

describe('refusals are named, never silent', () => {
  const cases: [string, string, RegExp][] = [
    ['a rest element', `function Card({ a, ...rest }: { a: string; b: string }) { return <Text>{a}</Text> }`, /rest element/],
    ['a nested pattern', `function Card({ o: { x } }: { o: { x: number } }) { return <Text>{x}</Text> }`, /nested pattern/],
    ['a computed key', `function Card(props: { a: string }) { const { ['a']: a } = props; return <Text>{a}</Text> }`, /computed key/],
    ['`let`', `function Card(props: { a: string }) { let { a } = props; return <Text>{a}</Text> }`, /only `const`/],
    ['no annotation', `function Card({ a = 'x' }) { return <Text>{a}</Text> }`, /no type annotation/],
    [
      'a default reading another prop',
      `function Card({ a, b = a }: { a: string; b?: string }) { return <Text>{b}</Text> }`,
      /default of `b` reads `a`/,
    ],
    [
      'a name re-declared in a nested function',
      `function Card({ a = 'x' }: { a?: string }) { const f = (a: string) => a; return <Text>{f(a)}</Text> }`,
      /`a` is declared again/,
    ],
  ]
  it.each(cases)('%s', (_label, source, reason) => {
    const out = rewritePropsDestructuring(source, 'c.tsx')
    expect(out?.code).toBe(source)
    expect(out?.warnings).toHaveLength(1)
    expect(out?.warnings[0]).toMatch(/^Component Card: props destructuring was not lowered to native/)
    expect(out?.warnings[0]).toMatch(reason)
  })

  it.each(both)('the warning reaches the transform result (%s)', (target) => {
    const r = transform(`import { Text } from '@pyreon/primitives'
export function Card({ a, ...rest }: { a: string; b: string }) { return <Text>{a}</Text> }`, { target, filename: 'c.tsx' })
    expect(r.warnings.some((w) => /props destructuring was not lowered to native/.test(String(w)))).toBe(true)
  })
})
