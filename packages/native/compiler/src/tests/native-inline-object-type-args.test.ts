// An inline object type literal written as a GENERIC TYPE ARGUMENT (`useMutation<{ ok: boolean }>`) must become a
// named Codable struct / @Serializable data class on both targets, exactly as a named `interface` does.
//
// Device-found: Swift spelled `useMutation<{ ok: boolean }>(…)` as `PyreonMutation<Bool>` and decoded the reply with
// `.decode(Bool.self)`, so the server's `{"ok":true}` failed to decode and the mutation read `error` — with NO
// warning. The plugin's `typeText` resolved the type without the component's synthesis context, and the no-context
// fallback collapsed a one-field object to its field's type (a multi-field one became a labelled tuple, which is not
// Codable). Kotlin synthesized a class, but every inline type argument in a component derived the SAME name
// (`<Component>Data`) and the second silently reused the first one's shape.
//
// The class is every position that spells a TypeIR without passing a synthesis context: plugin type arguments
// (useQuery, useMutation, useInfiniteQuery, useStream, useFetch, useAuth, useLoaderData), `JSON.parse(…) as {…}`, and
// a local's annotation. Each now synthesizes in the component it sits in; a position OUTSIDE any component (a
// module-scope signal) is a struct named after its binding (native-inline-object-module-scope.test.ts).

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const HEADER = `
import { Stack, Text, Button } from '@pyreon/primitives'
import { useMutation, useQuery, useInfiniteQuery, useStream } from '@pyreon/query'
import { createHttp, useFetch } from '@pyreon/http'
import { signal, computed } from '@pyreon/reactivity'
const api = createHttp({ baseUrl: 'http://127.0.0.1:8791' })
const resetGroceries = api.endpoint('POST /groceries-reset')
`

const component = (body: string, jsx: string, extra = ''): string => `${HEADER}${extra}
export function Page() {
  ${body}
  return <Stack>${jsx}</Stack>
}`

interface Site {
  src: string
  /** Substrings both targets' output must contain, after `PageData` etc. are resolved. */
  swift: string[]
  kotlin: string[]
  /** Substrings neither may contain — the collapsed / tuple / reused spelling. */
  swiftNot?: string[]
  kotlinNot?: string[]
}

const SITES: Record<string, Site> = {
  // The device bug, verbatim shape.
  'useMutation<{ ok: boolean }> over an endpoint mutation': {
    src: component(
      'const reset = useMutation<{ ok: boolean }>(resetGroceries.mutation())',
      `<Button onPress={() => reset.mutate({})}>Reset</Button><Text>{reset.isError() ? 'error' : reset.status()}</Text>`,
    ),
    swift: [
      'struct PageData: Codable {',
      '  var ok: Bool',
      '@State private var reset = PyreonMutation<PageData>()',
      '.decode(PageData.self)',
    ],
    kotlin: [
      'data class PageData(val ok: Boolean)',
      'remember { PyreonMutation<PageData>() }',
      'PyreonJson.decode<PageData>(',
    ],
    swiftNot: ['PyreonMutation<Bool>', 'decode(Bool.self)'],
  },
  'useQuery<{ id; title }> (multi-field, was a non-Codable tuple)': {
    src: component(
      `const q = useQuery<{ id: number; title: string }>(() => ({ queryKey: ['t'], queryFn: () => fetch('https://x.dev/t').then((r) => r.json()) }))`,
      `<Text>{q.data()?.title ?? ''}</Text>`,
    ),
    swift: [
      'struct PageData: Codable {',
      '  var id: Int',
      '  var title: String',
      'PyreonQuery<PageData>(',
      'decode(PageData.self, from: bytes)',
    ],
    kotlin: [
      'data class PageData(val id: Long, val title: String)',
      'PyreonQuery<PageData>(',
      'PyreonJson.decode<PageData>(body)',
    ],
    swiftNot: ['(id: Int, title: String)'],
  },
  'useFetch<{ ok: boolean }>': {
    src: component(
      `const f = useFetch<{ ok: boolean }>('https://x.dev/t')`,
      `<Text>{f.data()?.ok ? 'y' : 'n'}</Text>`,
    ),
    swift: [
      'struct PageData: Codable {',
      'PyreonFetch<PageData>()',
      'decode(PageData.self, from: bytes)',
    ],
    kotlin: [
      'data class PageData(val ok: Boolean)',
      'PyreonFetch<PageData>()',
      'PyreonJson.decode<PageData>(body)',
    ],
    swiftNot: ['PyreonFetch<Bool>', 'decode(Bool.self'],
  },
  'useInfiniteQuery<{ items; next }>': {
    src: component(
      'const f = useInfiniteQuery<{ items: string[]; next: string }>(() => ({ queryKey: ["k"], queryFn: ({ pageParam }) => fetch(`https://x.dev/x?c=${pageParam}`), initialPageParam: "0", getNextPageParam: (l) => l.next }))',
      '<Text>{f.isPending()}</Text>',
    ),
    swift: [
      'struct PageData: Codable {',
      '  var items: [String]',
      'PyreonInfiniteQuery<PageData>(',
      'decode(PageData.self, from: bytes)',
    ],
    kotlin: [
      'data class PageData(val items: List<String>, val next: String)',
      'PyreonInfiniteQuery<PageData>(',
    ],
    swiftNot: ['(items: [String], next: String)'],
  },
  'useStream<{ message }> (NDJSON)': {
    src: `import { openNdjsonStream } from '@pyreon/http/stream'\n${component(
      'const s = useStream<{ message: string }>((ctx) => openNdjsonStream((c) => rows({ signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus }))',
      `<Text>{s.latest()?.message ?? ''}</Text>`,
      `const rows = api.endpoint('GET /export', { responseType: 'stream' })`,
    )}`,
    swift: [
      'struct PageData: Codable {',
      '  var message: String',
      'PyreonStream<PageData>(',
      'ndjson(PageData.self)',
    ],
    kotlin: [
      'data class PageData(val message: String)',
      'PyreonStream<PageData>(',
      'PyreonJson.decode<PageData>(line)',
    ],
    swiftNot: ['PyreonStream<String>', 'ndjson(String.self)'],
  },
  'useStream<SseEvent<{ message }>> (SSE)': {
    src: `import { openEventStream, type SseEvent } from '@pyreon/http/stream'\n${component(
      `const s = useStream<SseEvent<{ message: string }>>((ctx) => openEventStream((c) => tail({ signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus, events: ['log'] }))`,
      `<Text>{s.latest()?.data.message ?? ''}</Text>`,
      `const tail = api.endpoint('GET /tail', { responseType: 'stream' })`,
    )}`,
    swift: ['struct PageData: Codable {', 'PyreonStream<PyreonSseEvent<PageData>>('],
    kotlin: ['data class PageData(val message: String)', 'PyreonStream<PyreonSseEvent<PageData>>('],
    swiftNot: ['PyreonSseEvent<String>'],
  },
  // Two inline type arguments in one component both derive `<Component>Data`.
  'two inline type arguments in one component get two types': {
    src: component(
      `const q = useQuery<{ title: string }>(() => ({ queryKey: ['t'], queryFn: () => fetch('https://x.dev/t').then((r) => r.json()) }))\n  const m = useMutation<{ ok: boolean }>(resetGroceries.mutation())`,
      `<Text>{q.data()?.title ?? ''}</Text><Text>{m.data()?.ok ? 'y' : 'n'}</Text><Button onPress={() => m.mutate({})}>x</Button>`,
    ),
    swift: [
      'struct PageData: Codable {\n  var title: String',
      'struct PageData2: Codable {\n  var ok: Bool',
      'PyreonQuery<PageData>(',
      'PyreonMutation<PageData2>()',
    ],
    kotlin: [
      'data class PageData(val title: String)',
      'data class PageData2(val ok: Boolean)',
      'PyreonQuery<PageData>(',
      'PyreonMutation<PageData2>()',
    ],
    kotlinNot: ['PyreonMutation<PageData>()'],
  },
  '`JSON.parse(…) as { ok: boolean }`': {
    src: component(
      `const raw = signal('{"ok":true}')\n  const p = computed(() => { try { return JSON.parse(raw()) as { ok: boolean } } catch { return { ok: false } } })`,
      `<Text>{p().ok ? 'y' : 'n'}</Text>`,
    ),
    swift: ['struct PageData: Codable {', 'PyreonJSON.parse(PageData.self, '],
    kotlin: ['data class PageData(val ok: Boolean)', 'PyreonJson.parse<PageData>('],
    swiftNot: ['parse(Bool.self'],
    kotlinNot: ['parse<Any>('],
  },
  'a local annotated with an inline object array': {
    src: component(
      'const n = signal(0)\n  const run = () => { const xs: { ok: boolean }[] = []; xs.push({ ok: true }); n.set(xs.length) }',
      '<Button onPress={run}>x</Button><Text>{n()}</Text>',
    ),
    swift: [
      'struct PageData: Codable {',
      'var xs: [PageData] = []',
      'xs.append(PageData(ok: true))',
    ],
    kotlin: [
      'data class PageData(val ok: Boolean)',
      'val xs: MutableList<PageData> = mutableListOf()',
      'xs.add(PageData(ok = true))',
    ],
    swiftNot: ['[Bool]'],
    kotlinNot: ['MutableList<Any>'],
  },
}

const AUTH_SRC = `
import { useAuth } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
export function Page() {
  const auth = useAuth<{ id: string }>()
  return <Stack><Text>auth</Text></Stack>
}`

const LOADER_SRC = `
import { useLoaderData } from '@pyreon/router'
import { Stack, Text } from '@pyreon/primitives'
export function Page() {
  const d = useLoaderData<{ title: string }>()
  return <Stack><Text>{d().title}</Text></Stack>
}`

describe('inline object type arguments become named types', () => {
  for (const [name, site] of Object.entries(SITES)) {
    describe(name, () => {
      it('Swift: a named Codable struct, never a field type or a tuple', () => {
        const r = transform(site.src, { target: 'swift' })
        expect(r.warnings.filter((w) => w.includes('inline object type'))).toEqual([])
        for (const s of site.swift) expect(r.code).toContain(s)
        for (const s of site.swiftNot ?? []) expect(r.code).not.toContain(s)
      })
      it('Kotlin: a named data class per distinct shape', () => {
        const r = transform(site.src, { target: 'kotlin' })
        expect(r.warnings.filter((w) => w.includes('inline object type'))).toEqual([])
        for (const s of site.kotlin) expect(r.code).toContain(s)
        for (const s of site.kotlinNot ?? []) expect(r.code).not.toContain(s)
      })
      it.runIf(isSwiftcAvailable())('Swift typechecks', () => {
        const v = validateSwiftWithStubs(transform(site.src, { target: 'swift' }).code)
        expect(v.ok, v.error).toBe(true)
      })
      it.runIf(isKotlincAvailable())('Kotlin compiles', () => {
        const v = validateKotlin(transform(site.src, { target: 'kotlin' }).code)
        expect(v.ok, v.error).toBe(true)
      })
    })
  }

  it('useAuth<{ id: string }> is a named user type on Swift (was `PyreonAuth<String>`)', () => {
    const r = transform(AUTH_SRC, { target: 'swift' })
    expect(r.code).toContain('struct PageData: Codable {\n  var id: String')
    expect(r.code).toContain('PyreonAuth<PageData>()')
    expect(r.code).not.toContain('PyreonAuth<String>')
  })

  it('useLoaderData<{ title: string }> reads a named struct on Swift (the loader resolves it to its literal struct)', () => {
    const r = transform(LOADER_SRC, { target: 'swift' })
    expect(r.code).toMatch(/private var d: (\w+) \{ useLoaderData\(router: pyreonRouter\)! \}/)
    expect(r.code).toContain(': Codable {\n  var title: String')
    expect(r.code).not.toMatch(/as\?? String\b|var d: String/)
  })

  it.runIf(isSwiftcAvailable())('useAuth / useLoaderData Swift typecheck', () => {
    for (const src of [AUTH_SRC, LOADER_SRC]) {
      const v = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })

  it.runIf(isKotlincAvailable())('useAuth / useLoaderData Kotlin compile', () => {
    for (const src of [AUTH_SRC, LOADER_SRC]) {
      const v = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })

  it.each(['swift', 'kotlin'] as const)(
    'outside any component (a module-scope signal) the type is a struct named after the binding on %s, not collapsed',
    (target) => {
      const r = transform(
        component(
          'const n = 1',
          `<Text>{flag().ok ? 'y' : 'n'}</Text>`,
          'const flag = signal<{ ok: boolean }>({ ok: true })',
        ),
        { target },
      )
      // Every module-scope site is covered in native-inline-object-module-scope.test.ts.
      expect(r.warnings.filter((w) => w.includes('inline object type'))).toEqual([])
      expect(r.code).toContain(target === 'swift' ? 'var flag: FlagType = FlagType(ok: true)' : 'mutableStateOf<FlagType>(')
      expect(r.code).not.toMatch(/var flag: Bool\b/)
    },
  )

  it.each(['swift', 'kotlin'] as const)(
    'a signal named `s` does not synthesize a type named after its component on %s',
    (target) => {
      const r = transform(
        component(
          'const s = signal<{ ok: boolean } | null>(null)',
          `<Text>{s()?.ok ? 'y' : 'n'}</Text>`,
        ),
        { target },
      )
      expect(r.code).toContain(target === 'swift' ? 'struct PageS: Codable' : 'data class PageS(')
      expect(r.code).not.toMatch(target === 'swift' ? /struct Page: Codable/ : /data class Page\(/)
    },
  )
})
