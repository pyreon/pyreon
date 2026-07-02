import { describe, expect, it } from 'vitest'
import { transform } from '../index'

// Component props end-to-end (iter43). Pre-fix, the DOMINANT real-world
// component shape — `type CardProps = { … }` + `function Card(props:
// CardProps)` — parsed to EMPTY props with NO warning: the emitted
// component declared no stored properties (Swift) / parameters (Kotlin)
// while its body referenced them bare and call sites passed args —
// uncompilable on BOTH targets. Sibling gaps fixed in the same class:
// optional fields (`label?: string`) dropped their `?` everywhere; JSX
// call-site args emitted in AUTHOR order (Swift's memberwise init
// hard-errors out of declaration order); props never seeded inference
// (computeds over props annotated `Any`); a bare optional in Text
// rendered `Optional(x)` / `null` instead of JSX's empty.

const NAMED_REF_APP = `
import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'

type CardProps = { qty: number; label?: string }

export function Card(props: CardProps) {
  const total = computed(() => props.qty * 2)
  return (
    <Stack gap="md">
      <Text>{props.label}</Text>
      <Text>{total()}</Text>
      <Text>{props.label ?? "anon"}</Text>
    </Stack>
  )
}

export function App() {
  const n = signal(1)
  return (
    <Stack gap="lg">
      <Card label="hi" qty={n()} />
      <Card qty={2} />
      <Button onPress={() => n.set(n() + 1)}>Bump</Button>
    </Stack>
  )
}
`

describe('component props via a NAMED local type alias', () => {
  it('Swift: resolves the alias — stored properties are declared', () => {
    const out = transform(NAMED_REF_APP, { target: 'swift' })
    expect(out.code).toContain('let qty: Int')
    expect(out.code).toContain('var label: String? = nil')
    expect(out.warnings ?? []).toEqual([])
  })

  it('Kotlin: resolves the alias — parameters are declared', () => {
    const out = transform(NAMED_REF_APP, { target: 'kotlin' })
    expect(out.code).toContain('fun Card(qty: Int, label: String? = null)')
    expect(out.warnings ?? []).toEqual([])
  })

  it('resolves regardless of declaration order (alias BELOW the component)', () => {
    const src = `
import { Stack, Text } from '@pyreon/primitives'
export function Card(props: CardProps) {
  return <Stack gap="md"><Text>{props.qty}</Text></Stack>
}
type CardProps = { qty: number }
`
    const out = transform(src, { target: 'swift' })
    expect(out.code).toContain('let qty: Int')
  })

  it('resolves through the DESTRUCTURED param shape too', () => {
    const src = `
import { Stack, Text } from '@pyreon/primitives'
type RowProps = { label: string; qty: number }
export function Row({ label, qty }: RowProps) {
  return <Stack gap="sm"><Text>{label}</Text><Text>{qty}</Text></Stack>
}
`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toContain('let label: String')
    expect(sw.code).toContain('let qty: Int')
    const kt = transform(src, { target: 'kotlin' })
    expect(kt.code).toContain('fun Row(label: String, qty: Int)')
  })

  it('an UNRESOLVABLE props type warns loudly (imported type)', () => {
    const src = `
import { Stack, Text } from '@pyreon/primitives'
import type { CardProps } from './types'
export function Card(props: CardProps) {
  return <Stack gap="md"><Text>{props.qty}</Text></Stack>
}
`
    const out = transform(src, { target: 'swift' })
    const warning = (out.warnings ?? []).find((w) => w.includes('CardProps'))
    expect(warning).toBeDefined()
    expect(warning).toContain("can't be resolved")
  })
})

describe('optional props / fields preserve `?` with omit-friendly defaults', () => {
  it('Swift: declared struct gets `var x: T? = nil` (memberwise-omittable)', () => {
    const out = transform(NAMED_REF_APP, { target: 'swift' }).code
    // the CardProps Codable struct AND the Card View both carry the default
    const structBlock = out.slice(out.indexOf('struct CardProps'), out.indexOf('struct Card:'))
    expect(structBlock).toContain('var label: String? = nil')
    expect(structBlock).toContain('var qty: Int')
    expect(structBlock).not.toContain('var qty: Int?')
  })

  it('Kotlin: data class gets `var x: T? = null`', () => {
    const out = transform(NAMED_REF_APP, { target: 'kotlin' }).code
    expect(out).toContain('data class CardProps(var qty: Int, var label: String? = null)')
  })

  it('call sites may OMIT an optional prop (no arg emitted, default fills)', () => {
    const sw = transform(NAMED_REF_APP, { target: 'swift' }).code
    expect(sw).toContain('Card(qty: 2)')
    const kt = transform(NAMED_REF_APP, { target: 'kotlin' }).code
    expect(kt).toContain('Card(qty = 2)')
  })
})

describe('Swift call-site args follow property DECLARATION order', () => {
  it('reorders author-order JSX attrs (memberwise init is order-strict)', () => {
    // JSX writes label FIRST but CardProps declares qty first — the emit
    // must flip them; `Card(label: "hi", qty: n)` is a swiftc hard error
    // ("argument 'qty' must precede argument 'label'").
    const out = transform(NAMED_REF_APP, { target: 'swift' }).code
    expect(out).toContain('Card(qty: n, label: "hi")')
    expect(out).not.toContain('Card(label: "hi", qty: n)')
  })
})

describe('props seed the inference ctx', () => {
  it('a computed over `props.x` (member form) infers the prop type, not Any', () => {
    const out = transform(NAMED_REF_APP, { target: 'swift' }).code
    expect(out).toContain('private var total: Int { qty * 2 }')
    expect(out).not.toContain('private var total: Any')
  })

  it('a computed over a BARE destructured prop infers too', () => {
    const src = `
import { computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type P = { qty: number }
export function Row({ qty }: P) {
  const doubled = computed(() => qty * 2)
  return <Stack gap="sm"><Text>{doubled()}</Text></Stack>
}
`
    const out = transform(src, { target: 'swift' }).code
    expect(out).toContain('private var doubled: Int { qty * 2 }')
  })
})

describe('optional values in Text render EMPTY when absent (JSX parity)', () => {
  it('Swift: optional interpolation maps to "" — never `Optional(x)`', () => {
    const out = transform(NAMED_REF_APP, { target: 'swift' }).code
    expect(out).toContain('Text("\\((label).map { "\\($0)" } ?? "")")')
  })

  it('Kotlin: optional interpolation gets `?: ""` — never a literal "null"', () => {
    const out = transform(NAMED_REF_APP, { target: 'kotlin' }).code
    expect(out).toContain('Text(text = "${label ?: ""}")')
  })

  it('a ??-collapsed read stays a PLAIN interpolation (no double guard)', () => {
    const sw = transform(NAMED_REF_APP, { target: 'swift' }).code
    expect(sw).toContain('Text("\\((label ?? "anon"))")')
    const kt = transform(NAMED_REF_APP, { target: 'kotlin' }).code
    expect(kt).toContain('Text(text = "${(label ?: "anon")}")')
  })

  it('a NON-optional value keeps the bare interpolation byte-shape', () => {
    const sw = transform(NAMED_REF_APP, { target: 'swift' }).code
    expect(sw).toContain('Text("\\(total)")')
    const kt = transform(NAMED_REF_APP, { target: 'kotlin' }).code
    expect(kt).toContain('Text(text = "${total}")')
  })
})
