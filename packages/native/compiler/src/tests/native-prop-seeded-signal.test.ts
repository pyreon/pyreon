// ─── Signal seeded from a prop (Swift) ────────────────────────────────────────
//
// THE BUG: `function Counter(props: { start: number }) { const n = signal(props.start) }` emitted
//
//   @State private var n: Int = start
//
// A `@State` initializer is a STORED-PROPERTY initializer, which cannot read another member — and a prop IS a member
// (`let start: Int`). `swiftc`: "cannot use instance member 'start' within property initializer". No warning; Kotlin
// was fine (`remember { mutableStateOf(start) }` is in function scope). Seeding local state from a prop — the
// `initialValue` / `defaultValue` pattern — is one of the most common things a component does.
//
// THE FIX: such a signal is declared typed with no initializer and seeded in the component's generated `init`, where
// the prop is the init parameter: `_n = State(initialValue: start)`. A signal seeded from a SIBLING that is itself
// prop-seeded (`doubled = signal(n() * 2)`) is resolved by the existing sibling substitution — a prop read now counts
// as a pure construction-time seed — and lands in the same init.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const COUNTER = [
  "import { Text, Button, Stack } from '@pyreon/primitives'",
  "import { signal, computed } from '@pyreon/reactivity'",
  'function Counter(props: { start: number; label?: string }) {',
  '  const n = signal(props.start)',
  '  const doubled = signal(n() * 2)',
  '  const fixed = signal(0)',
  "  const shown = computed(() => `${props.label ?? 'n'}: ${n()}`)",
  '  return (',
  '    <Stack>',
  '      <Text>{shown()}</Text>',
  '      <Text>{doubled()} {fixed()}</Text>',
  '      <Button onPress={() => n.set(n() + 1)}>+</Button>',
  '    </Stack>',
  '  )',
  '}',
  'export function App() {',
  '  return <Counter start={3} />',
  '}',
].join('\n')

describe('Swift: a signal seeded from a prop', () => {
  const out = transform(COUNTER, { target: 'swift' })

  it('compiles with no warnings', () => {
    expect(out.warnings).toEqual([])
  })

  it('declares it without an initializer and seeds it in the generated init', () => {
    expect(out.code).toContain('@State private var n: Int\n')
    expect(out.code).not.toMatch(/@State private var n: Int = /)
    expect(out.code).toMatch(
      /init\(start: Int, label: String\? = nil\) \{\s+self\.start = start\s+self\.label = label\s+_n = State\(initialValue: start\)/,
    )
  })

  it('seeds a sibling chained from it in the same init', () => {
    expect(out.code).toContain('@State private var doubled: Int\n')
    expect(out.code).toContain('_doubled = State(initialValue: (start) * 2)')
  })

  it('leaves a literal-seeded signal as a plain stored initializer', () => {
    expect(out.code).toContain('@State private var fixed: Int = 0')
    expect(out.code).not.toContain('_fixed = State(')
  })

  it('keeps the call site unchanged — the init reproduces the memberwise one', () => {
    expect(out.code).toContain('Counter(start: 3)')
  })

  it.skipIf(!isSwiftcAvailable())('typechecks', () => {
    const r = validateSwiftWithStubs(out.code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })
})

describe('Swift: the destructured and member forms of the prop read', () => {
  it.each([
    ['a member read', 'function C(props: { v: string }) { const s = signal(props.v); return <Text>{s()}</Text> }'],
    ['an expression over a prop', 'function C(props: { v: number }) { const s = signal(props.v + 1); return <Text>{s()}</Text> }'],
  ])('%s', (_label, body) => {
    const src = `import { Text } from '@pyreon/primitives'\nimport { signal } from '@pyreon/reactivity'\n${body}\nexport function App() { return <C v={1 as never} /> }`
    const r = transform(src, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toMatch(/_s = State\(initialValue: /)
    expect(r.code).not.toMatch(/@State private var s: \S+ = /)
  })
})

describe('Kotlin is unchanged', () => {
  const out = transform(COUNTER, { target: 'kotlin' })

  it('seeds in function scope, as before', () => {
    expect(out.warnings).toEqual([])
    expect(out.code).toMatch(/var n by remember \{ mutableStateOf\(start\) \}/)
  })

  it.skipIf(!isKotlincAvailable())('compiles', () => {
    const r = validateKotlin(out.code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

describe('Swift: a PERSISTED signal seeded from a prop', () => {
  // Its declaration belongs to the persistence plugin (`@AppStorage`), which has no init-seeding form yet. Until it
  // does, the emit must say so rather than ship a stored initializer that reads a prop.
  it('warns by name', () => {
    const src = [
      "import { Text } from '@pyreon/primitives'",
      "import { useStorage } from '@pyreon/storage'",
      'function C(props: { start: number }) {',
      "  const saved = useStorage<number>('d', props.start)",
      '  return <Text>{saved()}</Text>',
      '}',
      'export function App() { return <C start={1} /> }',
    ].join('\n')
    const r = transform(src, { target: 'swift' })
    expect(r.warnings.some((w) => /persisted signal 'saved' \(storage key 'd'\) is seeded from a prop/.test(String(w)))).toBe(true)
  })
})
