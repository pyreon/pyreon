// A BLOCK-body `computed` inside a `defineStore` setup lowers natively.
//
// Before: the store recognizer accepted only the expression-body form
// (`computed(() => expr)`) and bailed the WHOLE store for
// `computed(() => { const x = …; return … })` — the shape a derived value takes
// as soon as it needs a local or an early return. The component-level computed
// already lowered that shape (Swift multi-statement getter / Kotlin statement
// body); the store now reuses the same statement IR + statement emitter
// (`ctx.functionDeclaration` to parse, `ctx.statements` to emit) rather than a
// second emitter.
//
// Bisect site: the block-body branch in
// `packages/fundamentals/store/src/native-plugin/recognize.ts` and the `body`
// arms of `emitSwiftStore` / `emitKotlinStore`.

import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const SRC = `
  import { defineStore } from '@pyreon/store'
  import { signal, computed } from '@pyreon/reactivity'
  import { Stack, Text } from '@pyreon/primitives'
  type Task = { id: number; title: string; done: boolean }
  const useApp = defineStore('app', () => {
    const tasks = signal<Task[]>([])
    const filter = signal('all')
    const visible = computed(() => {
      const xs = tasks()
      if (filter() === 'done') return xs.filter((t) => t.done)
      return xs
    })
    const summary = computed(() => {
      const open = tasks().filter((t) => !t.done).length
      const label = open === 1 ? 'task' : 'tasks'
      return open + ' ' + label + ' left'
    })
    const hasAny = computed(() => {
      return tasks().length > 0
    })
    return { tasks, filter, visible, summary, hasAny }
  })
  export function App() {
    return (
      <Stack>
        <Text>{useApp().store.summary()}</Text>
        <Text>{useApp().store.visible().length}</Text>
      </Stack>
    )
  }
`

const warnings = (target: 'swift' | 'kotlin') => transform(SRC, { target }).warnings ?? []

describe('defineStore — block-body computed lowers', () => {
  it('emits no warning on either target', () => {
    expect(warnings('swift').filter((w) => w.includes('defineStore'))).toEqual([])
    expect(warnings('kotlin').filter((w) => w.includes('defineStore'))).toEqual([])
  })

  it('Swift: a typed multi-statement getter on the singleton', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('final class PyreonStore_app')
    expect(out).toContain('var visible: [Task] {')
    expect(out).toContain('var summary: String {')
    expect(out).toContain('let xs = tasks')
    // A single-return block collapses to the compact expression form.
    expect(out).toContain('var hasAny: Bool { tasks.count > 0 }')
    expect(out).not.toContain('defineStore(')
  })

  it('Kotlin: a statement-body getter on the singleton', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('object PyreonStore_app')
    expect(out).toContain('val visible: List<Task> get() {')
    expect(out).toContain('val summary: String get() {')
    expect(out).toContain('val hasAny get() = tasks.length > 0L')
    expect(out).not.toContain('defineStore(')
  })

  it.skipIf(!isSwiftcAvailable())('type-checks on Swift', () => {
    const res = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('type-checks on Kotlin', () => {
    const res = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  }, 180_000)
})

const storeWith = (decls: string, keys: string) => `
  import { defineStore } from '@pyreon/store'
  import { signal, computed } from '@pyreon/reactivity'
  const useX = defineStore('x', () => {
    const n = signal(0)
    ${decls}
    return { n, ${keys} }
  })
  export function App() { return null }
`

describe('defineStore — an explicit computed<T> types the getter', () => {
  const SRC_T = storeWith(
    `const status = computed<string>(() => { const k = n(); return k > 0 ? 'some' : 'none' })`,
    'status',
  )

  it('Swift + Kotlin spell the annotated type', () => {
    expect(transform(SRC_T, { target: 'swift' }).code).toContain('var status: String {')
    expect(transform(SRC_T, { target: 'kotlin' }).code).toContain('val status: String get() {')
  })

  it.skipIf(!isSwiftcAvailable())('type-checks on Swift', () => {
    const res = validateSwiftWithStubs(transform(SRC_T, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('type-checks on Kotlin', () => {
    const res = validateKotlin(transform(SRC_T, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  }, 180_000)
})

describe('defineStore — computed shapes that still cannot lower warn by name', () => {
  it('a block body whose return type cannot be inferred names the computed and the annotation', () => {
    const src = storeWith(`const raw = signal<any>(null)
    const v = computed(() => { const x = raw(); return x })`, 'raw, v')
    for (const target of ['swift', 'kotlin'] as const) {
      const w = transform(src, { target }).warnings ?? []
      expect(w.some((x) => x.includes('computed `v`') && x.includes('computed<T>')), target).toBe(true)
    }
  })

  it('a block body that never returns a value is declined by name', () => {
    const src = storeWith(`const v = computed(() => { const x = n() })`, 'v')
    const r = transform(src, { target: 'swift' })
    expect((r.warnings ?? []).some((x) => x.includes('computed `v`') && x.includes('never returns'))).toBe(true)
    expect(r.code).not.toContain('PyreonStore_x')
  })

  it('a parameterised computed is declined by name', () => {
    const src = storeWith(`const v = computed((prev) => { return n() })`, 'v')
    const w = transform(src, { target: 'swift' }).warnings ?? []
    expect(w.some((x) => x.includes('computed `v`') && x.includes('parameters'))).toBe(true)
  })

  it('a computed whose argument is not an arrow names the computed', () => {
    const r = transform(
      `
      import { defineStore } from '@pyreon/store'
      import { signal, computed } from '@pyreon/reactivity'
      const derive = () => 1
      const useX = defineStore('x', () => {
        const n = signal(0)
        const d = computed(derive)
        return { n, d }
      })
      export function App() { return null }
      `,
      { target: 'swift' },
    )
    expect((r.warnings ?? []).some((w) => w.includes('computed `d`'))).toBe(true)
  })
})
