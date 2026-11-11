// Issue #3956 item 1: `useFetch<Place[]>(url)` with `type Place = { name: string; km: number }`
// lowers `km` to Swift `Int` / Kotlin `Long` (TS `number` carries no int/float distinction, and
// PMTC's default is the integer). A fractional JSON value (`1.2`) then fails to decode the WHOLE
// response and `data` stays empty on iOS and Android — silently. Defaulting to Double would break
// every id-shaped field and change all existing output, so the compiler WARNS instead, naming the
// struct, the field, and the fix (`type Double = number`). Output is unchanged.
//
// Bisect site: `warnIntegerDecodeFields` in parse.ts (and the plain-url `recordDecode` calls in
// the useFetch / useQuery recognizers that feed it).
//
// The same silent failure hides at EVERY native JSON decode, not just a fetch: a `useMutation<T>`
// reply, a `useInfiniteQuery<Page>` page, a `useStream<T>` event and a typed `JSON.parse`. Each now
// records its decode target, so each is named; a mutation's endpoint `response` schema now also
// refines T's number fields, as a query's always did (the second block below).

import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

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
      // The 64-bit integer on both targets: Swift `Int`, Kotlin `Long` (never the 32-bit `kotlin.Int`).
      expect(r.code).toContain(target === 'swift' ? 'var km: Int' : 'var km: Long')
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

describe('every native JSON decode site names an integer-default field, not only a fetch (#3956 item 1)', () => {
  const HTTP = `
import { createHttp } from '@pyreon/http'
import { standardSchema } from '@pyreon/http/schema'
import { openEventStream, openNdjsonStream, type SseEvent } from '@pyreon/http/stream'
import { useMutation, useInfiniteQuery, useStream } from '@pyreon/query'
import { s } from '@pyreon/validate'
import { Stack, Text, Button } from '@pyreon/primitives'
const api = createHttp({ baseUrl: 'https://api.example.com', schema: standardSchema })
`
  const SITES: Record<string, { src: string; struct: string; field: string }> = {
    'useMutation<T>(ep.mutation())': {
      struct: 'Reply',
      field: 'km',
      src: `${HTTP}
interface Reply { name: string; km: number }
const saveItem = api.endpoint('PUT /items/:id')
export function C() {
  const save = useMutation<Reply>(saveItem.mutation())
  return <Stack><Button onPress={() => save.mutate({ params: { id: '1' }, json: {} })}>x</Button><Text>{save.data()?.name ?? ''}</Text></Stack>
}`,
    },
    'useInfiniteQuery<Page>': {
      struct: 'Page',
      field: 'score',
      src: `${HTTP}
type Page = { cursor: string; score: number }
export function C() {
  const f = useInfiniteQuery<Page>(() => ({ queryKey: ['k'], queryFn: ({ pageParam }) => fetch(\`/x?c=\${pageParam}\`), initialPageParam: '0', getNextPageParam: (l) => l.cursor }))
  return <Stack><Text>x</Text></Stack>
}`,
    },
    'useStream<T> over NDJSON': {
      struct: 'LogLine',
      field: 'load',
      src: `${HTTP}
interface LogLine { message: string; load: number }
const rows = api.endpoint('GET /export', { responseType: 'stream' })
export function Feed() {
  const st = useStream<LogLine>((ctx) => openNdjsonStream((c) => rows({ signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus }))
  return <Stack><Text>{st.latest()?.message ?? ''}</Text></Stack>
}`,
    },
    'useStream<SseEvent<T>>': {
      struct: 'Tick',
      field: 'price',
      src: `${HTTP}
interface Tick { sym: string; price: number }
const tail = api.endpoint('GET /ticks', { responseType: 'stream' })
export function Feed() {
  const st = useStream<SseEvent<Tick>>((ctx) => openEventStream((c) => tail({ signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus }))
  return <Stack><Text>{st.latest()?.data.sym ?? ''}</Text></Stack>
}`,
    },
    'JSON.parse(s) as T[]': {
      struct: 'Place',
      field: 'km',
      src: `type Place = { name: string; km: number }
export function App() {
  const count = (raw: string) => { try { const ps = JSON.parse(raw) as Place[]; return ps.length } catch { return 0 } }
  return <Stack><Text>{String(count('[]'))}</Text></Stack>
}`,
    },
    'const x: T = JSON.parse(s)': {
      struct: 'Place',
      field: 'km',
      src: `type Place = { name: string; km: number }
export function App() {
  const first = (raw: string) => { try { const p: Place = JSON.parse(raw); return p.name } catch { return '' } }
  return <Stack><Text>{first('{}')}</Text></Stack>
}`,
    },
    'a helper annotated : T returning JSON.parse': {
      struct: 'Place',
      field: 'km',
      src: `type Place = { name: string; km: number }
function load(raw: string): Place { return JSON.parse(raw) }
export function App() {
  const first = (raw: string) => { try { return load(raw).name } catch { return '' } }
  return <Stack><Text>{first('{}')}</Text></Stack>
}`,
    },
  }

  for (const [site, { src, struct, field }] of Object.entries(SITES)) {
    for (const target of ['swift', 'kotlin'] as const) {
      it(`${target}: ${site} names \`${struct}.${field}\``, () => {
        const ws = integerWarnings(transform(src, { target }).warnings)
        expect(ws).toHaveLength(1)
        expect(ws[0]).toContain(`\`${struct}\``)
        expect(ws[0]).toContain(`whose field \`${field}\` is \`number\``)
        expect(ws[0]).toContain(`${field}: Double`)
      })
    }
    it(`${site}: the documented \`type Double = number\` fix silences it and compiles on both targets`, () => {
      const fixed = `type Double = number\n${src.replace(`${field}: number`, `${field}: Double`)}`
      const swift = transform(fixed, { target: 'swift' })
      const kotlin = transform(fixed, { target: 'kotlin' })
      expect(integerWarnings(swift.warnings)).toEqual([])
      expect(integerWarnings(kotlin.warnings)).toEqual([])
      expect(swift.code).toContain(`var ${field}: Double`)
      expect(kotlin.code).toContain(`var ${field}: Double`)
      if (isSwiftcAvailable()) expect(validateSwiftWithStubs(swift.code).error ?? '').toBe('')
      if (isKotlincAvailable()) expect(validateKotlin(kotlin.code).error ?? '').toBe('')
    }, 180_000)
  }

  it('an untyped useMutation decodes nothing and names nothing', () => {
    const src = SITES['useMutation<T>(ep.mutation())']!.src.replace('useMutation<Reply>(', 'useMutation(').replace(
      "<Text>{save.data()?.name ?? ''}</Text>",
      '<Text>x</Text>',
    )
    expect(integerWarnings(transform(src, { target: 'swift' }).warnings)).toEqual([])
  })

  it("a `data: 'text'` SSE stream decodes nothing and names nothing", () => {
    const src = `${HTTP}
interface Unused { load: number }
const tail = api.endpoint('GET /ticks', { responseType: 'stream' })
export function Feed() {
  const st = useStream<SseEvent<string>>((ctx) => openEventStream((c) => tail({ signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus, data: 'text' }))
  return <Stack><Text>{st.latest()?.data ?? ''}</Text></Stack>
}`
    expect(integerWarnings(transform(src, { target: 'swift' }).warnings)).toEqual([])
  })

  it('a struct decoded at two sites is named once', () => {
    const src = `${HTTP}
interface Reply { name: string; km: number }
const saveItem = api.endpoint('PUT /items/:id')
export function C() {
  const save = useMutation<Reply>(saveItem.mutation())
  const parsed = (raw: string) => { try { return (JSON.parse(raw) as Reply).name } catch { return '' } }
  return <Stack><Button onPress={() => save.mutate({ params: { id: '1' }, json: {} })}>x</Button><Text>{parsed('{}')}</Text></Stack>
}`
    expect(integerWarnings(transform(src, { target: 'kotlin' }).warnings)).toHaveLength(1)
  })
})

describe("a mutation's endpoint `response` schema types the reply's number fields, as a query's does", () => {
  const MUTATION = `
import { createHttp } from '@pyreon/http'
import { standardSchema } from '@pyreon/http/schema'
import { useMutation } from '@pyreon/query'
import { s } from '@pyreon/validate'
import { Stack, Text, Button } from '@pyreon/primitives'
const api = createHttp({ baseUrl: 'https://api.example.com', schema: standardSchema })
export const book_schema = s.object({ id: s.string(), price: s.number(), pages: s.number().int() })
export type Book = { id: string; price: number; pages: number }
export const putBook = api.endpoint('PUT /books/:bookId', { response: book_schema })
export function C() {
  const save = useMutation<Book>(putBook.mutation())
  return <Stack><Button onPress={() => save.mutate({ params: { bookId: '1' }, json: {} })}>x</Button><Text>{save.data()?.id ?? ''}</Text></Stack>
}`

  it('`s.number()` is a Double and `.int()` stays an integer, with no warning, on both targets — and it compiles', () => {
    const swift = transform(MUTATION, { target: 'swift' })
    const kotlin = transform(MUTATION, { target: 'kotlin' })
    const bookOf = (code: string) => code.slice(code.indexOf('Book'), code.indexOf('Book') + 160)
    expect(bookOf(swift.code)).toContain('var price: Double')
    expect(bookOf(swift.code)).toContain('var pages: Int')
    expect(kotlin.code).toContain('data class Book(var id: String, var price: Double, var pages: Long)')
    expect(integerWarnings(swift.warnings)).toEqual([])
    expect(integerWarnings(kotlin.warnings)).toEqual([])
    if (isSwiftcAvailable()) expect(validateSwiftWithStubs(swift.code).error ?? '').toBe('')
    if (isKotlincAvailable()) expect(validateKotlin(kotlin.code).error ?? '').toBe('')
  }, 180_000)
})
