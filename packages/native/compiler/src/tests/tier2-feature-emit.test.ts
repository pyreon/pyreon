// Gap 4 follow-up — @pyreon/feature v1 emit tests.
//
// v1 ports the literal-schema shape:
//   const Todo = defineFeature({
//     name: 'todo',
//     schema: { id: 'string', title: 'string', done: 'boolean' },
//   })
//
// Emits PER-FEATURE schema struct + module-scope const exposing
// name + initialValues. CRUD runtime not ported in v1 (separate PR).
//
// Bisect-verify: remove the `tryFeatureDefnFromTopLevel` block in
// parse.ts → the positive specs below fail because the emit no
// longer produces `PyreonFeatureSchema_Todo`.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `
import { defineFeature } from '@pyreon/feature'

export const Todo = defineFeature({
  name: 'todo',
  schema: {
    id: 'string',
    title: 'string',
    done: 'boolean',
    priority: 'number',
  },
})
`

describe('Gap 4 follow-up — @pyreon/feature v1 emit', () => {
  it('Swift: emits schema struct + module-scope enum', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.code).toContain('struct PyreonFeatureSchema_Todo: Codable {')
    expect(r.code).toContain('var id: String = ""')
    expect(r.code).toContain('var title: String = ""')
    expect(r.code).toContain('var done: Bool = false')
    expect(r.code).toContain('var priority: Int = 0')
    expect(r.code).toContain('enum PyreonFeature_Todo {')
    expect(r.code).toContain('static let name = "todo"')
    expect(r.code).toContain('static let initialValues = PyreonFeatureSchema_Todo()')
  })

  it('Kotlin: emits data class + module-scope object', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('data class PyreonFeatureSchema_Todo(')
    expect(r.code).toContain('var id: String = "",')
    expect(r.code).toContain('var title: String = "",')
    expect(r.code).toContain('var done: Boolean = false,')
    expect(r.code).toContain('var priority: Int = 0,')
    expect(r.code).toContain('object PyreonFeature_Todo {')
    expect(r.code).toContain('const val name = "todo"')
    expect(r.code).toContain('val initialValues = PyreonFeatureSchema_Todo()')
  })

  it('Non-literal schema (Zod) bails to tier2 silent-drop', () => {
    const src = `
import { defineFeature } from '@pyreon/feature'
import { z } from 'zod'

export const Todo = defineFeature({
  name: 'todo',
  schema: z.object({ id: z.string() }),
})
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).not.toContain('PyreonFeatureSchema_Todo')
    // Warning fires from tryFeatureDefnFromTopLevel about non-literal schema
    const w = r.warnings.find((w) => w.includes('defineFeature') && w.includes('Todo'))
    expect(w).toBeDefined()
  })

  it('Missing schema field types are dropped with warning', () => {
    const src = `
import { defineFeature } from '@pyreon/feature'

export const Item = defineFeature({
  name: 'item',
  schema: {
    id: 'string',
    badType: 'date',
  },
})
`
    const r = transform(src, { target: 'swift' })
    // The recognized 'string' field still emits.
    expect(r.code).toContain('var id: String = ""')
    // The unsupported 'date' field is dropped.
    expect(r.code).not.toContain('badType')
    // Warning surfaces the dropped field.
    const w = r.warnings.find((w) => w.includes('badType') && w.includes('date'))
    expect(w).toBeDefined()
  })

  it('NO defineFeature sites → no PyreonFeature_ emit', () => {
    const src = `
import { Stack, Text } from '@pyreon/primitives'
export function App() { return <Stack><Text>x</Text></Stack> }
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.code).not.toContain('PyreonFeatureSchema_')
      expect(r.code).not.toContain('PyreonFeature_')
    }
  })
})

/**
 * The declaration lowered; the REFERENCES did not.
 *
 * `const Todo = defineFeature(...)` emitted `enum PyreonFeature_Todo` (Swift) /
 * `object PyreonFeature_Todo` (Kotlin) and nothing named `Todo`. Since the only
 * reason to declare a feature is to use it, every real shared-source app failed
 * to build on BOTH platforms — swiftc `cannot find 'Todo' in scope`, kotlinc
 * `unresolved reference 'Todo'` — pointing at a generated file the author never
 * wrote. The manifest's `nativeFrontend` claim ("emits a Codable struct plus a
 * module-scope const ... on both targets") was true about the declaration and
 * silent about reachability.
 *
 * It survived five green specs because every one of them asserts the emitted
 * DECLARATION and none of them ever writes `Todo` in a component body — the
 * string-assertion blind spot: a test that reads the emitter's output can only
 * confirm the emitter agrees with itself. The two sibling lowerings in the same
 * emitter (`PyreonFieldMeta`, `PyreonZodSchema`) both emit the alias already.
 *
 * The alias is a VALUE binding for symmetry with those siblings, NOT because it
 * is collision-safe. That was the first guess and it was wrong: Swift and
 * Kotlin share one namespace for types and values, so a file declaring both
 * `const Todo = defineFeature(...)` and `interface Todo` fails on EITHER form
 * (`invalid redeclaration of 'Todo'` / `conflicting declarations`, measured for
 * both). The compiler warns by name for that shape rather than emitting the
 * collision, and the spec below pins the warning.
 */
const USED_SRC = `
import { Text, Stack } from '@pyreon/primitives'
import { defineFeature } from '@pyreon/feature'

const Todo = defineFeature({
  name: 'todo',
  schema: { id: 'string', title: 'string', done: 'boolean', priority: 'number' },
})

export function App() {
  return <Stack><Text>{Todo.name}</Text></Stack>
}
`

describe('@pyreon/feature — the declared binding is REACHABLE', () => {
  it('Swift emits a value alias for the source binding name', () => {
    const code = transform(USED_SRC, { target: 'swift' }).code
    expect(code).toContain('let Todo = PyreonFeature_Todo.self')
    // Not a typealias — see the collision spec below.
    expect(code).not.toContain('typealias Todo')
  })

  it('Kotlin emits a value alias for the source binding name', () => {
    const code = transform(USED_SRC, { target: 'kotlin' }).code
    expect(code).toContain('val Todo = PyreonFeature_Todo')
    expect(code).not.toContain('typealias Todo')
  })

  it('referencing the feature stays warning-free on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(USED_SRC, { target }).warnings ?? []).toEqual([])
    }
  })
})

/**
 * Against the REAL compilers — the half that was missing entirely.
 *
 * Before this, `tier2-feature-emit.test.ts` made ZERO `swiftc`/`kotlinc` calls:
 * the whole `@pyreon/feature` lowering had never been compiled by either
 * toolchain in its life, which is exactly how an unreachable binding shipped.
 * Deliberately frugal (two compiles per target) — this package is already the
 * CI suite's dominant toolchain cost.
 */
const COLLIDE_SRC = `
import { Text, Stack } from '@pyreon/primitives'
import { defineFeature } from '@pyreon/feature'

interface Todo { id: string }

const Todo = defineFeature({ name: 'todo', schema: { id: 'string' } })

export function App() {
  const t: Todo = { id: 'x' }
  return <Stack><Text>{Todo.name}</Text><Text>{t.id}</Text></Stack>
}
`

describe.runIf(isSwiftcAvailable())('@pyreon/feature — Swift compiles', () => {
  it('a component that REFERENCES the feature compiles', async () => {
    const r = await validateSwiftWithStubs(transform(USED_SRC, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

})

describe.runIf(isKotlincAvailable())('@pyreon/feature — Kotlin compiles', () => {
  it('a component that REFERENCES the feature compiles', async () => {
    const r = await validateKotlin(transform(USED_SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

})

describe('@pyreon/feature — a same-named type is DECLINED, not shipped broken', () => {
  it('warns by name on both targets instead of emitting a redeclaration', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const w = transform(COLLIDE_SRC, { target }).warnings ?? []
      expect(w.some((m) => m.includes('Todo') && m.includes('same name'))).toBe(true)
    }
  })

  it('the ordinary case stays warning-free', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(USED_SRC, { target }).warnings ?? []).toEqual([])
    }
  })
})
