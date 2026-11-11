// More shapes for the two #4251 fixes (#4267): a body timer starts once at mount, and an unbound `catch` binds nothing
// the user can see. Each shape below compiles on both toolchains and keeps the behaviour #4267 locks for the plain one.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const emit = (src: string, target: 'swift' | 'kotlin') => transform(src, { target })
const compiles = (src: string): void => {
  if (isSwiftcAvailable()) {
    const r = validateSwiftWithStubs(emit(src, 'swift').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }
  if (isKotlincAvailable()) {
    const r = validateKotlin(emit(src, 'kotlin').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }
}

// The global object's spelling of the same timers: the web runs it exactly like the bare call.
const qualifiedBodyTimers = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  const id = window.setInterval(() => n.set(n() + 1), 1000)
  const t = globalThis.setTimeout(() => n.set(0), 500)
  const stop = () => { window.clearInterval(id); globalThis.clearTimeout(t) }
  return (<Stack><Text>{String(n())}</Text><Button onPress={stop}>Stop</Button></Stack>)
}`

// The documented mount shape: the timer and its teardown in one onMount.
const onMountTimer = `import { signal } from '@pyreon/reactivity'
import { onMount } from '@pyreon/core'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  onMount(() => {
    const id = setInterval(() => n.set(n() + 1), 1000)
    return () => clearInterval(id)
  })
  return (<Stack><Text>{String(n())}</Text></Stack>)
}`

// A timer a handler starts, its id kept in a signal: nothing runs at render time.
const handlerTimer = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  const timer = signal(0)
  const start = () => timer.set(setInterval(() => n.set(n() + 1), 1000))
  const stop = () => clearInterval(timer())
  return (<Stack><Text>{String(n())}</Text><Button onPress={start}>Start</Button><Button onPress={stop}>Stop</Button></Stack>)
}`

// An unbound catch next to a bound one, in one component, both touching a signal named `error`.
const mixedCatch = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
function risky(s: string): number { if (s === '') throw new Error('empty'); return 1 }
export function App() {
  const error = signal('')
  const bare = () => { try { risky('') } catch { error.set('failed') } }
  const bound = () => { try { risky('') } catch (e) { error.set(String(e)) } }
  return (<Stack><Button onPress={bare}>a</Button><Button onPress={bound}>b</Button><Text>{error()}</Text></Stack>)
}`

describe('body timers spelled through the global object start once, at mount', () => {
  it('Swift: state assigned in .onAppear; no timer started in body', () => {
    const { code, warnings } = emit(qualifiedBodyTimers, 'swift')
    expect(code).toContain('id = PyreonTimers.setInterval(1000, { n = n + 1 })')
    expect(code).toContain('t = PyreonTimers.setTimeout(500, { n = 0 })')
    expect(code).toContain('PyreonTimers.clear(id)')
    expect(code).not.toContain('PyreonTimers.clear(PyreonTimers')
    expect(code).not.toMatch(/\bwindow\.|\bglobalThis\./)
    const body = code.slice(code.indexOf('var body: some View'))
    expect(body.slice(0, body.indexOf('.onAppear'))).not.toContain('PyreonTimers.set')
    expect(warnings).toEqual([])
  })

  it('Kotlin: remembered state assigned in a LaunchedEffect(Unit)', () => {
    const { code, warnings } = emit(qualifiedBodyTimers, 'kotlin')
    expect(code).toMatch(/LaunchedEffect\(Unit\) \{\n\s*id = PyreonTimers\.setInterval\(1000L\)/)
    expect(code).not.toMatch(/val (id|t) = PyreonTimers/)
    expect(code).not.toMatch(/\bwindow\.|\bglobalThis\./)
    expect(warnings).toEqual([])
  })

  it('compiles on both toolchains', () => compiles(qualifiedBodyTimers), 180_000)
})

describe('the documented timer shapes are untouched by the body-timer lowering', () => {
  it('onMount(() => { const id = setInterval(…); return () => clearInterval(id) }): no warning, compiles', () => {
    for (const target of ['swift', 'kotlin'] as const) expect(emit(onMountTimer, target).warnings).toEqual([])
    compiles(onMountTimer)
  }, 180_000)

  it('a timer a handler starts (id in a signal): no warning, started only in the handler, compiles', () => {
    const swift = emit(handlerTimer, 'swift')
    expect(swift.warnings).toEqual([])
    const body = swift.code.slice(swift.code.indexOf('var body: some View'))
    expect(body).not.toContain('PyreonTimers.set')
    expect(emit(handlerTimer, 'kotlin').warnings).toEqual([])
    compiles(handlerTimer)
  }, 180_000)
})

describe('an unbound catch beside a bound one', () => {
  it('Swift binds nothing for the unbound catch and keeps the bound name', () => {
    const { code } = emit(mixedCatch, 'swift')
    expect(code).toContain('} catch _ {')
    expect(code).toContain('} catch let e {')
    expect(code).not.toMatch(/\} catch \{/)
  })

  it('compiles on both toolchains', () => compiles(mixedCatch), 180_000)
})
