// `effect(fn)` in a component body lowers on both targets.
//
// It used to be DROPPED with a warning ("a bare component-body statement (effect(...)) is not lowered natively"), so
// the reactive side effect — the third member of the signal / computed / effect core the multiplatform docs promise
// runs identically — did nothing on device. The lowering:
//
// - the body becomes a component-scope function (`__pyEffectN`), so locals, branches, loops and a returned cleanup
//   closure that captures those locals all lower as a handler's body does;
// - Swift runs it `.onAppear` and on `.onChange(of:)` each reactive read; Compose runs it in a `DisposableEffect`
//   keyed by the same reads, whose `onDispose` is the returned cleanup.
//
// The re-run triggers are the body's reactive reads, statically (`effect-deps.ts`) — a superset of the web's last-run
// set, shared by both targets.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable, validateSwiftTypecheck } from '../validate'

const emit = (src: string, target: 'swift' | 'kotlin') => transform(src, { target })

const basic = `import { signal, computed, effect } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const count = signal(0)
  const label = signal('small')
  const doubled = computed(() => count() * 2)
  effect(() => {
    if (count() > 2) label.set('big ' + String(doubled()))
    else label.set('small')
  })
  return (<Stack><Text>{label()}</Text><Button onPress={() => count.set(count() + 1)}>+</Button></Stack>)
}`

describe('effect(fn) — the body runs on appear and again when a read changes', () => {
  it('Swift: a private func, run .onAppear and .onChange(of:) each signal / computed it reads', () => {
    const { code, warnings } = emit(basic, 'swift')
    expect(code).toMatch(/private func __pyEffect0\(\) \{\n\s+if count > 2 \{/)
    expect(code).toContain('.onAppear { __pyEffect0() }')
    expect(code).toContain('.onChange(of: count) { __pyEffect0() }')
    expect(code).toContain('.onChange(of: doubled) { __pyEffect0() }')
    // The writes are not triggers.
    expect(code).not.toContain('.onChange(of: label)')
    expect(warnings).toEqual([])
  })

  it('Kotlin: a local fun, run in a DisposableEffect keyed by the same reads', () => {
    const { code, warnings } = emit(basic, 'kotlin')
    expect(code).toMatch(/fun __pyEffect0\(\) \{\n\s+if \(count > 2L\) \{/)
    expect(code).toContain('DisposableEffect(count, doubled) {\n    __pyEffect0()\n    onDispose { }\n  }')
    expect(warnings).toEqual([])
  })

  it('the bare-statement "DROPPED" warning is gone', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(emit(basic, target).warnings.join('\n')).not.toContain('bare component-body statement')
    }
  })
})

const withCleanup = `import { signal, effect } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const room = signal('lobby')
  const log = signal('')
  effect(() => {
    const joined = room()
    if (joined === '') return
    log.set('join ' + joined)
    return () => log.set(log() + ' / leave ' + joined + ' ' + room.peek())
  })
  return (<Stack><Text>{log()}</Text></Stack>)
}`

describe('effect(fn) — the returned cleanup', () => {
  it('Swift: held in @State, called before the next run and when the view goes away; it captures the run\'s locals', () => {
    const { code, warnings } = emit(withCleanup, 'swift')
    expect(code).toContain('@State private var __pyEffect0Cleanup: (() -> Void)? = nil')
    expect(code).toContain('private func __pyEffect0Run() { __pyEffect0Cleanup?(); __pyEffect0Cleanup = __pyEffect0() }')
    expect(code).toMatch(/private func __pyEffect0\(\) -> \(\(\) -> Void\)\? \{/)
    expect(code).toMatch(/if joined == "" \{\n\s+return nil\n\s+\}/)
    expect(code).toContain('.onAppear { __pyEffect0Run() }')
    expect(code).toContain('.onChange(of: room) { __pyEffect0Run() }')
    expect(code).toContain('.onDisappear { __pyEffect0Cleanup?(); __pyEffect0Cleanup = nil }')
    // Reads inside the cleanup are not triggers (`log()`), and neither is a `.peek()`.
    expect(code).not.toContain('.onChange(of: log)')
    expect(warnings).toEqual([])
  })

  it('Kotlin: the DisposableEffect disposes with the closure the run returned', () => {
    const { code, warnings } = emit(withCleanup, 'kotlin')
    expect(code).toMatch(/fun __pyEffect0\(\): \(\(\) -> Unit\)\? \{/)
    expect(code).toContain('DisposableEffect(room) {\n    val cleanup = __pyEffect0()\n    onDispose { cleanup?.invoke() }\n  }')
    expect(warnings).toEqual([])
  })
})

const richDeps = `import { signal, effect, untrack } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { defineStore } from '@pyreon/store'
type Todo = { id: string; title: string; done: boolean }
const useApp = defineStore('app', () => { const theme = signal('light'); return { theme } })
export function Panel(props: { title: string; count: number }) {
  const todos = signal<Todo[]>([])
  const seen = signal('')
  const app = useApp()
  effect(() => {
    const open = todos().filter((t) => !t.done).length
    seen.set(props.title + String(open) + app.store.theme() + String(untrack(() => props.count)))
  })
  return (<Stack><Text>{seen()}</Text></Stack>)
}`

describe('effect(fn) — every kind of reactive read is a trigger', () => {
  it('Swift: a struct array, a prop and a store field; the struct becomes Equatable for .onChange', () => {
    const { code, warnings } = emit(richDeps, 'swift')
    expect(code).toContain('.onChange(of: todos) { __pyEffect0() }')
    expect(code).toContain('.onChange(of: title) { __pyEffect0() }')
    expect(code).toMatch(/\.onChange\(of: PyreonStore_app\.shared\.theme\) \{ __pyEffect0\(\) \}/)
    // `untrack` reads are not triggers.
    expect(code).not.toContain('.onChange(of: count)')
    expect(code).toContain('extension Todo: Equatable {}')
    expect(warnings).toEqual([])
  })

  it('Kotlin: the same reads as keys', () => {
    const { code, warnings } = emit(richDeps, 'kotlin')
    expect(code).toMatch(/DisposableEffect\(todos, title, PyreonStore_app\.theme\) \{/)
    expect(warnings).toEqual([])
  })

  it('no extension is emitted where no effect compares a struct', () => {
    expect(emit(basic, 'swift').code).not.toContain(': Equatable {}')
  })
})

const serviceReads = `import { signal, effect } from '@pyreon/reactivity'
import { useStorage } from '@pyreon/storage'
import { useOnline } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const theme = useStorage('theme', 'light')
  const online = useOnline()
  const log = signal('')
  effect(() => { log.set(theme() + String(online())) })
  return (<Stack><Text>{log()}</Text></Stack>)
}`

describe('effect(fn) — a service or storage binding is a trigger too', () => {
  it('Swift: a runtime container field (no compile-time type) is compared by its description', () => {
    const { code, warnings } = emit(serviceReads, 'swift')
    expect(code).toContain('.onChange(of: theme) { __pyEffect0() }')
    expect(code).toContain('.onChange(of: String(describing: online.isOnline)) { __pyEffect0() }')
    expect(warnings).toEqual([])
  })

  it('Kotlin: the state read itself is the key', () => {
    expect(emit(serviceReads, 'kotlin').code).toContain('DisposableEffect(theme, online.isOnline.value) {')
  })
})

describe('effect(fn) — shapes that stay outside', () => {
  it('a read Swift cannot compare is named, not silently untracked', () => {
    const src = `import { signal, effect } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(props: { onTick: () => void }) {
  const n = signal(0)
  effect(() => { n.set(n.peek() + 1); const f = props.onTick; f() })
  return (<Stack><Text>{n()}</Text></Stack>)
}`
    expect(emit(src, 'swift').warnings.join('\n')).toContain('effect() reads `onTick`, whose value Swift cannot compare')
  })

  it('an `effect` imported from another module is not the framework effect', () => {
    const src = `import { signal } from '@pyreon/reactivity'
import { effect } from './my-effects'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  effect(() => n.set(1))
  return (<Stack><Text>{n()}</Text></Stack>)
}`
    const { code } = emit(src, 'swift')
    expect(code).not.toContain('__pyEffect0')
  })
})

const mountCapture = `import { signal } from '@pyreon/reactivity'
import { onMount } from '@pyreon/core'
import { Stack, Text } from '@pyreon/primitives'
export function Clock() {
  const ticks = signal(0)
  onMount(() => {
    const started = ticks()
    const id = started + 1
    ticks.set(id)
    return () => ticks.set(id + started)
  })
  return (<Stack><Text>{ticks()}</Text></Stack>)
}`

describe('onMount whose cleanup closes over a mount-body local', () => {
  it('runs as an untracked effect instead of dropping the cleanup', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const { code, warnings } = emit(mountCapture, target)
      expect(warnings).toEqual([])
      expect(code).toContain('__pyEffect0')
      // Untracked: it never re-runs (onMount reads nothing reactively on the web).
      expect(code).not.toContain('.onChange(of:')
    }
    expect(emit(mountCapture, 'swift').code).toContain('.onDisappear { __pyEffect0Cleanup?(); __pyEffect0Cleanup = nil }')
    expect(emit(mountCapture, 'kotlin').code).toContain('DisposableEffect(Unit) {\n    val cleanup = __pyEffect0()')
  })
})

describe('untrack / batch / peek lower as their plain evaluation', () => {
  const src = `import { signal, untrack, batch } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const a = signal(0)
  const b = signal(0)
  const sum = () => untrack(() => a()) + b.peek()
  const both = () => batch(() => { a.set(1); b.set(2) })
  return (<Stack><Text>{String(sum())}</Text><Button onPress={both}>b</Button></Stack>)
}`
  it('emit: the closure value, the closure run, the read', () => {
    const swift = emit(src, 'swift')
    expect(swift.code).toContain('(a) + b')
    expect(swift.code).toMatch(/\{ \(\) in\n\s*a = 1\n\s*b = 2\n\s*\}\(\)/)
    expect(swift.warnings).toEqual([])
    const kotlin = emit(src, 'kotlin')
    expect(kotlin.code).toMatch(/run \{\n\s*a = 1L\n\s*b = 2L\n\s*\}/)
    expect(kotlin.warnings).toEqual([])
  })
  it('a block body that returns a value is named', () => {
    const v = src.replace('batch(() => { a.set(1); b.set(2) })', 'batch(() => { a.set(1); return a() })')
    for (const target of ['swift', 'kotlin'] as const) {
      expect(emit(v, target).warnings.join('\n')).toContain('a block body that returns a value has no native lowering')
    }
  })
  it.runIf(isSwiftcAvailable())('Swift (stubs) compiles', () => {
    const r = validateSwiftWithStubs(emit(src, 'swift').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)
  it.runIf(isKotlincAvailable())('Kotlin compiles', () => {
    const r = validateKotlin(emit(src, 'kotlin').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)
})

describe('effect(fn) survives the real toolchains', () => {
  const sources = { basic, withCleanup, richDeps, mountCapture, serviceReads }
  for (const [name, src] of Object.entries(sources)) {
    it.runIf(isSwiftcAvailable())(`Swift (stubs): ${name}`, () => {
      const r = validateSwiftWithStubs(emit(src, 'swift').code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    }, 180_000)
    // The store protocol and the service containers live in runtimes the real-SDK lane does not link; the stub lane
    // above covers those two sources.
    it.runIf(isSwiftUIAvailable() && name !== 'richDeps' && name !== 'serviceReads')(`Swift (real SDK): ${name}`, () => {
      const r = validateSwiftTypecheck(emit(src, 'swift').code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    }, 180_000)
    it.runIf(isKotlincAvailable())(`Kotlin: ${name}`, () => {
      const r = validateKotlin(emit(src, 'kotlin').code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    }, 180_000)
  }
})
