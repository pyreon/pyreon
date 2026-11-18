import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'

/**
 * Configuration the native emit does not lower is NAMED, never dropped in silence.
 *
 * Each of these compiled cleanly with ZERO warnings while the native app behaved differently from the web:
 *   - `useQuery({ …, enabled: false, refetchInterval: 5000 })` — fetched on mount anyway and never polled;
 *   - `useForm({ onSubmit: save })` — `handleSubmit()` submitted nothing; `initialValues: { age: 18 }` lost the field;
 *   - `createMachine` with `{ target: 'open' }` transitions — `send('OPEN')` did nothing; `always` never fired;
 *   - `createI18n` nested messages — `t('nav.home')` printed the key; a `loader` never ran;
 *   - a module-scope `count.set(5)` — native rendered the seed.
 * The `{ target }` and nested-message shapes now LOWER; the rest warn by name on both targets.
 */
const warningsOf = (src: string): string[] => {
  const sw = transform(src, { target: 'swift' }).warnings
  const kt = transform(src, { target: 'kotlin' }).warnings
  expect(kt.length, 'both targets warn alike').toBe(sw.length)

  return sw
}

describe('dropped configuration is named on native', () => {
  it('useQuery: an option outside queryKey / queryFn / staleTime is named', () => {
    const w = warningsOf(`import { useQuery } from '@pyreon/query'
type Todo = { id: number; title: string }
export function App() {
  const q = useQuery<Todo>(() => ({ queryKey: ['t'], queryFn: () => fetch('https://x/t').then((r) => r.json()), enabled: false, refetchInterval: 5000 }))
  return <Text>{q.data()?.title ?? ''}</Text>
}`)
    expect(w.some((m) => m.includes('useQuery option `refetchInterval`') && m.includes('IGNORED'))).toBe(true)
    expect(w.some((m) => m.includes('useQuery option `enabled`')), '`enabled` lowers').toBe(false)
  })

  it('useQuery: `enabled` LOWERS — it gates the request and re-runs the harness when it flips', () => {
    // The documented authenticated-request pattern: native used to fetch on mount with no session.
    const src = `import { useQuery } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
type Me = { name: string }
export function App() {
  const session = signal<string | null>(null)
  const me = useQuery<Me>(() => ({ queryKey: ['me'], queryFn: () => fetch('https://x/me').then((r) => r.json()), enabled: session() !== null }))
  return <Text>{me.data()?.name ?? ''}</Text>
}`
    expect(warningsOf(src)).toEqual([])
    const sw = transform(src, { target: 'swift' }).code ?? ''
    expect(sw).toContain('.task(id: "\\("me")|\\(session != nil)") {')
    expect(sw).toMatch(/if session != nil \{\n\s+await me\.run \{/)
    const kt = transform(src, { target: 'kotlin' }).code ?? ''
    expect(kt).toContain('LaunchedEffect(Unit, session != null) {')
    expect(kt).toMatch(/if \(session != null\) \{\n\s+me\.run\(/)
  })

  it('useQuery: the lowered options alone stay silent', () => {
    const w = warningsOf(`import { useQuery } from '@pyreon/query'
type Todo = { id: number; title: string }
export function App() {
  const q = useQuery<Todo>(() => ({ queryKey: ['t'], queryFn: () => fetch('https://x/t').then((r) => r.json()), staleTime: 1000 }))
  return <Text>{q.data()?.title ?? ''}</Text>
}`)
    expect(w.filter((m) => m.includes('useQuery'))).toEqual([])
  })

  it('useForm: a function-reference onSubmit, a non-string initial value and an unknown option are named', () => {
    const w = warningsOf(`import { useForm } from '@pyreon/form'
import { signal } from '@pyreon/reactivity'
export function App() {
  const sent = signal(0)
  function save() { sent.set(sent() + 1) }
  const form = useForm({ initialValues: { email: '', age: 18 }, onSubmit: save, validateOn: 'blur' })
  return <Button onPress={() => form.handleSubmit()}>Submit</Button>
}`)
    expect(w.some((m) => m.includes('onSubmit must be an inline arrow'))).toBe(true)
    expect(w.some((m) => m.includes('field `age` is not a string literal'))).toBe(true)
    expect(w.some((m) => m.includes('option `validateOn`'))).toBe(true)
  })

  it('createMachine: a `{ target }` transition LOWERS; guarded transitions and `always` are named', () => {
    const src = `import { createMachine } from '@pyreon/machine'
export function App() {
  const m = createMachine({ initial: 'closed', states: {
    closed: { on: { OPEN: { target: 'open' }, PEEK: { target: 'open', guard: () => true } } },
    open: { on: { CLOSE: 'closed' }, always: { target: 'closed' } },
  } })
  return <Button onPress={() => m.send('OPEN')}>Open</Button>
}`
    const w = warningsOf(src)
    expect(transform(src, { target: 'swift' }).code).toContain('"closed": ["OPEN": "open"]')
    expect(transform(src, { target: 'kotlin' }).code).toMatch(/"closed" to mutableMapOf\("OPEN" to "open"\)|"OPEN" to "open"/)
    expect(w.some((m) => m.includes('--PEEK-->'))).toBe(true)
    expect(w.some((m) => m.includes('key `always`'))).toBe(true)
  })

  it('createI18n: nested messages flatten to the dotted keys t() reads; a loader is named', () => {
    const src = `import { createI18n } from '@pyreon/i18n'
export function App() {
  const i18n = createI18n({ locale: 'en', messages: { en: { hi: 'Hello', nav: { home: 'Home', deep: { x: 'X' } } } }, loader: async () => ({}) })
  return <Text>{i18n.t('nav.home')}</Text>
}`
    const w = warningsOf(src)
    const sw = transform(src, { target: 'swift' }).code ?? ''
    expect(sw).toContain('"nav.home": "Home"')
    expect(sw).toContain('"nav.deep.x": "X"')
    expect(transform(src, { target: 'kotlin' }).code).toContain('"nav.home" to "Home"')
    expect(w.some((m) => m.includes('option `loader`'))).toBe(true)
  })

  it('a module-scope statement is named; a string-literal statement is not', () => {
    const w = warningsOf(`import { signal } from '@pyreon/reactivity'
'use client'
const count = signal(0)
count.set(5)
export function App() { return <Text>{count()}</Text> }`)
    const named = w.filter((m) => m.includes('A module-scope statement'))
    expect(named).toHaveLength(1)
    expect(named[0]).toContain('[4:1]')
  })
})
