// Coverage: `emitKotlinDecl`'s library-container arms (emit-kotlin.ts
// ~2400-3090) — table / sortable / rate-limited / storage / form / i18n /
// machine — plus the small pure helpers they call (`kotlinTableCell`,
// `resolveKotlinRowTypeName`, `isRememberSaveableNativeType`).
//
// Each of these picks a NATIVE SHAPE from an inferred type, and picking
// the wrong one is a compile error rather than a visible difference: a
// `PyreonCell.Str` where the column is numeric sorts lexically, a
// `rememberSaveable` over a non-Bundle type has no Saver, and a
// `PyreonSortableState<Any>` does not assign to a `List<String>` sink.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const kt = (src: string) => transform(src, { target: 'kotlin' })

describe('Kotlin decls: createTableState', () => {
  const TBL = (cols: string, page = ', pageSize: 10') =>
    `import { createTableState } from '@pyreon/table'
import { Stack, Text, For } from '@pyreon/primitives'
type User = { name: string; age: number; vip: boolean }
export function App() {
  const users = signal<User[]>([{ name: 'a', age: 3, vip: true }])
  const t = createTableState({ data: () => users(), columns: [${cols}]${page} })
  return (<Stack><Text>{t.page()}</Text><For each={t.rows()}>{(u) => <Text>{u.name}</Text>}</For></Stack>)
}`

  it('a cell is typed off the ROW FIELD: Str for string, Num(.toDouble) for number, interpolated otherwise', () => {
    const out = kt(TBL(`{ id: 'name' }, { id: 'age' }, { id: 'vip' }`)).code
    expect(out).toContain('PyreonTableColumn("name") { PyreonCell.Str(it.name) }')
    expect(out).toContain('PyreonTableColumn("age") { PyreonCell.Num((it.age).toDouble()) }')
    // no Cell kind for Boolean — interpolate so it still renders
    expect(out).toContain('PyreonTableColumn("vip") { PyreonCell.Str("${it.vip}") }')
  })

  it('pageSize is only passed when > 0', () => {
    expect(kt(TBL(`{ id: 'name' }`)).code).toContain('}), 10) }')
    expect(kt(TBL(`{ id: 'name' }`, '')).code).toContain('PyreonCell.Str(it.name) }))')
  })

  it('the row generic comes from the data element type', () => {
    expect(kt(TBL(`{ id: 'name' }`)).code).toContain('PyreonTableState<User>')
  })
})

describe('Kotlin decls: useSortable row type for SCALAR item lists', () => {
  const SORT = (t: string, init: string) =>
    `import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const items = signal<${t}>(${init})
  const s = useSortable({ items: () => items(), by: (w) => w, onReorder: () => {} })
  return (<Stack><Text>{items().length}</Text></Stack>)
}`

  it('string[] / number[] / boolean[] keep their element type rather than degrading to Any', () => {
    expect(kt(SORT('string[]', `['a']`)).code).toContain('PyreonSortableState<String>')
    expect(kt(SORT('number[]', `[1]`)).code).toContain('PyreonSortableState<Int>')
    expect(kt(SORT('boolean[]', `[true]`)).code).toContain('PyreonSortableState<Boolean>')
  })
})

describe('Kotlin decls: rate-limited callbacks', () => {
  const RL = (decl: string) => `import { useDebouncedCallback, useThrottledCallback } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const n = signal<number>(0)
  ${decl}
  return (<Stack><Text>{n()}</Text></Stack>)
}`

  it('a 0-param callback becomes <Unit> with an `_` binder; a typed param keeps its name and type', () => {
    const zero = kt(RL(`const dc = useDebouncedCallback(() => { n.set(1) }, 300)`)).code
    expect(zero).toContain('PyreonDebounced<Unit>(300, PyreonTaskScheduler()) { _ ->')
    const typed = kt(RL(`const tc = useThrottledCallback((v: number) => { n.set(v) }, 100)`)).code
    expect(typed).toContain('PyreonThrottled<Int>(100, PyreonTaskScheduler()) { v ->')
  })
})

describe('Kotlin decls: useStorage picks rememberSaveable vs rememberPyreonStorage', () => {
  const ST = (decls: string, read: string) => `import { useStorage } from '@pyreon/storage'
import { Stack, Text } from '@pyreon/primitives'
type Todo = { id: string; done: boolean }
type Mode = 'light' | 'dark'
export function App() {
${decls}
  return (<Stack><Text>{${read}}</Text></Stack>)
}`

  it('Bundle-native types (string/number/boolean/enum) take the direct rememberSaveable shape', () => {
    const out = kt(ST(
      `  const s1 = useStorage<string>('k1', 'a')
  const s2 = useStorage<number>('k2', 1)
  const s3 = useStorage<boolean>('k3', true)
  const s4 = useStorage<Mode>('k4', 'light')`,
      `s1() + String(s2()) + String(s3()) + s4()`,
    )).code
    expect(out).toContain('var s1 by rememberSaveable { mutableStateOf("a") }')
    expect(out).toContain('var s2 by rememberSaveable { mutableStateOf(1) }')
    expect(out).toContain('var s3 by rememberSaveable { mutableStateOf(true) }')
    // a known enum is Bundle-friendly via its name
    expect(out).toContain('var s4 by rememberSaveable { mutableStateOf(Mode.light) }')
  })

  it('an OPTIONAL of a native type stays native; an optional of a data class does not', () => {
    const out = kt(ST(
      `  const s7 = useStorage<string | null>('k7', null)
  const s8 = useStorage<Todo | null>('k8', null)`,
      `String(s7 !== null)`,
    )).code
    expect(out).toContain('var s7 by rememberSaveable { mutableStateOf<String?>(null) }')
    expect(out).toContain('var s8 by rememberPyreonStorage<Todo?>("k8", null)')
  })

  it('a data class / list of data classes routes through rememberPyreonStorage, empty list included', () => {
    const out = kt(ST(
      `  const s5 = useStorage<Todo[]>('k5', [])
  const s6 = useStorage<Todo>('k6', { id: 'x', done: false })`,
      `String(s5().length)`,
    )).code
    expect(out).toContain('rememberPyreonStorage<List<Todo>>("k5", listOf())')
    expect(out).toContain('rememberPyreonStorage<Todo>("k6", Todo(id = "x", done = false))')
  })
})

describe('Kotlin decls: useForm validators', () => {
  const FORM = (opts: string) => `import { useForm } from '@pyreon/form'
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
import { Stack, Text } from '@pyreon/primitives'
const Sch = zodSchema(z.object({ email: z.string().email(), nick: z.string().min(2) }))
export function App() {
  const form = useForm(${opts})
  return (<Stack><Text>{String(form.isValid())}</Text></Stack>)
}`

  it('an EXPLICIT validator and a schema MERGE into one map, the explicit one winning its key', () => {
    const out = kt(FORM(
      `{ initialValues: { email: '', nick: '' }, validators: { email: (v: string) => v === '' ? 'req' : '' }, schema: Sch }`,
    )).code
    // one `validators = mapOf(` — the schema fields are appended, not a second arg
    expect(out.match(/validators = mapOf\(/g)).toHaveLength(1)
    expect(out).toContain(`"email" to { v: String -> if (v == "") "req" else "" }`)
    expect(out).toContain(`"nick" to { v: String -> PyreonZodSchema_Sch.validateField("nick", v) }`)
    // the explicit key is NOT also delegated to the schema
    expect(out).not.toContain(`PyreonZodSchema_Sch.validateField("email"`)
  })

  it('a schema alone creates the map; a schema NAME with no declaration warns instead', () => {
    const only = kt(FORM(`{ initialValues: { email: '' }, schema: Sch }`)).code
    expect(only).toContain(`"email" to { v: String -> PyreonZodSchema_Sch.validateField("email", v) }`)
    const missing = kt(
      `import { useForm } from '@pyreon/form'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const form = useForm({ initialValues: { email: '' }, schema: Nope })
  return (<Stack><Text>{String(form.isValid())}</Text></Stack>)
}`,
    )
    expect(missing.warnings.join('\n')).toContain('no top-level zodSchema')
  })

  it('form.isValid() / isSubmitting() drop their parens (native exposes Boolean properties)', () => {
    const out = kt(FORM(`{ initialValues: { email: '' } }`)).code
    expect(out).toContain('form.isValid')
    expect(out).not.toContain('form.isValid()')
  })
})

describe('Kotlin decls: i18n and machine map literals', () => {
  it('an EMPTY inner map emits `mapOf()` rather than `mapOf()` with a stray comma', () => {
    const out = kt(
      `import { createI18n } from '@pyreon/i18n'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const i18n = createI18n({ locale: 'en', messages: { en: { hi: 'Hi' }, cs: {} } })
  return (<Stack><Text>{i18n.t('hi')}</Text></Stack>)
}`,
    ).code
    expect(out).toContain('"en" to mapOf("hi" to "Hi")')
    expect(out).toContain('"cs" to mapOf()')
  })

  it('a state with NO outgoing events emits an empty transition map', () => {
    const out = kt(
      `import { createMachine } from '@pyreon/machine'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const m = createMachine({ initial: 'idle', states: { idle: { on: { GO: 'done' } }, done: {} } })
  return (<Stack><Text>{m()}</Text></Stack>)
}`,
    ).code
    expect(out).toContain('"idle" to mapOf("GO" to "done")')
    expect(out).toContain('"done" to mapOf()')
  })
})
