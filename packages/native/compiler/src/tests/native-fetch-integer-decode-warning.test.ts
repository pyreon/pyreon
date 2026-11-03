// Issue #3956 item 1: `useFetch<Place[]>(url)` with `type Place = { name: string; km: number }`
// lowers `km` to Swift `Int` / Kotlin `Long` (TS `number` carries no int/float distinction, and
// PMTC's default is the integer). A fractional JSON value (`1.2`) then fails to decode the WHOLE
// response and `data` stays empty on iOS and Android — silently. Defaulting to Double would break
// every id-shaped field and change all existing output, so the compiler WARNS instead, naming the
// struct, the field, and the fix (`type Double = number`). Output is unchanged.
//
// Bisect site: `warnIntegerDecodeFields` in parse.ts (and the plain-url `recordDecode` calls in
// the useFetch / useQuery recognizers that feed it).

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'

const PLACES = `
type Place = { name: string; km: number }
export function Places() {
  const places = useFetch<Place[]>('https://example.com/places.json')
  const list = computed(() => places.data() ?? [])
  return (<Stack><For each={list} by={(p) => p.name}>{(p) => <Text>{p.name}</Text>}</For></Stack>)
}
`

const integerWarnings = (warnings: readonly string[] | undefined): string[] =>
  (warnings ?? []).filter((w) => w.includes('lowers to an INTEGER'))

describe('integer field in a decoded response struct warns (#3956 item 1)', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: useFetch<Place[]> warns naming the struct, the field and the fix`, () => {
      const r = transform(PLACES, { target })
      const ws = integerWarnings(r.warnings)
      expect(ws).toHaveLength(1)
      expect(ws[0]).toContain('`Place`')
      expect(ws[0]).toContain('`km`')
      expect(ws[0]).toContain('type Double = number')
      expect(ws[0]).toContain('km: Double')
      expect(ws[0]).toContain('type Int = number')
      // `name` is a string — never named.
      expect(ws[0]).not.toContain('`name`')
    })
  }

  it('output is unchanged — the field still lowers to the integer', () => {
    expect(transform(PLACES, { target: 'swift' }).code).toContain('var km: Int')
    expect(transform(PLACES, { target: 'kotlin' }).code).toContain('var km: Long')
  })

  it('the documented fix silences it and lowers the field to Double on both targets', () => {
    const fixed = `type Double = number\n${PLACES.replace('km: number', 'km: Double')}`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(fixed, { target })
      expect(integerWarnings(r.warnings)).toEqual([])
      expect(r.code).toContain('var km: Double')
    }
  })

  it('walks nested struct fields and array-element structs', () => {
    const src = `
type Point = { lat: number; label: string }
type Route = { name: string; stops: Point[]; origin: Point }
export function Routes() {
  const r = useFetch<Route>('https://example.com/route.json')
  return <Text>{r.isPending ? 'loading' : 'ok'}</Text>
}
`
    const ws = integerWarnings(transform(src, { target: 'swift' }).warnings)
    expect(ws).toHaveLength(1)
    expect(ws[0]).toContain('`Point`')
    expect(ws[0]).toContain('`lat`')
  })

  it('covers useQuery', () => {
    const src = `
import { useQuery } from '@pyreon/query'
type Todo = { title: string; progress: number }
export function T() {
  const q = useQuery<Todo>(() => ({
    queryKey: ['todo'],
    queryFn: () => fetch('https://api.example.com/todos/1').then(r => r.json()),
    staleTime: 0,
  }))
  return <Text>{q.isPending ? 'loading' : 'ok'}</Text>
}
`
    const ws = integerWarnings(transform(src, { target: 'kotlin' }).warnings)
    expect(ws).toHaveLength(1)
    expect(ws[0]).toContain('`Todo`')
    expect(ws[0]).toContain('`progress`')
  })

  it('does NOT flag id-shaped fields — the case the integer default exists for', () => {
    const src = `
type Row = { id: number; userId: number; owner_id: number; orgID: number; score: number }
export function R() {
  const rows = useFetch<Row[]>('https://example.com/rows.json')
  return <Text>{rows.isPending ? 'loading' : 'ok'}</Text>
}
`
    const ws = integerWarnings(transform(src, { target: 'swift' }).warnings)
    expect(ws).toHaveLength(1)
    // Exactly one field named, and it is the non-id one.
    expect(ws[0]).toContain('whose field `score` is `number`')
  })

  it('a field typed `Int` (`type Int = number`) is the explicit whole-number declaration and is not flagged', () => {
    const src = `type Int = number\n${PLACES.replace('km: number', 'km: Int')}`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(integerWarnings(r.warnings)).toEqual([])
      expect(r.code).toContain('var km: Int')
    }
  })

  it('does NOT warn for a struct that is not a decode target', () => {
    const src = `
type Place = { name: string; km: number }
export function P() {
  const p = signal<Place>({ name: 'a', km: 1 })
  return <Text>{p().name}</Text>
}
`
    expect(integerWarnings(transform(src, { target: 'swift' }).warnings)).toEqual([])
  })

  it('does NOT warn for a field already refined to Double', () => {
    const src = `
type Place = { name: string; km: number }
export function P() {
  const places = useFetch<Place[]>('https://example.com/places.json')
  const seed = signal<Place>({ name: 'a', km: 1.5 })
  return <Text>{seed().name}</Text>
}
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('var km: Double')
    expect(integerWarnings(r.warnings)).toEqual([])
  })
})
