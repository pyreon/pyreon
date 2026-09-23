// Plain <div>/<p>/<span> inside a native Flow renderer lower only where the
// native layout provably matches the browser's: text-only content becomes a
// <Text>, and a <div> of block children (or of one child) becomes a flush-left,
// gap-free <Stack>. Everything else keeps the warning that names <FlowWebView>.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const DOM_WARNING = 'is a DOM/SVG element with no native lowering'

const app = (body: string) => `
  import { createFlow, Flow, type NodeComponentProps } from '@pyreon/flow'
  interface CardData { label: string; note: string }
  function CardNode(props: NodeComponentProps<CardData>) {
    return ${body}
  }
  export function Diagram() {
    const flow = createFlow({ nodes: [{ id: 'a', type: 'card', position: { x: 0, y: 0 }, data: { label: 'A', note: 'n' } }], edges: [] })
    return <Flow instance={flow} nodeTypes={{ card: CardNode }} />
  }
`

describe('plain DOM elements in a native Flow renderer', () => {
  const CARD = app(`(
    <div>
      <div data-testid="card-title">{props.data().label}</div>
      <p>Note: {props.data().note}</p>
    </div>
  )`)

  it('swift: a div of block children is a flush-left stack, text-only content is Text', () => {
    const result = transform(CARD, { target: 'swift' })
    expect(result.code).toContain('VStack(alignment: .leading, spacing: 0)')
    expect(result.code).toContain('.accessibilityIdentifier("card-title")')
    expect(result.warnings.join('\n')).not.toContain(DOM_WARNING)
    if (isSwiftcAvailable()) {
      const v = validateSwiftWithStubs(result.code)
      expect(v.ok, v.error ?? '').toBe(true)
    }
  })

  it('kotlin: the same shapes lower, and compile', () => {
    const result = transform(CARD, { target: 'kotlin' })
    expect(result.code).toContain('Column(verticalArrangement = Arrangement.spacedBy(0.dp), horizontalAlignment = Alignment.Start)')
    expect(result.warnings.join('\n')).not.toContain(DOM_WARNING)
    if (isKotlincAvailable()) {
      const v = validateKotlin(result.code)
      expect(v.ok, v.error ?? '').toBe(true)
    }
  })

  // Each of these has a browser layout the two lowered shapes do not
  // reproduce, so it must stay a warning rather than draw something plausible.
  const KEEP_WARNING: [string, string][] = [
    ['a class, resolved against a stylesheet', '<div class="card">{props.data().label}</div>'],
    ['an inline style', '<div style="display: flex">{props.data().label}</div>'],
    ['an event handler', '<div onClick={() => {}}>{props.data().label}</div>'],
    ['inline children, which flow on one line', '<div><span>a</span><span>b</span></div>'],
    ['text mixed with elements', '<div>Note: <span>b</span></div>'],
    ['a span wrapping an element', '<span><div>a</div></span>'],
  ]
  for (const [name, body] of KEEP_WARNING) {
    it(`keeps the warning for ${name}`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        expect(transform(app(`(${body})`), { target }).warnings.join('\n'), target).toContain(DOM_WARNING)
      }
    })
  }

  it('outside a Flow renderer a div is still web markup', () => {
    const src = `export function Plain() { return <div>hi</div> }`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(src, { target }).warnings.join('\n'), target).toContain(DOM_WARNING)
    }
  })
})
