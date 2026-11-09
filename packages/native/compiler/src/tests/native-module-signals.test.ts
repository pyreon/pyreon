// Module-scope `signal()` / `computed()` — a file's shared reactive state — lowers on both targets.
//
// A top-level `const count = signal(0)` read by several components (or a helper) is ordinary Pyreon code: one value
// the whole file shares. It used to be skipped with a warning ("these belong inside a component"), and every read of
// it then failed the native build. It now lowers to one observable singleton per file (module-state.ts): Swift
// `@Observable final class PyreonModuleState { static let shared }`, Kotlin `object PyreonModuleState` with
// `mutableStateOf` — the shape store state already takes, so SwiftUI / Compose re-render whatever reads it.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable, validateSwiftTypecheck } from '../validate'

const emit = (src: string, target: 'swift' | 'kotlin', filename?: string) =>
  transform(src, filename === undefined ? { target } : { target, filename })

const app = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
type Todo = { id: number; title: string }
const count = signal(0)
const todos = signal<Todo[]>([])
const doubled = computed(() => count() * 2)
function inc(): void { count.set(count() + 1) }
export function A() {
  return (<Stack><Text>{count()}</Text><Text>{doubled()}</Text><Button onPress={() => count.set(count() + 1)}>+</Button><Button onPress={inc}>i</Button></Stack>)
}
export function B() {
  const count = signal('local')
  const add = () => todos.set([...todos(), { id: todos().length, title: count() }])
  return (<Stack><Text>{count()}</Text><Text>{todos().length}</Text><Button onPress={add}>a</Button></Stack>)
}`

describe('module-scope signals', () => {
  it('Swift: one @Observable singleton; every read and write goes through it, a local of the same name shadows it', () => {
    const { code, warnings } = emit(app, 'swift')
    expect(code).toContain('final class PyreonModuleState {\n    static let shared = PyreonModuleState()')
    expect(code).toContain('    var count: Int = 0')
    expect(code).toContain('    var todos: [Todo] = []')
    expect(code).toContain('    var doubled: Int { PyreonModuleState.shared.count * 2 }')
    expect(code).toContain('PyreonModuleState.shared.count = PyreonModuleState.shared.count + 1')
    expect(code).toContain('Text(verbatim: "\\(PyreonModuleState.shared.doubled)")')
    // B's own `count` shadows the module state; its `todos` does not.
    expect(code).toContain('@State private var count: String = "local"')
    expect(code).toContain('title: count)')
    expect(code).toContain('PyreonModuleState.shared.todos = (PyreonModuleState.shared.todos + [')
    expect(warnings).toEqual([])
  })

  it('Kotlin: one object with mutableStateOf; the same reads and writes', () => {
    const { code, warnings } = emit(app, 'kotlin')
    expect(code).toContain('object PyreonModuleState {\n    var count by mutableStateOf<Long>(0L)')
    expect(code).toContain('    val doubled: Long get() = PyreonModuleState.count * 2L')
    expect(code).toContain('PyreonModuleState.count = PyreonModuleState.count + 1L')
    expect(code).toContain('var count by remember { mutableStateOf("local") }')
    expect(warnings).toEqual([])
  })

  it('the singleton is per FILE: a filename gives it the file suffix synthesized structs use', () => {
    const a = emit(app, 'swift', 'a.tsx').code
    const b = emit(app.replace('signal(0)', 'signal(1)'), 'swift', 'b.tsx').code
    const name = (code: string) => /final class (PyreonModuleState\w*)/.exec(code)?.[1]
    expect(name(a)).toMatch(/^PyreonModuleState_/)
    expect(name(a)).not.toBe(name(b))
  })

  it('the old "belongs inside a component" warning is gone', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(emit(app, target).warnings.join('\n')).not.toContain('these belong inside a component')
    }
  })

  it.runIf(isSwiftcAvailable())('swiftc type-checks it (stubs)', () => {
    const r = validateSwiftWithStubs(emit(app, 'swift').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(isSwiftUIAvailable())('swiftc type-checks it (real SDK)', () => {
    const r = validateSwiftTypecheck(emit(app, 'swift').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(isKotlincAvailable())('kotlinc compiles it', () => {
    const r = validateKotlin(emit(app, 'kotlin').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)
})
