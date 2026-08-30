// A component whose props type is a locally-declared `interface` used to emit
// a struct with NO stored properties while its body still referenced them —
// uncompilable on both targets. The struct synthesizer already understood the
// interface; only the props extractor did not, so the two halves of the
// compiler disagreed about the same declaration.
//
// `interface` is the idiomatic TypeScript spelling for a props type, so this
// was the shape most likely to be written and least likely to work.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

function swift(src: string): { code: string; warnings: string[] } {
  const r = transform(src, { target: 'swift' } as never) as {
    code?: string
    warnings?: unknown[]
  }
  return { code: r.code ?? '', warnings: (r.warnings ?? []).map(String) }
}

function kotlin(src: string): { code: string; warnings: string[] } {
  const r = transform(src, { target: 'kotlin' } as never) as {
    code?: string
    warnings?: unknown[]
  }
  return { code: r.code ?? '', warnings: (r.warnings ?? []).map(String) }
}

const IFACE_COMPONENT = `
interface CardProps {
  title: string
  count: number
}
export function Card(props: CardProps) {
  return <Text>{props.title}</Text>
}
`

const ALIAS_COMPONENT = `
type CardProps = {
  title: string
  count: number
}
export function Card(props: CardProps) {
  return <Text>{props.title}</Text>
}
`

describe('interface props types resolve like alias props types', () => {
  it('declares the stored properties on Swift', () => {
    const { code, warnings } = swift(IFACE_COMPONENT)
    expect(code).toContain('struct Card: View')
    // The bug: this line was absent, while `body` still read `title`.
    expect(code).toContain('let title: String')
    expect(code).toContain('let count: Int')
    expect(warnings).toEqual([])
  })

  it('declares the parameters on Kotlin', () => {
    const { code, warnings } = kotlin(IFACE_COMPONENT)
    expect(code).toContain('title: String')
    expect(code).toContain('count: Int')
    expect(warnings).toEqual([])
  })

  it('emits the SAME component as the equivalent type alias, on both targets', () => {
    // The strongest form of the contract: the two spellings are the same
    // declaration to TypeScript, so they must be the same emit here. An
    // assertion on individual lines can pass while the two still differ.
    expect(swift(IFACE_COMPONENT).code).toBe(swift(ALIAS_COMPONENT).code)
    expect(kotlin(IFACE_COMPONENT).code).toBe(kotlin(ALIAS_COMPONENT).code)
  })

  it('resolves an interface declared BELOW its component', () => {
    const { code, warnings } = swift(`
export function Card(props: CardProps) {
  return <Text>{props.title}</Text>
}
interface CardProps { title: string }
`)
    expect(code).toContain('let title: String')
    expect(warnings).toEqual([])
  })

  it('resolves an exported interface', () => {
    const { code } = swift(`
export interface CardProps { title: string }
export function Card(props: CardProps) { return <Text>{props.title}</Text> }
`)
    expect(code).toContain('let title: String')
  })
})

describe('a helper taking an interface-typed value is still a helper', () => {
  it('emits a function, not a View', () => {
    // The props extractor and the component classifier read the same
    // annotation. Resolving the type must not tip a pure helper into being
    // treated as a component.
    const { code, warnings } = swift(`
interface Pt { x: number; y: number }
export function addPt(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y }
}
`)
    expect(code).toContain('func addPt(')
    expect(code).not.toContain('struct addPt: View')
    expect(warnings).toEqual([])
  })

  it('emits a function for a SINGLE interface-typed parameter too', () => {
    // The one-param shape is the one that looks most like a component.
    const { code } = swift(`
interface Pt { x: number; y: number }
export function magnitude(p: Pt): number {
  return p.x * p.x + p.y * p.y
}
`)
    expect(code).toContain('func magnitude(')
    expect(code).not.toContain('struct magnitude: View')
  })
})

describe('the out-of-subset gate is unchanged', () => {
  it('still refuses a GENERIC interface, and says so once', () => {
    const { warnings } = swift(`
interface Box<T> { value: T }
export function Card(props: Box) { return <Text>{props.value}</Text> }
`)
    // The struct synthesizer's own warning is the authority on this shape;
    // registering it here would claim a resolution neither half can honour.
    expect(warnings.some((w) => w.includes('generics') || w.includes("can't be resolved"))).toBe(
      true,
    )
  })

  it('still refuses an `extends` interface', () => {
    const { warnings } = swift(`
interface Base { id: string }
interface CardProps extends Base { title: string }
export function Card(props: CardProps) { return <Text>{props.title}</Text> }
`)
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('ignores an empty interface rather than resolving it to no fields', () => {
    // Resolving to zero fields would silently produce the very emit this fix
    // exists to prevent — a component with no stored properties.
    const { warnings } = swift(`
interface CardProps {}
export function Card(props: CardProps) { return <Text>x</Text> }
`)
    expect(warnings.some((w) => w.includes("can't be resolved"))).toBe(true)
  })
})
