// Same-file custom hooks are inlined into the components that call them before native parsing (`inline-hooks.ts`).
//
// A custom hook's state lives in the component that calls it — that is what a hook IS. Natively that state is view
// state (`@State` / `remember`), which only exists inside a component, so a hook could never be emitted as the
// standalone function the helper path produces: `function useMe(auth) { return useQuery(…) }` was skipped with "return
// type couldn't be inferred", and with it every app that factors its logic into hooks. Inlining puts the state where it
// belongs, and every hook inside is then recognised exactly as if it had been written in the component.
import { describe, expect, it } from 'vitest'
import { inlineCustomHooks } from '../inline-hooks'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const both = ['swift', 'kotlin'] as const

const USE_ME = `import { useOidc } from '@pyreon/auth'
import { useQuery } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'

type Me = { name: string; email: string }

export function useMe(auth: ReturnType<typeof useOidc>) {
  return useQuery<Me>(() => ({
    queryKey: ['me', auth.subject() ?? 'anonymous'],
    queryFn: () =>
      fetch('https://api.example.com/me', {
        headers: { authorization: \`Bearer \${auth.accessToken() ?? ''}\` },
      }).then((r) => r.json()),
    enabled: auth.isAuthenticated(),
  }))
}

export function Account() {
  const auth = useOidc({ issuer: 'https://idp.example', clientId: 'app', redirectUri: 'com.example.app:/cb' })
  const me = useMe(auth)
  return (
    <Stack>
      <Text>{me.data()?.name ?? auth.status()}</Text>
    </Stack>
  )
}
`

const COUNTERS = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'

function useCounter(start: number) {
  const count = signal(start)
  const doubled = computed(() => count() * 2)
  const increment = () => count.set(count() + 1)
  return { count, doubled, increment }
}

function useLabelled(prefix: string) {
  const { count, increment } = useCounter(10)
  const label = computed(() => prefix + count())
  return { label, increment }
}

export function App() {
  const { count, doubled, increment: bump } = useCounter(1)
  const { label, increment } = useLabelled('n=')
  return (
    <Stack>
      <Text>{count()}</Text>
      <Text>{doubled()}</Text>
      <Text>{label()}</Text>
      <Button onPress={bump}>+</Button>
      <Button onPress={increment}>++</Button>
    </Stack>
  )
}
`

describe('a custom hook wrapping a native hook — useMe(auth) → useQuery', () => {
  it('lowers with zero warnings on both targets', () => {
    for (const target of both) expect(transform(USE_ME, { target }).warnings, target).toEqual([])
  })

  it('the query lands in the CALLING component, keyed on the session and sending its token', () => {
    const s = transform(USE_ME, { target: 'swift' }).code
    expect(s).toMatch(/\.task\(id: [^)]*auth\.subject/)
    expect(s).toMatch(/"authorization": "Bearer /)
    expect(s).not.toMatch(/func useMe/)
    const k = transform(USE_ME, { target: 'kotlin' }).code
    expect(k).toMatch(/LaunchedEffect\([^)]*auth\.subject\.value/)
    expect(k).not.toMatch(/fun useMe/)
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(USE_ME, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(USE_ME, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

describe('stateful hooks returning an object, composed', () => {
  it('lowers with zero warnings on both targets', () => {
    for (const target of both) expect(transform(COUNTERS, { target }).warnings, target).toEqual([])
  })

  it('each call gets its OWN state — two counters, not one shared', () => {
    const s = transform(COUNTERS, { target: 'swift' }).code
    expect(s).toMatch(/@State private var count: Int = \(?1\)?/)
    expect(s).toMatch(/@State private var labelledCount: Int = \(?10\)?/)
    const k = transform(COUNTERS, { target: 'kotlin' }).code
    expect(k).toMatch(/var count by remember \{ mutableStateOf\(1L?\) \}/)
    expect(k).toMatch(/var labelledCount by remember \{ mutableStateOf\(10L?\) \}/)
  })

  it('a destructuring rename at the call site is honoured (`increment: bump`)', () => {
    const code = inlineCustomHooks(COUNTERS, 'a.tsx')!.code
    expect(code).toContain('const bump = () => count.set(count() + 1)')
    // The nested hook's increment drives the nested hook's own counter.
    expect(code).toContain('const increment = () => labelledCount.set(labelledCount() + 1)')
    expect(code).not.toMatch(/function use(Counter|Labelled)/)
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(COUNTERS, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(COUNTERS, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

describe('what is not inlined is NAMED, never mis-rewritten', () => {
  const app = (hook: string, call: string) => `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
${hook}
export function App(props: { start: number }) {
  ${call}
  return <Stack><Text>x</Text></Stack>
}
`
  const cases: [string, string, string, RegExp][] = [
    [
      'an early return',
      'function useMaybe(on: boolean) { const v = signal(0); if (on) return v; return v }',
      'const x = useMaybe(true)',
      /useMaybe\(\) is a custom hook that cannot be inlined into App for native: its body has a `if`/,
    ],
    [
      'an argument with a cost',
      'function useStart(n: number) { const v = signal(n); return v }',
      'const x = useStart(Math.max(props.start, 1))',
      /argument 1 \(`Math\.max\(props\.start, 1\)`\) is an expression with a cost or a side effect; bind it to a `const` first/,
    ],
    [
      'an object result read without destructuring',
      'function usePair() { const a = signal(0); const b = signal(1); return { a, b } }',
      'const p = usePair()',
      /the hook returns an object; read it through destructuring/,
    ],
    [
      'a parameter shadowed in a nested function',
      'function useShadow(n: number) { const v = signal(n); const f = (n: number) => v.set(n); return v }',
      'const x = useShadow(1)',
      /`n` is re-declared in a nested scope inside the hook/,
    ],
  ]
  for (const [what, hook, call, msg] of cases) {
    it(what, () => {
      for (const target of both) expect(transform(app(hook, call), { target }).warnings.join('\n'), target).toMatch(msg)
    })
  }

  it('a pure helper that is not a hook keeps the helper path', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
function double(x: number): number { return x * 2 }
export function App() { return <Stack><Text>{double(2)}</Text></Stack> }
`
    expect(inlineCustomHooks(src, 'a.tsx')).toBeNull()
    expect(transform(src, { target: 'swift' }).code).toMatch(/func double/)
  })
})
