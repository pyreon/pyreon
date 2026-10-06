// `<Show fallback>` lowering + the "JSX-valued attribute nobody reads" class
// (issue #3788).
//
// The released emitters read only `when` + children, so a legal
// `fallback={<Text>…</Text>}` was dropped with `warnings: []` and the screen
// started EMPTY in exactly the state the fallback exists to cover. These specs
// lock (1) the if/else emit on both targets, in every nesting position, (2) that
// it COMPILES under the real swiftc / kotlinc (against the repo's stubs), and
// (3) that a JSX-valued attribute no emitter reads is NAMED, never dropped.

import { describe, expect, it, vi } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

vi.setConfig({ testTimeout: 90_000 })

function src(body: string): string {
  return `import { Show, For, Suspense, ErrorBoundary } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { Text, Stack } from '@pyreon/primitives'
export function Example() {
  const visible = signal(false)
  const items = signal([{ id: 1, n: 'a' }])
  return ${body}
}`
}

const norm = (s: string): string => s.replace(/\s+/g, ' ')
function both(body: string) {
  return {
    swift: transform(src(body), { target: 'swift', filename: 'Example.tsx' }),
    kotlin: transform(src(body), { target: 'kotlin', filename: 'Example.tsx' }),
  }
}

const SHAPES: Record<string, string> = {
  'issue repro': `<Show when={() => visible()} fallback={<Text>Fallback content</Text>}><Text>Visible content</Text></Show>`,
  'inside Stack': `<Stack><Show when={() => visible()} fallback={<Text>F</Text>}><Text>V</Text></Show></Stack>`,
  'inside For row': `<Stack><For each={() => items()} by={(i) => i.id}>{(i) => <Show when={() => visible()} fallback={<Text>F{i.n}</Text>}><Text>V</Text></Show>}</For></Stack>`,
  'Show inside Show fallback': `<Show when={() => visible()} fallback={<Show when={() => items().length > 0} fallback={<Text>E</Text>}><Text>I</Text></Show>}><Text>V</Text></Show>`,
  'fragment fallback': `<Show when={() => visible()} fallback={<><Text>a</Text><Text>b</Text></>}><Text>V</Text></Show>`,
  'accessor fallback': `<Show when={() => visible()} fallback={() => <Text>A</Text>}><Text>V</Text></Show>`,
  'Show in Suspense fallback': `<Suspense fallback={<Show when={() => visible()} fallback={<Text>F</Text>}><Text>S</Text></Show>}><Text>V</Text></Suspense>`,
}

describe('<Show fallback> emit', () => {
  it('issue repro: emits if/else with the fallback on both targets, no warnings', () => {
    const { swift, kotlin } = both(SHAPES['issue repro']!)
    expect(norm(swift.code)).toContain('if visible { Text("Visible content") } else { Text("Fallback content") }')
    expect(norm(kotlin.code)).toContain('if (visible) { Text(text = "Visible content") } else { Text(text = "Fallback content") }')
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })

  it('the else branch is driven by the SAME condition (toggles with the signal)', () => {
    const { swift, kotlin } = both(SHAPES['inside For row']!)
    expect(norm(swift.code)).toContain('if visible { Text("V") } else { Text(verbatim: "F\\(i.n)") }')
    expect(norm(kotlin.code)).toContain('if (visible) { Text(text = "V") } else { Text(text = "F${i.n}") }')
  })

  it('a fragment fallback emits each child (not one stringified Group)', () => {
    const { swift, kotlin } = both(SHAPES['fragment fallback']!)
    expect(norm(swift.code)).toContain('} else { Text("a") Text("b") }')
    expect(norm(kotlin.code)).toContain('} else { Text(text = "a") Text(text = "b") }')
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })

  it('a Show with no fallback is unchanged (no else, no warning)', () => {
    const { swift, kotlin } = both(`<Show when={() => visible()}><Text>V</Text></Show>`)
    expect(norm(swift.code)).toContain('if visible { Text("V") } }')
    expect(swift.code).not.toContain('else')
    expect(kotlin.code).not.toContain('else')
    expect(swift.warnings).toEqual([])
  })

  it('fallback={null} means no fallback and does not warn', () => {
    const { swift, kotlin } = both(`<Show when={() => visible()} fallback={null}><Text>V</Text></Show>`)
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
    expect(swift.code).not.toContain('else')
  })
})

describe('fallback shapes that cannot lower are NAMED, never dropped', () => {
  it.each([
    ['string literal', `<Show when={() => visible()} fallback="nope"><Text>V</Text></Show>`],
  ])('Show %s', (_n, body) => {
    const { swift, kotlin } = both(body)
    for (const r of [swift, kotlin]) {
      expect(r.warnings.length).toBe(1)
      expect(r.warnings[0]).toContain('<Show fallback={…}>')
      expect(r.warnings[0]).toContain('DROPPED')
      expect(r.warnings[0]).toContain('"nope"')
    }
  })

  it('a bound view (identifier) is named', () => {
    const { swift, kotlin } = both(`<Show when={() => visible()} fallback={items}><Text>V</Text></Show>`)
    expect(swift.warnings[0]).toContain('the binding `items`')
    expect(kotlin.warnings[0]).toContain('the binding `items`')
  })

  it('Suspense/ErrorBoundary share the classifier (fragment lowers, literal warns)', () => {
    const frag = both(`<Suspense fallback={<><Text>a</Text><Text>b</Text></>}><Text>V</Text></Suspense>`)
    expect(frag.swift.warnings).toEqual([])
    expect(norm(frag.swift.code)).toContain('Text("a") Text("b")')
    const lit = both(`<ErrorBoundary fallback="x"><Text>V</Text></ErrorBoundary>`)
    expect(lit.swift.warnings.join('\n')).toContain('<ErrorBoundary fallback={…}>')
    expect(lit.kotlin.warnings.join('\n')).toContain('<ErrorBoundary fallback={…}>')
  })
})

describe('a JSX-valued attribute no emitter reads is reported (central check)', () => {
  it.each(['Stack', 'Text', 'For'])('<%s header={<…/>}> warns on both targets', (tag) => {
    const body =
      tag === 'For'
        ? `<For each={() => items()} by={(i) => i.id} header={<Text>H</Text>}>{(i) => <Text>{i.n}</Text>}</For>`
        : `<${tag} header={<Text>H</Text>}><Text>V</Text></${tag}>`
    const { swift, kotlin } = both(body)
    for (const r of [swift, kotlin]) {
      expect(r.warnings.join('\n')).toContain(`<${tag} header={<…/>}>`)
      expect(r.warnings.join('\n')).toContain('DROPPED')
    }
  })

  it('a USER component slot prop is consumed (no warning)', () => {
    const s = `import { Text, Stack } from '@pyreon/primitives'
function Card(props: { header?: VNodeChild; children?: VNodeChild }) { return <Stack>{props.header}{props.children}</Stack> }
export function Example() { return <Card header={<Text>H</Text>}><Text>x</Text></Card> }`
    expect(transform(s, { target: 'swift' }).warnings).toEqual([])
    expect(transform(s, { target: 'kotlin' }).warnings).toEqual([])
  })

  it('Show/Suspense/ErrorBoundary `fallback` are consumed (no central warning)', () => {
    for (const k of ['issue repro', 'Show in Suspense fallback']) {
      const { swift, kotlin } = both(SHAPES[k]!)
      expect(swift.warnings).toEqual([])
      expect(kotlin.warnings).toEqual([])
    }
  })
})

describe('real toolchains compile show+fallback in every nesting position', () => {
  const swiftSkip =
    process.env.PYREON_SKIP_NATIVE_VALIDATE === '1' ||
    (!isSwiftcAvailable() && process.env.PYREON_REQUIRE_NATIVE_VALIDATE !== '1')
  const kotlinSkip =
    process.env.PYREON_SKIP_NATIVE_VALIDATE === '1' ||
    (!isKotlincAvailable() && process.env.PYREON_REQUIRE_NATIVE_VALIDATE !== '1')

  for (const [name, body] of Object.entries(SHAPES)) {
    it.skipIf(swiftSkip)(`swiftc (stubs): ${name}`, () => {
      const res = validateSwiftWithStubs(transform(src(body), { target: 'swift' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    })
    it.skipIf(kotlinSkip)(`kotlinc (stubs): ${name}`, () => {
      const res = validateKotlin(transform(src(body), { target: 'kotlin' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    })
  }
})

describe('<Element beforeContent> (lowered to Stack) is named against the tag the author wrote', () => {
  it('warns once as <Element …>, not as <Stack …>', () => {
    const s = `import { Element } from '@pyreon/elements'
import { Text } from '@pyreon/primitives'
export function Example() { return <Element beforeContent={<Text>B</Text>}><Text>V</Text></Element> }`
    for (const target of ['swift', 'kotlin'] as const) {
      const w = transform(s, { target }).warnings.filter((x) => x.includes('beforeContent'))
      expect(w).toHaveLength(1)
      expect(w[0]).toContain('<Element beforeContent={<…/>}>')
    }
  })
})
