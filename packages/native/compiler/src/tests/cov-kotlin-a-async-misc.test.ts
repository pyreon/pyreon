// Coverage: the remaining Kotlin-backend arms — the async harnesses
// (`useFetch` / `useQuery` → PyreonHttp vs readText), `@pyreon/sync`'s
// synced-signal initial literals, standalone `safeParse` dynamic values,
// the synthesized data-class naming, and the param/local SHADOW restores.
//
// The shadow restores are the subtle ones: the emit registers a lambda or
// function param in the shared inference context so the body can be typed,
// and must put the OUTER binding back afterwards. Getting that wrong is
// silent — a later expression is typed by a long-dead parameter — so each
// spec reads the outer binding AFTER the shadowing construct.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const kt = (src: string) => transform(src, { target: 'kotlin' })

describe('Kotlin async: useFetch / useQuery pick PyreonHttp over readText', () => {
  it('a request carrying a VERB, headers or a body goes through PyreonHttp with all three', () => {
    const out = kt(`import { useFetch } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
interface Item { id: string }
export function P() {
  const p = useFetch<Item>('https://x.dev/a', { method: 'post', headers: { 'X-A': '1' }, body: '{}' })
  return (<Stack><Text>{p.data()?.id ?? 'none'}</Text></Stack>)
}`).code
    expect(out).toContain(
      'PyreonHttp.send(PyreonHttpRequest(method = PyreonHttpMethod.POST, url = "https://x.dev/a", headers = mapOf("X-A" to "1"), body = "{}"))',
    )
    // a non-2xx rejects rather than handing an error page to the decoder
    expect(out).toContain('if (!__response.isOk) throw PyreonHttpError.BadStatus(__response.status)')
    expect(out).not.toContain('readText()')
  })

  it('a plain GET keeps the readText path (PyreonHttp is only for what readText cannot express)', () => {
    const out = kt(`import { useFetch } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
interface Item { id: string }
export function P() {
  const p = useFetch<Item>('https://x.dev/a')
  return (<Stack><Text>{p.data()?.id ?? 'none'}</Text></Stack>)
}`).code
    expect(out).toContain('java.net.URL("https://x.dev/a").readText()')
    expect(out).not.toContain('PyreonHttp.send')
  })

  it('useQuery: a REACTIVE key re-keys the LaunchedEffect; a static key uses Unit', () => {
    const out = kt(`import { useQuery } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
interface Item { id: string }
export function P() {
  const id = signal<string>('a')
  const q = useQuery<Item>(() => ({ queryKey: ['item', id()], queryFn: () => fetch(\`https://x.dev/\${id()}\`), staleTime: 5 }))
  const q2 = useQuery<Item>(() => ({ queryKey: ['static'], queryFn: () => fetch('https://x.dev/s') }))
  return (<Stack><Text>{(q.data()?.id ?? 'n') + (q2.data()?.id ?? 'n')}</Text></Stack>)
}`).code
    expect(out).toContain('LaunchedEffect("item:${id}") {')
    expect(out).toContain('q.setKey("item:${id}")')
    expect(out).toContain('LaunchedEffect(Unit) {')
    // a static key is baked into the container; a runtime one starts empty
    expect(out).toContain('PyreonQuery<Item>(queryKey = "", staleMillis = 5L)')
    expect(out).toContain('PyreonQuery<Item>(queryKey = "static", staleMillis = 0L)')
  })

  it('useQuery with a verb-bearing queryFn takes the same PyreonHttp branch', () => {
    const out = kt(`import { useQuery } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
interface Item { id: string }
export function P() {
  const q = useQuery<Item>(() => ({ queryKey: ['k'], queryFn: () => fetch('https://x.dev/s', { method: 'post', headers: { 'X-A': '1' }, body: '{}' }) }))
  return (<Stack><Text>{q.data()?.id ?? 'n'}</Text></Stack>)
}`).code
    expect(out).toContain('method = PyreonHttpMethod.POST')
    expect(out).toContain('headers = mapOf("X-A" to "1")')
    expect(out).toContain('body = "{}"')
  })
})

describe('Kotlin: syncedSignal initial literals are typed for the native container', () => {
  it('a JS number becomes a Double literal (integral included); bool and string keep their form', () => {
    const out = kt(`import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const doc = new PyreonCrdtDoc()
  const title = syncedSignal({ doc, key: 't', initial: '' })
  const count = syncedSignal({ doc, key: 'c', initial: 2 })
  const frac = syncedSignal({ doc, key: 'f', initial: 1.5 })
  const done = syncedSignal({ doc, key: 'd', initial: false })
  return (<Stack><Text>{title() + String(count()) + String(frac()) + String(done())}</Text></Stack>)
}`).code
    expect(out).toContain('PyreonSyncedSignal(doc, "t", "")')
    // integral 2 must still infer PyreonSyncedSignal<Double> — the JS number
    expect(out).toContain('PyreonSyncedSignal(doc, "c", 2.0)')
    expect(out).toContain('PyreonSyncedSignal(doc, "f", 1.5)')
    expect(out).toContain('PyreonSyncedSignal(doc, "d", false)')
  })
})

describe('Kotlin: standalone safeParse emits a DYNAMIC value, not a data class', () => {
  it('an object becomes mapOf<String, Any?>, an array listOf<Any?>, and empties keep their generics', () => {
    const out = kt(`import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const a = computed(() => s.object({ n: s.number() }).safeParse({}).success)
  const b = computed(() => s.object({ n: s.number() }).safeParse({ n: 1, o: { p: 2 }, arr: [], arr2: [1, 2] }).success)
  return (<Stack><Text>{a() && b() ? 'v' : 'i'}</Text></Stack>)
}`).code
    expect(out).toContain('safeParseResult(mapOf<String, Any?>())')
    expect(out).toContain(
      'mapOf<String, Any?>("n" to 1, "o" to mapOf<String, Any?>("p" to 2), "arr" to listOf<Any?>(), "arr2" to listOf<Any?>(1, 2))',
    )
  })
})

describe('Kotlin: synthesized data-class names for nested object shapes', () => {
  it('a nested object takes the field name; an array-of-object takes its SINGULAR', () => {
    const out = kt(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function P() {
  const profile = signal({ meta: { a: 1 }, items: [{ b: 2 }], entries: [{ c: 3 }] })
  return (<Stack><Text>{String(profile().meta.a)}</Text></Stack>)
}`).code
    expect(out).toContain('data class PProfile(val meta: PProfileMeta, val items: List<PProfileItem>, val entries: List<PProfileEntrie>)')
    expect(out).toContain('data class PProfileMeta(val a: Int)')
    expect(out).toContain('data class PProfileItem(val b: Int)')
  })
})

describe('Kotlin: a component `params` prop that cannot be built from a route dict', () => {
  it('a NESTED params field and a non-object params both fall back to the raw shape', () => {
    const out = kt(`import { Stack, Text } from '@pyreon/primitives'
export function P(props: { params: { nested: { a: number } } }) { return (<Stack><Text>{String(props.params.nested.a)}</Text></Stack>) }
export function Q(props: { params: string }) { return (<Stack><Text>{props.params}</Text></Stack>) }`).code
    expect(out).toContain('fun P(params: PParam)')
    expect(out).toContain('fun Q(params: String)')
  })
})

describe('Kotlin: a defineStore with COMPUTEDS but no methods', () => {
  it('emits the computed getter and nothing method-shaped', () => {
    const out = kt(`import { defineStore } from '@pyreon/store'
import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
const useApp = defineStore('app', () => {
  const n = signal(0)
  const double = computed(() => n() * 2)
  return { n, double }
})
export function App() { const s = useApp(); return (<Stack><Text>{String(s.store.double())}</Text></Stack>) }`).code
    expect(out).toContain('val double get() = n * 2')
    expect(out).toContain('PyreonStore_app.double')
  })
})

describe('Kotlin: a SHADOWING param is restored to the outer binding afterwards', () => {
  it('an Array.from index param and a .map param named after an outer signal', () => {
    const out = kt(`import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
export function App() {
  const i = signal<number>(1)
  const xs = signal<number[]>([1])
  const a = computed(() => Array.from({ length: 3 }, (_, i) => i * 2))
  const b = computed(() => xs().map((i) => i + 1))
  return (<Stack><Text>{String(i()) + String(a().length) + String(b().length)}</Text></Stack>)
}`).code
    expect(out).toContain('(0 until 3).map({ i -> i * 2 })')
    expect(out).toContain('xs.map({ i -> i + 1 })')
    // the outer `i` still reads as the signal after both shadows unwind
    expect(out).toContain('(i).toString()')
  })

  it('a top-level FUNCTION param named after a module const', () => {
    const out = kt(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
const k = 1
function f(k: string): string { return k }
export function App() { const q = signal<string>('a'); return (<Stack><Text>{f(q()) + String(k)}</Text></Stack>) }`).code
    expect(out).toContain('fun f(k: String): String = k')
    expect(out).toContain('private val k = 1')
  })
})

describe('Kotlin: a table over an INLINE-object row list', () => {
  it('resolves the row generic to the synthesized struct the data actually holds', () => {
    const out = kt(`import { createTableState } from '@pyreon/table'
import { Stack, Text, For } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const rows = signal([{ name: 'a', age: 1 }])
  const t = createTableState({ data: () => rows(), columns: [{ id: 'name' }] })
  return (<Stack><For each={t.rows()}>{(u) => <Text>{u.name}</Text>}</For></Stack>)
}`).code
    expect(out).toContain('PyreonTableState<__Obj0>')
    expect(out).toContain('PyreonCell.Str(it.name)')
  })
})

describe('Kotlin: a module const that is not a scalar literal is not inlined', () => {
  it('a `null` module const emits as a val rather than being folded as a string', () => {
    const out = kt(`import { Stack, Text } from '@pyreon/primitives'
const K = null
export function P() { return (<Stack><Text>{String(K)}</Text></Stack>) }`).code
    expect(out).toContain('private val K = null')
  })
})
