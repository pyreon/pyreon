// `@pyreon/feature`'s generated CRUD hooks — `useList`, `useById`, `useCreate`, `useUpdate`, `useDelete` — lowered onto
// `@pyreon/query`'s native containers (`PyreonQuery`, `PyreonMutation`) with the request the web's `createFetcher` sends:
// GET <api>, GET <api>/<id>, POST <api> (json), PUT <api>/<id> (json data), DELETE <api>/<id>; the id is one path
// segment encoded by `PyreonURL.encodePathParam` (the web's `encodePathParam`), a non-2xx answer rejects. Everything
// else is NAMED: a relative / non-literal `api`, a custom `fetcher`, the other generated hooks, unlowered options.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const API = 'https://api.example.com/todos'

const feature = (config = `api: '${API}'`) => `
import { Stack, Text, Button } from '@pyreon/primitives'
import { defineFeature } from '@pyreon/feature'
import { signal } from '@pyreon/reactivity'
export const Todo = defineFeature({
  name: 'todo',
  schema: { id: 'string', title: 'string', done: 'boolean' },
  ${config},
})
`

const SRC = `${feature()}
export function Todos(props: { id: string }) {
  const list = Todo.useList({ staleTime: 5000 })
  const one = Todo.useById(() => props.id)
  const create = Todo.useCreate()
  const update = Todo.useUpdate()
  const remove = Todo.useDelete()
  const saved = signal('')
  const add = async () => {
    const t = await create.mutateAsync({ title: 'x', done: false })
    saved.set(t.id)
  }
  return (
    <Stack>
      <Text>{'Count: ' + (list.data()?.length ?? 0)}</Text>
      <Text>{list.isPending() ? 'Loading' : 'Ready'}</Text>
      <Text>{one.data()?.title ?? ''}</Text>
      <Text>{saved()}</Text>
      <Button onPress={add}>Add</Button>
      <Button onPress={() => create.mutate({ title: 'y', done: false }, { onSuccess: (t) => saved.set(t.id) })}>Add 2</Button>
      <Button onPress={() => update.mutate({ id: props.id, data: { done: true } })}>Done</Button>
      <Button onPress={() => remove.mutate(props.id)}>Delete</Button>
      <Text>{remove.isPending() ? 'Deleting' : ''}</Text>
    </Stack>
  )
}
`

const swiftOf = (src: string) => transform(src, { target: 'swift' })
const kotlinOf = (src: string) => transform(src, { target: 'kotlin' })

describe('@pyreon/feature CRUD hooks — native lowering', () => {
  it('the five lowered hooks lower with no warning — the mutations refresh the queries as on the web', () => {
    for (const r of [swiftOf(SRC), kotlinOf(SRC)]) expect(r.warnings).toEqual([])
  })

  describe('Swift', () => {
    const code = swiftOf(SRC).code

    it('useList → a keyed PyreonQuery of the schema struct, GET <api> through PyreonHttp', () => {
      expect(code).toContain('@State private var list = PyreonQuery<[PyreonFeatureSchema_Todo]>(queryKey: "todo:list", staleSeconds: 5)')
      expect(code).toContain(`PyreonHttpRequest(method: .get, url: "${API}")`)
      expect(code).toContain('await list.run {')
      expect(code).toContain('return try __response.decode([PyreonFeatureSchema_Todo].self)')
      expect(code).toContain('list.data?.count')
      expect(code).toContain('list.isPending ?')
    })

    it('useById → a runtime-keyed PyreonQuery, GET <api>/<encoded id>', () => {
      expect(code).toContain('@State private var one = PyreonQuery<PyreonFeatureSchema_Todo>(queryKey: "", staleSeconds: 0)')
      expect(code).toContain('.task(id: "todo:\\(id)") {')
      expect(code).toContain('one.setKey("todo:\\(id)")')
      expect(code).toContain(`PyreonHttpRequest(method: .get, url: "${API}/\\(PyreonURL.encodePathParam(id))")`)
      expect(code).toContain('await one.run {')
      expect(code).toContain('return try __response.decode(PyreonFeatureSchema_Todo.self)')
    })

    it('useCreate → PyreonMutation, POST <api> with the JSON body (fire-and-forget and awaited)', () => {
      expect(code).toContain('@State private var create = PyreonMutation<PyreonFeatureSchema_Todo>()')
      expect(code).toContain(
        `create.mutate(PyreonHttpRequest(method: .post, url: "${API}", headers: ["content-type": "application/json"], body: Data((PyreonJSON.stringify(`,
      )
      expect(code).toContain('call: PyreonMutationCallbacks(onSuccess: { t in')
      expect(code).toContain(`try await create.mutateAsync(PyreonHttpRequest(method: .post, url: "${API}"`)
    })

    it('a successful create / update / delete invalidates every `todo` query (the web\'s invalidateQueries([name]))', () => {
      expect(code).toContain(
        '{ __request in try await PyreonQueryCache.shared.settleMutation(invalidating: "todo") { try await PyreonHttp.call(__request).decode(PyreonFeatureSchema_Todo.self) } }',
      )
      expect(code).toContain(
        '{ __request in try await PyreonQueryCache.shared.settleMutation(invalidating: "todo") { _ = try await PyreonHttp.call(__request) } }',
      )
      // Both create call sites (fire-and-forget and awaited) and the update settle through it.
      expect(code.match(/settleMutation\(invalidating: "todo"/g)).toHaveLength(4)
    })

    it('useUpdate writes `data` into the cached `todo:<id>` record first — the key useById reads — and rolls back on failure', () => {
      expect(code).toContain(
        'PyreonQueryCache.shared.setQueryData("todo:\\(id)", as: PyreonFeatureSchema_Todo.self, { __old in var __new = __old; __new.done = true; return __new })',
      )
      expect(code).toContain('one.setKey("todo:\\(id)")')
      expect(code).toContain(
        '{ __input in try await PyreonQueryCache.shared.settleMutation(invalidating: "todo", rollback: __input.1) { try await PyreonHttp.call(__input.0).decode(PyreonFeatureSchema_Todo.self) } }',
      )
    })

    it('useUpdate → PUT <api>/<id> with `data` as the JSON body', () => {
      expect(code).toContain('@State private var update = PyreonMutation<PyreonFeatureSchema_Todo>()')
      expect(code).toMatch(
        /update\.mutate\(\(PyreonHttpRequest\(method: \.put, url: "https:\/\/api\.example\.com\/todos\/\\\(PyreonURL\.encodePathParam\(id\)\)", headers: \["content-type": "application\/json"\], body: Data\(\(PyreonJSON\.stringify\(__Obj\w*\(done: true\)\)\)\.utf8\)\)/,
      )
    })

    it('useDelete → a Void PyreonMutation, DELETE <api>/<id> with no body and no decode', () => {
      expect(code).toContain('@State private var remove = PyreonMutation<Void>()')
      expect(code).toContain(
        `remove.mutate(PyreonHttpRequest(method: .delete, url: "${API}/\\(PyreonURL.encodePathParam(id))"), { __request in try await PyreonQueryCache.shared.settleMutation(invalidating: "todo") { _ = try await PyreonHttp.call(__request) } })`,
      )
      expect(code).toContain('remove.isPending ?')
    })
  })

  describe('Kotlin', () => {
    const code = kotlinOf(SRC).code

    it('the schema data class is @Serializable, so the records decode into it', () => {
      expect(code).toContain('@Serializable\ndata class PyreonFeatureSchema_Todo(')
    })

    it('useList / useById → remembered PyreonQuery with the same requests', () => {
      expect(code).toContain('val list = remember { PyreonQuery<List<PyreonFeatureSchema_Todo>>(queryKey = "todo:list", staleMillis = 5000L) }')
      expect(code).toContain(`PyreonHttpRequest(method = PyreonHttpMethod.GET, url = "${API}")`)
      expect(code).toContain('list.run(launch = { __refetch -> pyreonAsyncScope.launch { __refetch() } }) {')
      expect(code).toContain('PyreonJson.decode<List<PyreonFeatureSchema_Todo>>(__response.body)')
      expect(code).toContain('LaunchedEffect("todo:${id}") {')
      expect(code).toContain(`PyreonHttpRequest(method = PyreonHttpMethod.GET, url = "${API}/\${PyreonURL.encodePathParam(id)}")`)
      expect(code).toContain('list.data.value?.length')
    })

    it('the mutations → remembered PyreonMutation with POST / PUT / DELETE', () => {
      expect(code).toContain('val create = remember { PyreonMutation<PyreonFeatureSchema_Todo>() }')
      expect(code).toContain('val remove = remember { PyreonMutation<Unit>() }')
      expect(code).toContain(
        `PyreonHttpRequest(method = PyreonHttpMethod.POST, url = "${API}", headers = mapOf("content-type" to "application/json"), body = PyreonJson.stringify(`,
      )
      expect(code).toContain(`create.runAsync(PyreonHttpRequest(method = PyreonHttpMethod.POST`)
      expect(code).toContain(`PyreonHttpRequest(method = PyreonHttpMethod.PUT, url = "${API}/\${PyreonURL.encodePathParam(id)}", headers = mapOf("content-type" to "application/json")`)
      expect(code).toContain(`PyreonHttpRequest(method = PyreonHttpMethod.DELETE, url = "${API}/\${PyreonURL.encodePathParam(id)}").let { __request -> remove.begin()`)
    })

    it('the mutations settle through PyreonQueryCache: success invalidates `todo`, useUpdate writes optimistically', () => {
      expect(code).toContain(
        '{ __r -> PyreonQueryCache.settleMutation("todo") { PyreonJson.decode<PyreonFeatureSchema_Todo>(withContext(Dispatchers.IO) { PyreonHttp.call(__r, fallback = PyreonHttpOkHttp) }.body) } }',
      )
      expect(code).toContain('{ __r -> PyreonQueryCache.settleMutation("todo") { withContext(Dispatchers.IO) { PyreonHttp.call(__r, fallback = PyreonHttpOkHttp) }; Unit } }')
      expect(code).toContain('PyreonQueryCache.setQueryData<PyreonFeatureSchema_Todo>("todo:${id}") { __old -> __old.copy(done = true) }')
      expect(code).toContain('one.setKey("todo:${id}")')
      expect(code).toContain(
        '{ __r -> PyreonQueryCache.settleMutation("todo", __r.second) { PyreonJson.decode<PyreonFeatureSchema_Todo>(withContext(Dispatchers.IO) { PyreonHttp.call(__r.first, fallback = PyreonHttpOkHttp) }.body) } }',
      )
      expect(code.match(/settleMutation\("todo"/g)).toHaveLength(4)
    })
  })

  describe('named refusals', () => {
    const list = `export function A() { const list = Todo.useList(); return <Text>{String(list.data()?.length)}</Text> }`
    it.each([
      ['a relative api', feature("api: '/api/todos'") + list, 'is not an absolute `http(s)://` URL'],
      ['a non-literal api', feature("api: BASE + '/todos'") + list, '`api` is not a string literal'],
      ['a missing api', feature("initialValues: {}") + list, 'declares no `api`'],
      ['a custom fetcher', feature(`api: '${API}', fetcher: fetch`) + list, 'custom `fetcher`'],
      ['a path token in api', feature("api: 'https://x.dev/:tenant/todos'") + list, '`:param` path token'],
    ])('%s drops the hook with the fix named', (_label, src, expected) => {
      for (const r of [swiftOf(src), kotlinOf(src)]) {
        expect(r.warnings.join('\n')).toContain('`Todo.useList()` does not lower to native')
        expect(r.warnings.join('\n')).toContain(expected)
        expect(r.code).not.toContain('Todo.useList(')
        expect(r.code).not.toContain('PyreonQuery<')
      }
    })

    it.each([
      ['useSearch', 'const term = signal(\'\'); const s = Todo.useSearch(term)', 'Write the search as `useQuery`'],
      ['useForm', 'const f = Todo.useForm()', 'save with `useCreate()` / `useUpdate()`'],
      ['useTable', 'const t = Todo.useTable([])', 'render the rows of `useList()`'.replace('render', 'Render')],
      ['useStore', 'const s = Todo.useStore()', 'Hold the selection in a `signal`'],
    ])('%s is named and not emitted', (hook, decl, advice) => {
      const src = `${feature()}\nexport function A() { ${decl}; return <Text>x</Text> }`
      for (const r of [swiftOf(src), kotlinOf(src)]) {
        const w = r.warnings.join('\n')
        expect(w).toContain(`\`Todo.${hook}()\` has no native lowering`)
        expect(w).toContain(advice)
        expect(w).toContain('Only `useList`, `useById`, `useCreate`, `useUpdate` and `useDelete` lower to native')
        expect(r.code).not.toContain(`Todo.${hook}(`)
      }
    })

    it.each([
      ['params', '{ params: { q: \'a\' } }', 'query parameters change the request URL'],
      ['page', '{ page: 2 }', 'a reactive page re-keys the query'],
      ['pageSize', '{ pageSize: 10 }', 'only applies with `page`'],
      ['enabled', '{ enabled: false }', 'no enabled gate'],
    ])('useList option `%s` is named and drops the hook', (key, options, reason) => {
      const src = `${feature()}\nexport function A() { const l = Todo.useList(${options}); return <Text>x</Text> }`
      const w = swiftOf(src).warnings.join('\n')
      expect(w).toContain(`option \`${key}\` has no native lowering`)
      expect(w).toContain(reason)
      expect(swiftOf(src).code).not.toContain('PyreonQuery<')
    })

    it('a non-literal staleTime and non-object options are named', () => {
      const a = `${feature()}\nexport function A(p: { s: number }) { const l = Todo.useList({ staleTime: p.s }); return <Text>x</Text> }`
      expect(swiftOf(a).warnings.join('\n')).toContain('`staleTime` is not a non-negative number literal')
      const b = `${feature()}\nconst opts = { staleTime: 1 }\nexport function A() { const l = Todo.useList(opts); return <Text>x</Text> }`
      expect(swiftOf(b).warnings.join('\n')).toContain('options are not an object literal')
    })

    it('useUpdate with variables that are not `{ id, data }` literally is named', () => {
      const src = `${feature()}\nexport function A(p: { v: { id: string } }) { const u = Todo.useUpdate(); return <Button onPress={() => u.mutate(p.v)}>x</Button> }`
      const w = swiftOf(src).warnings.join('\n')
      expect(w).toContain('`u.mutate(…)` is not supported in native')
      expect(w).toContain("variables are `{ id, data }`")
      const extra = `${feature()}\nexport function A(p: { id: string }) { const u = Todo.useUpdate(); return <Button onPress={() => u.mutate({ id: p.id, data: { done: true }, x: 1 })}>x</Button> }`
      expect(swiftOf(extra).warnings.join('\n')).toContain('`x` is not one of `useUpdate()`')
    })

    it('a destructured mutation is named (its bare `mutate()` reaches no recognizer)', () => {
      const src = `${feature()}\nexport function A() { const { mutate } = Todo.useCreate(); return <Text>x</Text> }`
      expect(swiftOf(src).warnings.join('\n')).toContain('`Todo.useCreate()` is destructured')
    })

    it('a destructured QUERY lowers through the core destructure (reads alias the container)', () => {
      const src = `${feature()}\nexport function A() { const { data, isPending } = Todo.useList(); return <Text>{isPending() ? 'l' : String(data()?.length)}</Text> }`
      const r = swiftOf(src)
      expect(r.warnings).toEqual([])
      expect(r.code).toContain('PyreonQuery<[PyreonFeatureSchema_Todo]>(queryKey: "todo:list"')
      expect(r.code).toContain('__pyDestr0.isPending ?')
    })

    it('a hook called outside a declaration is named', () => {
      const src = `${feature()}\nexport function A() { return <Text>{String(Todo.useList().data())}</Text> }`
      expect(swiftOf(src).warnings.join('\n')).toContain('a CRUD hook lowers only as a component declaration')
    })

    it('a useById id that is a literal null, or a block accessor, is named', () => {
      const nul = `${feature()}\nexport function A() { const o = Todo.useById(null); return <Text>x</Text> }`
      expect(swiftOf(nul).warnings.join('\n')).toContain('the web keeps the query idle')
      const block = `${feature()}\nexport function A(p: { id: string }) { const o = Todo.useById(() => { return p.id }); return <Text>x</Text> }`
      expect(swiftOf(block).warnings.join('\n')).toContain('parameterless arrow returning the id')
    })

    it('a useById id that may be absent is named (the web idles; native has no idle gate)', () => {
      const src = `${feature()}\nexport function A(props: { id?: string }) { const o = Todo.useById(() => props.id); return <Text>{o.data()?.title ?? ''}</Text> }`
      for (const r of [swiftOf(src), kotlinOf(src)]) {
        expect(r.warnings.join('\n')).toContain("`Todo.useById()`'s id may be absent")
      }
    })

    it('a feature whose declaration did not lower names the CRUD consequence', () => {
      const src = `
import { Text } from '@pyreon/primitives'
import { defineFeature } from '@pyreon/feature'
export const Todo = defineFeature({ name: 'todo', schema: { tags: 'array' }, api: '${API}' })
export function A() { const l = Todo.useList(); return <Text>x</Text> }
`
      expect(swiftOf(src).warnings.join('\n')).toContain('`PyreonFeatureSchema_Todo` is not declared')
    })
  })

  describe('the optimistic useUpdate write', () => {
    const update = (data: string, props = 'p: { id: string; t: string; n: number }') =>
      `${feature().replace("schema: { id: 'string', title: 'string', done: 'boolean' }", "schema: { id: 'string', title: 'string', done: 'boolean', rank: 'number' }")}
export function A(${props}) {
  const u = Todo.useUpdate()
  return <Button onPress={() => u.mutate({ id: p.id, data: ${data} })}>x</Button>
}`

    it('patches every field of a literal `data` drawn from the schema, with runtime values', () => {
      const src = update('{ title: p.t, rank: p.n, done: false }')
      const swift = swiftOf(src)
      expect(swift.warnings).toEqual([])
      expect(swift.code).toContain('{ __old in var __new = __old; __new.title = t; __new.rank = n; __new.done = false; return __new }')
      const kotlin = kotlinOf(src)
      expect(kotlin.warnings).toEqual([])
      expect(kotlin.code).toContain('__old.copy(title = t, rank = n, done = false)')
    })

    it.each([
      ['a non-literal `data`', 'p.draft', '`data` is not an object literal'],
      ['a spread in `data`', '{ ...p.draft }', 'a spread or a computed key'],
      ['a field the schema does not declare', '{ color: "red" }', '`data.color` is not a field of the schema'],
    ])('%s skips only the optimistic write, named — the request and the invalidation still lower', (_label, data, why) => {
      const src = update(data, 'p: { id: string; draft: { title: string } }')
      for (const r of [swiftOf(src), kotlinOf(src)]) {
        const w = r.warnings.join('\n')
        expect(w).toContain(why)
        expect(w).toContain('OPTIMISTIC write the web shows in `useById(id)` before the server answers is skipped natively')
        expect(r.code).not.toContain('setQueryData')
        expect(r.code).toMatch(/settleMutation\(invalidating: "todo"\)|settleMutation\("todo"\)/)
      }
    })

    it.each([
      ['a string into a boolean field', '{ done: "yes" }', '`data.done` is not a boolean'],
      ['a fraction into a whole-number field', '{ rank: 1.5 }', '`data.rank` is not a whole number'],
    ])('%s skips the optimistic write at emit, named', (_label, data, why) => {
      for (const r of [swiftOf(update(data)), kotlinOf(update(data))]) {
        expect(r.warnings.join('\n')).toContain(why)
        expect(r.code).not.toContain('setQueryData')
        expect(r.code).toMatch(/settleMutation\(invalidating: "todo"\)|settleMutation\("todo"\)/)
      }
    })

    it('reads the schema even when the component sits ABOVE the declaration', () => {
      const src = `
import { Button } from '@pyreon/primitives'
import { defineFeature } from '@pyreon/feature'
export function A(p: { id: string }) {
  const u = Todo.useUpdate()
  return <Button onPress={() => u.mutate({ id: p.id, data: { done: true } })}>x</Button>
}
export const Todo = defineFeature({ name: 'todo', schema: { id: 'string', done: 'boolean' }, api: '${API}' })
`
      const r = swiftOf(src)
      expect(r.warnings).toEqual([])
      expect(r.code).toContain('__new.done = true')
    })

    it('reads a validator-object schema too', () => {
      const src = `
import { Button } from '@pyreon/primitives'
import { defineFeature } from '@pyreon/feature'
import { z } from 'zod'
export const Todo = defineFeature({ name: 'todo', schema: z.object({ id: z.string(), done: z.boolean() }), api: '${API}' })
export function A(p: { id: string }) {
  const u = Todo.useUpdate()
  return <Button onPress={() => u.mutate({ id: p.id, data: { done: true } })}>x</Button>
}
`
      expect(kotlinOf(src).code).toContain('__old.copy(done = true)')
    })
  })

  // A screen that only mutates (no list on it) still names PyreonQueryCache, so the cache stub must be appended for it.
  const MUTATIONS_ONLY = `${feature()}
export function Edit(props: { id: string }) {
  const update = Todo.useUpdate()
  const remove = Todo.useDelete()
  const save = async () => { await update.mutateAsync({ id: props.id, data: { title: 'x', done: true } }) }
  return (
    <Stack>
      <Button onPress={save}>Save</Button>
      <Button onPress={() => remove.mutate(props.id)}>Delete</Button>
    </Stack>
  )
}
`

  it.runIf(isSwiftcAvailable())('a mutations-only screen type-checks against the stubs (Swift)', () => {
    const r = swiftOf(MUTATIONS_ONLY)
    expect(r.code).not.toContain('PyreonQuery<')
    const v = validateSwiftWithStubs(r.code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('a mutations-only screen compiles against the stubs (Kotlin)', () => {
    const r = kotlinOf(MUTATIONS_ONLY)
    expect(r.code).not.toContain('PyreonQuery<')
    const v = validateKotlin(r.code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isSwiftcAvailable())('the Swift output type-checks against the stubs', () => {
    const v = validateSwiftWithStubs(swiftOf(SRC).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('the Kotlin output compiles against the stubs', () => {
    const v = validateKotlin(kotlinOf(SRC).code)
    expect(v.ok, v.error).toBe(true)
  })
})
