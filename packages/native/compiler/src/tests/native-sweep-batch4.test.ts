import { describe, expect, it } from 'vitest'
import { transform } from '../index'

// Sweep batch 4 (iter45). Four finds, three of them SILENT:
// (1) a template-literal (or any dynamic) value in `data-testid` /
// `accessibilityLabel` was silently DROPPED on both targets — the
// a11y/e2e-critical shape inside For rows (`data-testid={`row-${i}`}`);
// both native slots accept dynamic string exprs, so this now lowers.
// (2) a switch over an ENUM-typed subject emitted raw STRING case
// labels (`case "busy":` / `"busy" ->`) — a swiftc type error / kotlinc
// incompatible-types error. (3) `JSON.parse`/`JSON.stringify` emitted
// VERBATIM (`JSON` doesn't exist natively — unresolved reference, no
// warning) — now a NAMED warning. (4) a destructured callback param
// (`([k, v]) => k`) emitted a closure over UNBOUND names — now a NAMED
// warning (+ the tuple-type warning names the object-type fix).

const DYN_ATTRS = `
import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const n = signal(1)
  return (
    <Stack gap="sm" data-testid="root">
      <Text accessibilityLabel={\`item \${n()}\`}>hi</Text>
      <Button data-testid={\`row-\${n()}\`} onPress={() => n.set(n() + 1)}>go</Button>
    </Stack>
  )
}`

const ENUM_SWITCH = `
import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Status = 'idle' | 'busy' | 'done'
export function App() {
  const status = signal<Status>('idle')
  const label = computed(() => {
    switch (status()) {
      case 'busy': return "Working"
      case 'done': return "Finished"
      default: return "Ready"
    }
  })
  return <Stack gap="sm"><Text>{label()}</Text></Stack>
}`

const STRING_SWITCH = `
import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const raw = signal("a")
  const label = computed(() => {
    switch (raw()) {
      case 'a': return "A"
      default: return "other"
    }
  })
  return <Stack gap="sm"><Text>{label()}</Text></Stack>
}`

describe('dynamic data-testid / accessibilityLabel lower (were silently dropped)', () => {
  it('Swift: template testid → interpolated .accessibilityIdentifier', () => {
    const out = transform(DYN_ATTRS, { target: 'swift' }).code
    expect(out).toContain('.accessibilityIdentifier("row-\\(n)")')
    expect(out).toContain('.accessibilityLabel("item \\(n)")')
  })

  it('Kotlin: template testid → interpolated Modifier.testTag', () => {
    const out = transform(DYN_ATTRS, { target: 'kotlin' }).code
    expect(out).toContain('.testTag("row-${n}")')
    expect(out).toContain('contentDescription = "item ${n}"')
  })

  it('STATIC testid keeps its byte-shape (incl. the container .contain gate)', () => {
    const sw = transform(DYN_ATTRS, { target: 'swift' }).code
    expect(sw).toContain('.accessibilityElement(children: .contain)')
    expect(sw).toContain('.accessibilityIdentifier("root")')
    const kt = transform(DYN_ATTRS, { target: 'kotlin' }).code
    expect(kt).toContain('.testTag("root")')
  })

  it('a NON-template dynamic value (signal read) interpolates too', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const id = signal("x1")
  return <Stack gap="sm"><Text data-testid={id()}>hi</Text></Stack>
}`
    const sw = transform(src, { target: 'swift' }).code
    expect(sw).toContain('.accessibilityIdentifier("\\(id)")')
    const kt = transform(src, { target: 'kotlin' }).code
    expect(kt).toContain('.testTag("${id}")')
  })
})

describe('switch over an ENUM subject maps case labels to enum members', () => {
  it('Swift: `case .busy:` — never the raw string pattern', () => {
    const out = transform(ENUM_SWITCH, { target: 'swift' }).code
    expect(out).toContain('case .busy:')
    expect(out).toContain('case .done:')
    expect(out).not.toContain('case "busy":')
  })

  it('Kotlin: `Status.busy ->` — never the raw string branch', () => {
    const out = transform(ENUM_SWITCH, { target: 'kotlin' }).code
    expect(out).toContain('Status.busy ->')
    expect(out).not.toContain('"busy" ->')
  })

  it('case BODIES keep string literals as strings (labels only)', () => {
    const sw = transform(ENUM_SWITCH, { target: 'swift' }).code
    expect(sw).toContain('return "Working"')
    const kt = transform(ENUM_SWITCH, { target: 'kotlin' }).code
    expect(kt).toContain('"Working"')
  })

  it('a NON-enum (string) switch keeps raw string labels', () => {
    const sw = transform(STRING_SWITCH, { target: 'swift' }).code
    expect(sw).toContain('case "a":')
    const kt = transform(STRING_SWITCH, { target: 'kotlin' }).code
    expect(kt).toContain('"a" ->')
  })
})

describe('JSON.parse / JSON.stringify fail loudly (were verbatim + unresolved)', () => {
  it('stringify warns by name and never emits a bare JSON reference', () => {
    const src = `
import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Todo = { id: number }
export function App() {
  const todos = signal<Todo[]>([{ id: 1 }])
  const dump = computed(() => JSON.stringify(todos()))
  return <Stack gap="sm"><Text>{dump()}</Text></Stack>
}`
    const out = transform(src, { target: 'swift' })
    expect((out.warnings ?? []).some((w) => w.includes('JSON.stringify'))).toBe(true)
    expect(out.code).not.toContain('JSON.stringify')
  })

  it('parse warns by name too', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const raw = signal("{}")
  return <Stack gap="sm"><Button onPress={() => { const v = JSON.parse(raw()) }}>p</Button></Stack>
}`
    const out = transform(src, { target: 'kotlin' })
    expect((out.warnings ?? []).some((w) => w.includes('JSON.parse'))).toBe(true)
  })
})

describe('destructured callback params fail loudly (were unbound-name closures)', () => {
  it('array pattern warns + tuple-type warning names the object fix', () => {
    const src = `
import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const pairs = signal<[string, number][]>([["a", 1]])
  const keys = computed(() => pairs().map(([k, v]) => k).join(","))
  return <Stack gap="sm"><Text>{keys()}</Text></Stack>
}`
    const out = transform(src, { target: 'swift' })
    const w = out.warnings ?? []
    expect(w.some((x) => x.includes('destructured callback parameter'))).toBe(true)
    expect(w.some((x) => x.includes('Tuple types'))).toBe(true)
    expect(w.some((x) => x.includes('use an object type'))).toBe(true)
  })

  it('object pattern warns too', () => {
    const src = `
import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Todo = { id: number; text: string }
export function App() {
  const todos = signal<Todo[]>([{ id: 1, text: "a" }])
  const ids = computed(() => todos().map(({ id }) => id).join(","))
  return <Stack gap="sm"><Text>{ids()}</Text></Stack>
}`
    const out = transform(src, { target: 'kotlin' })
    expect(
      (out.warnings ?? []).some((x) => x.includes('destructured callback parameter')),
    ).toBe(true)
  })
})
