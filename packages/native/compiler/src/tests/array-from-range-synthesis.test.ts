// Lists-at-scale arc — `Array.from({ length: n }, (_, i) => ({ … }))`,
// THE natural bulk-record constructor, must synthesize a record type for
// its object-literal body on BOTH targets.
//
// Real-build-found (router-demo BigListPage): the range-map lowering
// emitted the body WITHOUT seeding the index param into the emit-time
// inference ctx, so `synthLiteralStructName`'s `inferField(i)` bailed and
// the literal degraded to a labelled TUPLE — Swift's tuple key paths
// break `ForEach(id: \.id)` (swiftc error), and Kotlin's
// `(id = i, label = …)` is not Kotlin at all (syntax error). Both
// compiled green through the emit-only probe and failed only on the real
// toolchains — the wrong-transform-masks class, again.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `import { signal } from '@pyreon/reactivity'
export function App() {
  const rows = Array.from({ length: 10000 }, (_, i) => ({ id: i, label: \`Row \${i}\` }))
  return (
    <Scroll data-testid="biglist-scroll">
      <For each={rows} by={(r) => r.id}>
        {(r) => <Text>{r.label}</Text>}
      </For>
    </Scroll>
  )
}`

describe('Array.from range-map object-literal synthesis (seeded index param)', () => {
  it('Swift synthesizes a struct — no labelled tuple, ForEach key path valid', () => {
    const out = transform(SRC, { target: 'swift' })
    expect(out.code).toContain('struct __Obj0')
    expect(out.code).toContain('__Obj0(id: i, label: "Row \\(i)")')
    // The tuple form is the broken emit (a bare parenthesized literal,
    // no constructor name) — its key path fails swiftc.
    expect(out.code).not.toContain('((id: i, label:')
    expect(out.code).toContain('ForEach(rows, id: \\.id)')
    expect(out.warnings).toEqual([])
  })

  it('Kotlin synthesizes a data class — no named-tuple syntax error', () => {
    const out = transform(SRC, { target: 'kotlin' })
    expect(out.code).toContain('data class __Obj0')
    expect(out.code).toContain('__Obj0(id = i, label = "Row ${i}")')
    expect(out.code).not.toContain('((id = i, label =') // bare named-tuple form
    expect(out.warnings).toEqual([])
  })

  it('the seed is SCOPED — an outer binding of the same name is restored', () => {
    const shadow = `import { signal } from '@pyreon/reactivity'
export function App() {
  const i = 'outer'
  const rows = Array.from({ length: 3 }, (_, i) => ({ id: i, label: 'x' }))
  const after = i.toUpperCase()
  return <Text>{after}</Text>
}`
    // If the range-map seed leaked `i: number` past its body, the
    // post-call `i.toUpperCase()` would emit against a number receiver.
    const out = transform(shadow, { target: 'swift' })
    expect(out.code).toContain('.uppercased()')
  })

  it('Kotlin: a testid-carrying <Scroll> with a sole <For> keeps layout WITHOUT the scroll modifier (measure-crash fix)', () => {
    // Device-found on the 10k BigListPage: the lazyOnly unwrap bailed the
    // moment the <Scroll> carried a testTag, silently keeping
    // Column(Modifier.verticalScroll()) { LazyColumn } — an
    // IllegalStateException at MEASURE time (infinite height), invisible
    // to compile-level validation by construction.
    const out = transform(SRC, { target: 'kotlin' })
    expect(out.code).toContain('Column(modifier = Modifier.testTag("biglist-scroll"))')
    expect(out.code).not.toContain('verticalScroll')
    expect(out.warnings).toEqual([])
  })

  it('Kotlin: MIXED <Scroll> children with a <For> now emit the promised nested-lazy warning', () => {
    const mixed = `export function App() {
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: i, label: 'x' }))
  return (
    <Scroll>
      <Text>Header</Text>
      <For each={rows} by={(r) => r.id}>
        {(r) => <Text>{r.label}</Text>}
      </For>
    </Scroll>
  )
}`
    const out = transform(mixed, { target: 'kotlin' })
    expect(out.warnings.some((w) => w.includes('MEASURE time'))).toBe(true)
  })
})
