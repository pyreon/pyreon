// An inline object type inside a struct field had no native spelling.
//
//   interface Todo { id: string; meta: { owner: string; points: number }; tags: { name: string }[] }
//
// emitted `var meta: (owner: String, points: Int)` on Swift — a labelled tuple,
// which compiles but is not `Codable`, so encoding the record for a WebView or a
// Saver silently produced the wrong bytes — and `var meta: Any` on Kotlin,
// which does not compile the moment the body reads `task.meta.owner`. One line
// of shared source, two different failures, no warning on either target.
//
// The fix lifts each inline shape into its own struct, named after its
// position (`TodoMeta`, `TodoTagsItem`), in BOTH places that need it: struct
// synthesis and the props pre-pass. The name is a pure function of the field
// path, so the two cannot disagree about what a field is called.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const TASK_INTERFACE = `interface Todo {
  id: string
  meta: { owner: string; points: number }
  tags: { name: string }[]
}`
const TASK_ALIAS = `type Todo = {
  id: string
  meta: { owner: string; points: number }
  tags: { name: string }[]
}`

const app = (decl: string) => `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
${decl}
const TASK: Todo = { id: 'a', meta: { owner: 'vit', points: 3 }, tags: [{ name: 'x' }] }
function App() {
  const task = signal<Todo>(TASK)
  return (
    <Stack>
      <Text>{task().meta.owner}</Text>
      <Text>{String(task().meta.points)}</Text>
      <Text>{task().tags[0]!.name}</Text>
    </Stack>
  )
}`

const code = (target: 'swift' | 'kotlin', src: string) => transform(src, { target })

describe('inline object fields lift to named structs', () => {
  for (const [label, decl] of [
    ['interface', TASK_INTERFACE],
    ['type alias', TASK_ALIAS],
  ] as const) {
    it(`${label}: Swift declares TodoMeta / TodoTagsItem and types the fields with them`, () => {
      const out = code('swift', app(decl)).code
      expect(out).toMatch(/struct TodoMeta\b/)
      expect(out).toMatch(/struct TodoTagsItem\b/)
      expect(out).toMatch(/var meta: TodoMeta\b/)
      expect(out).toMatch(/var tags: \[TodoTagsItem\]/)
      // The tuple form is exactly what shipped broken.
      expect(out).not.toMatch(/var meta: \(owner:/)
    })

    it(`${label}: Kotlin declares the data classes instead of Any`, () => {
      const out = code('kotlin', app(decl)).code
      expect(out).toMatch(/data class TodoMeta\b/)
      expect(out).toMatch(/data class TodoTagsItem\b/)
      expect(out).toMatch(/val meta: TodoMeta\b|var meta: TodoMeta\b/)
      expect(out).not.toMatch(/meta: Any\b/)
    })

    it(`${label}: emits no warnings`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        expect(code(target, app(decl)).warnings).toEqual([])
      }
    })
  }

  it('an optional inline object lifts to an optional named reference', () => {
    const src = app(`interface Todo {
  id: string
  meta?: { owner: string; points: number }
  tags: { name: string }[]
}`).replace('task().meta.owner', "task().meta?.owner ?? ''").replace(
      'String(task().meta.points)',
      'String(task().meta?.points ?? 0)',
    )
    expect(code('swift', src).code).toMatch(/var meta: TodoMeta\?/)
  })

  it('a two-deep inline shape gets a path name', () => {
    const out = code(
      'swift',
      app(`interface Todo {
  id: string
  meta: { owner: string; points: number; place: { city: string } }
  tags: { name: string }[]
}`),
    ).code
    expect(out).toMatch(/struct TodoMetaPlace\b/)
    expect(out).toMatch(/var place: TodoMetaPlace\b/)
  })

  it('refuses a generated name the file already declares, and says so', () => {
    const r = code(
      'swift',
      app(`type TodoMeta = { unrelated: boolean }
${TASK_INTERFACE}`),
    )
    // The user's TodoMeta must stay theirs — retyping `meta` as it would be wrong.
    expect(r.code).not.toMatch(/var meta: TodoMeta\b/)
    expect(r.warnings.some((w) => w.includes('`TodoMeta`, which is already declared'))).toBe(true)
  })
})

describe('the lifted form survives the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift: type-checks against the stub', () => {
    const r = validateSwiftWithStubs(code('swift', app(TASK_INTERFACE)).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: compiles on kotlinc', () => {
    const r = validateKotlin(code('kotlin', app(TASK_INTERFACE)).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
