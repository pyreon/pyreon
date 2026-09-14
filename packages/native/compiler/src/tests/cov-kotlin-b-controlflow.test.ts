// Kotlin emit — `<For>` / `<Show>`, the walled tags, `<Transition>` timing,
// and the handler-lowering shapes in `emitKotlinAction`.
//
// Each block here is a DECLINE path: the shape the emitter is asked for, and
// the neighbouring shape it must refuse (a `by` that is a reference rather
// than an inline arrow, a `fallback` that is not JSX, a `<For>` with no render
// arrow at all). A decline that silently produced the happy-path emit is the
// class these lock — see `<For by>` and `<Suspense fallback>`, both of which
// warn BY NAME rather than falling back quietly.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const kotlin = (src: string) => transform(src, { target: 'kotlin' })

describe('<For> key resolution and render-arrow shapes on Kotlin', () => {
  const src = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, For, Show } from '@pyreon/primitives'
const keyOf = (r: { id: number }) => r.id
export function App() {
  const rows = signal([{ id: 1 }, { id: 2 }])
  return (<Stack>
    <For />
    <For each={rows()} by={keyOf}>{(r: { id: number }) => (<Text>{r.id}</Text>)}</For>
    <For each={rows()}>{() => (<Text>x</Text>)}</For>
    <For each={rows()}><Text>no arrow</Text></For>
    <Show><Text>always</Text></Show>
  </Stack>)
}`

  it('a `by` that is a function REFERENCE is refused by name — an inline arrow is the only key form that lowers', () => {
    const w = kotlin(src).warnings.find((x) => x.includes('<For by={…}>'))!
    expect(w).toContain('only an inline arrow lowers to a Compose items() key')
    expect(w).toContain('a function REFERENCE cannot be read as a key here')
    // It still emits the `it.id` default rather than nothing — the warning is
    // what makes the likely compile failure diagnosable.
    expect(kotlin(src).code).toContain('items(rows, key = { it.id })')
  })

  it('a `<For>` with no `each` falls back to the literal `items` receiver, and one with no render arrow emits an empty body', () => {
    const code = kotlin(src).code
    expect(code).toContain('items(items, key = { it.id }) {}')
    expect(code).toContain('items(rows, key = { it.id }) {}')
  })

  it('a zero-parameter render arrow is given the default `item` binder', () => {
    // Kotlin's `items(...) { ... }` lambda needs a name in this position; the
    // emit cannot leave the arrow's absent parameter blank.
    expect(kotlin(src).code).toContain('items(rows, key = { it.id }) { item ->')
  })

  it('a `<Show>` with no `when` is unconditional rather than dropped', () => {
    expect(kotlin(src).code).toContain('if (true) {')
  })

  it('a field-array items source unwraps the per-item `value()` accessor — the MEMBER spelling, not just the call', () => {
    const r = kotlin(`import { useFieldArray } from '@pyreon/form'
import { Stack, Text, For } from '@pyreon/primitives'
export function TagsDemo() {
  const tags = useFieldArray(['alpha'])
  return (<Stack><For each={tags.items} by={(i) => i.key}>{(item) => <Text>{item.value()}</Text>}</For></Stack>)
}`)
    expect(r.code).toContain('items(tags.items, key = { it.key }) { item ->')
    // `value` is a PROPERTY on PyreonFieldArray's item — keeping the parens
    // would be "cannot call value of non-function type".
    expect(r.code).toContain('Text(text = "${item.value}")')
  })
})

describe('the walled tags on Kotlin — Suspense / ErrorBoundary / KeepAlive', () => {
  const WALLED = `import { Stack, Text, Suspense, ErrorBoundary, KeepAlive } from '@pyreon/primitives'
const Spin = () => <Text>…</Text>
export function App() {
  return (<Stack>
    <Suspense><Text>a</Text></Suspense>
    <Suspense fallback={Spin}><Text>b</Text></Suspense>
    <ErrorBoundary><Text>c</Text></ErrorBoundary>
    <ErrorBoundary fallback={Spin}><Text>d</Text></ErrorBoundary>
    <KeepAlive><Text>e</Text></KeepAlive>
    <KeepAlive include="x"><Text>f</Text></KeepAlive>
  </Stack>)
}`

  it('each tag names its OWN Compose limitation in the walled comment', () => {
    const code = kotlin(WALLED).code
    expect(code).toContain('<Suspense> unsupported on Android — rendering children only (no async-render-suspend on Compose)')
    expect(code).toContain('<ErrorBoundary> unsupported on Android — rendering children only (no render-time try/catch on Compose)')
    expect(code).toContain('<KeepAlive> unsupported on Android — rendering children only (no native state-cache across unmount on Compose)')
    // Children still render — the wall drops the prop, never the content.
    for (const t of ['a', 'b', 'c', 'd', 'e', 'f']) expect(code).toContain(`Text(text = "${t}")`)
  })

  it('a NON-JSX fallback is declined by name before the wall', () => {
    const ws = kotlin(WALLED).warnings
    expect(ws.some((w) => w.includes('<Suspense fallback={…}> on Kotlin target: only JSX-literal fallback is supported'))).toBe(true)
    expect(ws.some((w) => w.includes('<ErrorBoundary fallback={…}> on Kotlin target: only JSX-literal fallback is supported'))).toBe(true)
  })

  it('a dropped prop is listed with the per-tag consequence — and a tag with nothing droppable stays quiet', () => {
    const ws = kotlin(WALLED).warnings
    expect(ws).toContain(
      '<Suspense> on Kotlin target: dropped prop(s) [fallback] — no async-render-suspend on Compose; children render but fallback never shows during async loads. Use a per-target adapter (Layer 4: <NativeAndroid>) for full semantic parity.',
    )
    expect(ws).toContain(
      '<ErrorBoundary> on Kotlin target: dropped prop(s) [fallback] — no render-time try/catch on Compose; children render but fallback never shows on render errors. Use a per-target adapter (Layer 4: <NativeAndroid>) for full semantic parity.',
    )
    expect(ws).toContain(
      '<KeepAlive> on Kotlin target: dropped prop(s) [include] — no native state-cache across unmount on Compose; children render but cache behaviour is inert (children re-create on every mount). Use a per-target adapter (Layer 4: <NativeAndroid>) for full semantic parity.',
    )
    // The bare `<Suspense>` / `<ErrorBoundary>` / `<KeepAlive>` carry nothing
    // droppable, so they produce a wall comment and no warning of their own:
    // exactly 5 warnings for the six tags above.
    expect(ws).toHaveLength(5)
  })
})

describe('<Transition> timing on Kotlin', () => {
  const src = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Transition } from '@pyreon/primitives'
export function App() {
  const on = signal(true)
  return (<Stack>
    <Transition show={on()} enterEasing="ease-in" leaveEasing="ease-out"><Text>a</Text></Transition>
    <Transition show={on()} enterDuration={100}><Text>b</Text></Transition>
    <Transition show={on()} easing="linear"><Text>c</Text></Transition>
    <Transition show={on()} duration={250} enterDuration={100}><Text>d</Text></Transition>
  </Stack>)
}`

  it('asymmetric EASING alone splits the two specs while both keep the default duration', () => {
    expect(kotlin(src).code).toContain(
      'AnimatedVisibility(visible = on, enter = fadeIn(animationSpec = tween(durationMillis = 300, easing = FastOutLinearInEasing)), exit = fadeOut(animationSpec = tween(durationMillis = 300, easing = LinearOutSlowInEasing)))',
    )
  })

  it('an enter-only duration leaves the exit at the default; a symmetric `duration` supplies the side that is absent', () => {
    const code = kotlin(src).code
    expect(code).toContain(
      'enter = fadeIn(animationSpec = tween(durationMillis = 100, easing = FastOutSlowInEasing)), exit = fadeOut(animationSpec = tween(durationMillis = 300, easing = FastOutSlowInEasing))',
    )
    expect(code).toContain(
      'enter = fadeIn(animationSpec = tween(durationMillis = 100, easing = FastOutSlowInEasing)), exit = fadeOut(animationSpec = tween(durationMillis = 250, easing = FastOutSlowInEasing))',
    )
  })

  it('a symmetric easing with no duration still emits the 300ms default on both sides', () => {
    expect(kotlin(src).code).toContain(
      'enter = fadeIn(animationSpec = tween(durationMillis = 300, easing = LinearEasing)), exit = fadeOut(animationSpec = tween(durationMillis = 300, easing = LinearEasing))',
    )
  })

  it('no timing props at all emits the bare AnimatedVisibility', () => {
    const plain = src.replace(/ enterEasing="ease-in" leaveEasing="ease-out"/, '')
    expect(kotlin(plain).code).toContain('AnimatedVisibility(visible = on) {')
  })
})

describe('emitKotlinAction — handler shapes', () => {
  it('an async arrow WITH parameters keeps its binder and still opens the coroutine scope', () => {
    const r = kotlin(`import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button, For } from '@pyreon/primitives'
async function save(v: number): Promise<void> { }
export function App() {
  const rows = signal([1, 2])
  return (<Stack>
    <For each={rows()}>{(r: number) => (<Button onPress={async (x: number) => await save(x)}>go</Button>)}</For>
    <Text>x</Text>
  </Stack>)
}`)
    expect(r.code).toContain('Button(onClick = { x -> pyreonAsyncScope.launch { save(x) } })')
  })

  it('a MULTI-STATEMENT arrow with a parameter opens the lambda with `param ->`, not the bare `{`', () => {
    const r = kotlin(`import { signal } from '@pyreon/reactivity'
import { Stack, Text, Field } from '@pyreon/primitives'
export function App() {
  const s = signal('')
  const n = signal(0)
  return (<Stack>
    <Field value={s()} onChange={(v: string) => { s.set(v); n.set(v.length) }} />
    <Text>{n()}</Text>
  </Stack>)
}`)
    expect(r.code).toContain('onValueChange = { v ->')
    expect(r.code).toContain('        s = v')
    expect(r.code).toContain('        n = v.length')
  })
})

describe('non-lowering diagnostics de-duplicate and see through an optional receiver', () => {
  it('the same `&&` complaint fires ONCE across two identical expressions, and `.pop()` is caught on an OPTIONAL array', () => {
    const r = kotlin(`import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
interface Row { tags?: string[] }
export function App() {
  const n = signal(1)
  const row = signal<Row>({ tags: ['a'] })
  const a = () => { const t = row().tags; t?.pop() }
  const b = n() && n()
  const c = n() && n()
  return (<Stack><Text>{b ? 'y' : 'n'}{c ? 'y' : 'n'}</Text></Stack>)
}`)
    const logical = r.warnings.filter((w) => w.startsWith('`&&` with a non-boolean'))
    // One per SIDE, not one per occurrence: `b` and `c` are the same shape.
    expect(logical).toHaveLength(2)
    expect(logical.some((w) => w.includes('left operand'))).toBe(true)
    expect(logical.some((w) => w.includes('right operand'))).toBe(true)
    // `tags?: string[]` infers to a UNION — the unmapped-method check has to
    // look through the null branch to see the array receiver.
    expect(r.warnings.some((w) => w.startsWith('`.pop()` on an array has no lowering in PMTC'))).toBe(true)
  })
})

// The positive twin of every decline above: the shape that must NOT take the
// bail. Stated separately because a bail and its happy path are one decision,
// and a regression that made the bail unconditional would satisfy every
// decline spec on its own.
describe('the shapes that must NOT decline', () => {
  it('a JSX-literal fallback drives a real conditional on both walled tags', () => {
    const r = kotlin(`import { Stack, Text, Suspense, ErrorBoundary, KeepAlive } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const on = signal(true)
  return (<Stack>
    <Suspense fallback={<Text>wait</Text>}><Text>a</Text></Suspense>
    <ErrorBoundary fallback={<Text>oops</Text>}><Text>b</Text></ErrorBoundary>
    <KeepAlive when={on()}><Text>c</Text></KeepAlive>
  </Stack>)
}`)
    expect(r.warnings).toEqual([])
    // No fetch in scope, so the Suspense condition is statically false and the
    // ErrorBoundary's is statically null — but the branch structure is real.
    expect(r.code).toContain('if (false) {')
    expect(r.code).toContain('PyreonKeepAliveWrapper(when_ = on) {')
    for (const t of ['wait', 'oops', 'a', 'b', 'c']) expect(r.code).toContain(`Text(text = "${t}")`)
  })

  it('a <Show when> lowers its condition rather than falling back to `true`', () => {
    const r = kotlin(`import { Stack, Text, Show } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const on = signal(true)
  return (<Stack><Show when={on()}><Text>yes</Text></Show></Stack>)
}`)
    expect(r.code).toContain('if (on) {')
  })

  it('handler shapes that are NOT multi-statement, NOT async and NOT a bare arrow each keep their own form', () => {
    const r = kotlin(`import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button, Field } from '@pyreon/primitives'
function Row(props: { onRemove: () => void }) { return (<Button onPress={props.onRemove}>x</Button>) }
export function App() {
  const s = signal('')
  const n = signal(0)
  return (<Stack>
    <Row onRemove={() => n.set(0)} />
    <Button onPress={() => { n.set(1); n.set(2) }}>multi</Button>
    <Field value={s()} onChange={(v: string) => s.set(v)} />
    <Text>{n()}</Text>
  </Stack>)
}`)
    expect(r.warnings).toEqual([])
    // A function-typed prop is CALLED, not spliced as a value.
    expect(r.code).toContain('Button(onClick = { onRemove() })')
    // A zero-param multi-statement body opens with a bare `{`, not `{ ->`.
    expect(r.code).toContain('Button(onClick = {\n')
    // A single-expression arrow WITH a param keeps the binder and stays inline.
    expect(r.code).toContain('onValueChange = { v -> s = v }')
  })
})
