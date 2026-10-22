// An object spread whose SOURCE is not a bare identifier — the signal read `u.set({ ...u(), age: n })`, a member
// `{ ...props.user, name }`, a call `{ ...defaults(), x }` — lowers like the identifier form: Swift
// `{ var c = <source>; c.age = …; return c }()`, Kotlin `<source>.copy(age = …)`.
//
// THE BUG: the shared planner bailed for every non-identifier source, which fell into the plain-literal path and
// DROPPED the spread: `{ ...u(), age: n }` became a tuple holding only `age` — `(age: …)` — on both targets, which
// does not compile, with no warning. The signal-read form is the commonest immutable update there is. Both lowerings
// evaluate the source once, so the identifier restriction never protected anything; what matters is whether the
// source's FIELDS are known, and when they are not the emit is now named rather than dropped.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const both = ['swift', 'kotlin'] as const

const APP = [
  "import { Button, Stack, Text } from '@pyreon/primitives'",
  "import { signal, computed } from '@pyreon/reactivity'",
  'type U = { name: string; age: number }',
  'function defaults(): U {',
  "  return { name: 'anon', age: 0 }",
  '}',
  'function Card(props: { user: U }) {',
  '  const renamed = computed<U>(() => ({ ...props.user, name: props.user.name + "!" }))',
  '  return <Text>{renamed().name}</Text>',
  '}',
  'export function App() {',
  "  const u = signal<U>({ name: 'a', age: 1 })",
  '  return (',
  '    <Stack>',
  '      <Button onPress={() => u.set({ ...u(), age: u().age + 1 })}>{String(u().age)}</Button>',
  '      <Button onPress={() => u.set({ ...defaults(), age: 5 })}>reset</Button>',
  '      <Card user={u()} />',
  '    </Stack>',
  '  )',
  '}',
].join('\n')

describe('a spread whose source is not a bare identifier', () => {
  it.each(both)('keeps every inherited field (%s)', (target) => {
    const r = transform(APP, { target })
    expect(r.warnings).toEqual([])
    if (target === 'swift') {
      expect(r.code).toContain('u = { var c = u; c.age = u.age + 1; return c }()')
      expect(r.code).toContain('u = { var c = defaults(); c.age = 5; return c }()')
      expect(r.code).toMatch(/\{ var c = user; c\.name = user\.name \+ "!"; return c \}\(\)/)
      expect(r.code).not.toMatch(/= \(age: /)
      // The spread result has its source's type, so a computed returning it is typed — not `Any`.
      expect(r.code).toContain('private var renamed: U {')
    } else {
      expect(r.code).toContain('u = u.copy(age = u.age + 1L)')
      expect(r.code).toContain('u = defaults().copy(age = 5L)')
      expect(r.code).toMatch(/user\.copy\(name = user\.name \+ "!"\)/)
      expect(r.code).not.toMatch(/= \(age = /)
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

describe('a source whose type cannot be inferred', () => {
  it.each(both)('is emitted with its overrides AND named, never dropped (%s)', (target) => {
    const src = [
      "import { Button } from '@pyreon/primitives'",
      "import { signal } from '@pyreon/reactivity'",
      'type U = { name: string; age: number }',
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any -- an untyped source is the case under test',
      'export function Editor(props: { draft: any }) {',
      "  const u = signal<U>({ name: 'a', age: 1 })",
      '  return <Button onPress={() => u.set({ ...props.draft, age: 2 })}>x</Button>',
      '}',
    ].join('\n')
    const r = transform(src, { target })
    // Exactly once: the expression is emitted more than once on Kotlin, and the warning must not repeat.
    expect(r.warnings.filter((w) => /type of the spread source `draft` could not be inferred/.test(String(w)))).toHaveLength(1)
    expect(r.code).toMatch(target === 'swift' ? /var c = draft; c\.age = 2/ : /draft\.copy\(age = 2L\)/)
  })
})
