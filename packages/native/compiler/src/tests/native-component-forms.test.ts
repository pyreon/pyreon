// Every common component declaration is rewritten into a `function` declaration before native parsing
// (`component-forms.ts`).
//
// Before this, only `function App()` / `export function App()` lowered, and the other spellings failed silently:
// `export default function App()` emitted NOTHING; `const Card = (props: P) => …` became a closure or a prop-less
// helper that `<Card title="x" />` could not construct. Each produced zero warnings. The spec asserts the broken
// artifacts are gone, not just that nothing warned, since nothing warning is what the broken state looked like.
import { describe, expect, it } from 'vitest'
import { normalizeComponentForms } from '../component-forms'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const both = ['swift', 'kotlin'] as const

const APP = `import { Stack, Text, Button } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

type BadgeProps = { label?: string }

const Badge = ({ label = 'new' }: BadgeProps) => <Text>{label}</Text>

export const Counter = (props: { step: number }) => {
  const n = signal(0)
  return (
    <Stack>
      <Text>{n()}</Text>
      <Button onPress={() => n.set(n() + props.step)}>+</Button>
    </Stack>
  )
}

const Title = function (props: { text: string }) {
  return <Text>{props.text}</Text>
}

export default function App() {
  return (
    <Stack>
      <Title text="Hello" />
      <Badge />
      <Counter step={1} />
    </Stack>
  )
}
`

function noWarnings(source: string, target: 'swift' | 'kotlin'): string {
  const r = transform(source, { target, filename: 'App.tsx' })
  expect(r.warnings).toEqual([])
  return r.code
}

describe('arrow, function-expression and default-exported components', () => {
  it.each(both)('each becomes a real component (%s)', (target) => {
    const code = noWarnings(APP, target)
    if (target === 'swift') {
      for (const name of ['Badge', 'Counter', 'Title', 'App']) expect(code).toMatch(new RegExp(`struct ${name}: View \\{`))
      expect(code).not.toMatch(/let (Badge|Counter|Title) = \{|func (Badge|Counter|Title|App)\(/)
      expect(code).toContain('label ?? "new"')
    } else {
      expect(code).toContain('fun Badge(label: String? = null)')
      expect(code).toContain('fun Counter(step: Long)')
      expect(code).toContain('fun Title(text: String)')
      expect(code).toMatch(/@Composable\s+fun App\(\)/)
      expect(code).not.toMatch(/val (Badge|Counter|Title) = \{/)
    }
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

describe('the rewrite itself', () => {
  it('keeps `export`, the parameter list and the return type', () => {
    const out = normalizeComponentForms(`export const Card = (a: { x: number }, b?: string): JSX.Element => <Text>{a.x}</Text>`, 'c.tsx')
    expect(out?.code).toBe('export function Card(a: { x: number }, b?: string): JSX.Element { return <Text>{a.x}</Text> }')
  })

  it('turns `export default function App` into a named export', () => {
    expect(normalizeComponentForms('export default function App() { return <Text>x</Text> }', 'c.tsx')?.code).toBe(
      'export function App() { return <Text>x</Text> }',
    )
  })

  it('leaves a PascalCase const without JSX alone', () => {
    expect(normalizeComponentForms('const Palette = () => ({ red: 1 })', 'c.tsx')).toBeNull()
  })

  it('leaves a lower-case function const alone', () => {
    expect(normalizeComponentForms('const render = () => <Text>x</Text>', 'c.tsx')).toBeNull()
  })

  it('leaves a VIEW FUNCTION alone — called with positional arguments, it already lowers to `@ViewBuilder func`', () => {
    expect(normalizeComponentForms('const Row = (x: number) => { return <Text>{x}</Text> }\nconst y = Row(1)', 'c.tsx')).toBeNull()
  })

  it('leaves a parameterless concise arrow alone — `@ViewBuilder func X()` already serves it', () => {
    expect(normalizeComponentForms('const Hi = () => <Text>hi</Text>\nconst y = <Hi />', 'c.tsx')).toBeNull()
  })

  it('leaves `export default App` (a name) alone', () => {
    expect(normalizeComponentForms('function App() { return <Text>x</Text> }\nexport default App', 'c.tsx')).toBeNull()
  })
})

describe('refusals are named, never silent', () => {
  const cases: [string, string, RegExp][] = [
    ['an anonymous default-exported function', 'export default function () { return <Text>x</Text> }', /anonymous default-exported component/],
    ['an anonymous default-exported arrow', 'export default () => <Text>x</Text>', /anonymous default-exported component/],
    ['an async component', 'const Card = async (p: { a: string }) => <Text>{p.a}</Text>\nconst X = <Card a="x" />', /Card was not lowered to native — it is async/],
    ['a generic component', 'const Card = <T,>(p: { v: T }) => <Text>x</Text>\nconst X = <Card />', /it is generic/],
    ['a component typed on its name', 'const Card: FC<{ a: string }> = (p) => <Text>{p.a}</Text>\nconst X = <Card />', /typed on its name/],
  ]
  it.each(cases)('%s', (_label, source, reason) => {
    const out = normalizeComponentForms(source, 'c.tsx')
    expect(out?.code).toBe(source)
    expect(out?.warnings).toHaveLength(1)
    expect(out?.warnings[0]).toMatch(reason)
  })
})
