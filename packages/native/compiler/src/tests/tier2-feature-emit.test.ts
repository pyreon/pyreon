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
