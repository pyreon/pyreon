// Branch-coverage matrices for the Swift USER-COMPONENT invocation emit (prop
// spreads, memberwise argument ordering, `on<Cap>` event props) and for
// `emitSwiftChild`'s view-vs-value dispatch.
//
// The argument-ORDER arm is the one that decides whether the emit compiles at
// all: a Swift memberwise initializer rejects out-of-order labels outright
// (`argument 'qty' must precede argument 'label'`), so a spec that only checks
// "both props are present" cannot see the bug. Each ordering spec therefore
// asserts the exact argument SEQUENCE.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const sw = (src: string) => transform(src, { target: 'swift' })

const APP = (body: string, extra = '') => `
  import { Stack, Text } from '@pyreon/primitives'
  export function Row(props: { label: string; qty: number }) {
    return <Text>{props.label}</Text>
  }
  export function Cb(props: { onToggle: () => void }) {
    return <Text>c</Text>
  }
  ${extra}
  export function App() {
    const bag = { label: 'a', qty: 2 }
    const fn = () => {}
    return (<Stack>${body}</Stack>)
  }
`

describe('user-component invocation — spread expansion', () => {
  it('an OBJECT-LITERAL spread expands each field, skipping explicit props', () => {
    const { code } = sw(APP(`<Row {...{ label: 'x', qty: 1 }} qty={9} />`))
    // The explicit `qty` wins; the spread contributes only `label`.
    expect(code).toContain('Row(label: "x", qty: 9)')
  })

  it('an IDENTIFIER spread expands the TARGET component\'s declared props', () => {
    const { code } = sw(APP(`<Row {...bag} />`))
    expect(code).toContain('Row(label: bag.label, qty: bag.qty)')
  })

  it('an object-literal spread that itself CONTAINS a spread is not expandable', () => {
    const { warnings } = sw(APP(`<Row {...{ ...bag, label: 'x' }} />`))
    expect(warnings.some((w) => w.includes('spread could not be expanded'))).toBe(true)
  })

  it('a spread onto a NON-user tag never reaches the expander — it warns once, up front', () => {
    // `isUserComponent` is false, so the spread arm in the attr loop is
    // skipped entirely and the single top-of-`emitSwiftJsx` warning covers it.
    const { warnings } = sw(APP(`<Unknown {...bag} />`))
    expect(warnings.some((w) => w.includes('spread is not lowered to native'))).toBe(true)
    expect(warnings.some((w) => w.includes('spread could not be expanded'))).toBe(false)
  })

  it('a spread whose source is a CALL is not a binding and warns', () => {
    const { warnings } = sw(APP(`<Row {...fn()} />`))
    expect(warnings.some((w) => w.includes('spread could not be expanded'))).toBe(true)
  })
})

describe('user-component invocation — memberwise argument ORDER', () => {
  it('author order is re-sorted into DECLARATION order', () => {
    // Written qty-first; Swift requires label first.
    const { code } = sw(APP(`<Row qty={2} label="a" />`))
    expect(code).toContain('Row(label: "a", qty: 2)')
  })

  it('a prop NOT in the declared list keeps author order at the end', () => {
    const { code } = sw(APP(`<Row extra={1} qty={2} label="a" />`))
    expect(code).toMatch(/Row\(label: "a", qty: 2, extra: 1\)/)
  })

  it('a NON-user component (a SwiftUI primitive) keeps author order', () => {
    const { code } = sw(APP(`<Text>t</Text>`))
    expect(code).toContain('Text("t")')
  })

  it('a component with NO props emits the bare call', () => {
    const { code } = sw(APP(`<Empty />`, `export function Empty() { return <Text>e</Text> }`))
    expect(code).toContain('Empty()')
  })
})

describe('user-component invocation — on<Cap> event props', () => {
  it('an `on`-prefixed event prop recovers its camelCase name', () => {
    const { code } = sw(APP(`<Cb onToggle={fn} />`))
    expect(code).toContain('onToggle:')
  })

  it('the SAME event name on a BUILT-IN tag is not turned into a prop', () => {
    const { code } = sw(APP(`<Text onPress={fn}>t</Text>`))
    expect(code).not.toContain('onPress:')
  })
})

describe('emitSwiftChild — the view / value dispatch', () => {
  it('a TEXT child becomes Text(literal)', () => {
    expect(sw(APP(`plain`)).code).toContain('Text("plain")')
  })

  it('a TEMPLATE child is used as the Text content directly, with no double wrap', () => {
    const { code } = sw(APP('{`a${1}b`}'))
    expect(code).toContain('Text("a\\(1)b")')
    expect(code).not.toContain('Text(verbatim: "\\("a')
  })

  it('a plain VALUE child interpolates through the verbatim form', () => {
    expect(sw(APP(`{1 + 2}`)).code).toContain('Text(verbatim: "\\(1 + 2)")')
  })

  it('`{cond && <View/>}` lowers to `if cond { … }`, not a Bool&&View', () => {
    const { code } = sw(APP(`{true && <Text>y</Text>}`))
    expect(code).toContain('if true {')
    expect(code).toContain('Text("y")')
  })

  it('a VIEW ternary lowers to if/else; a VALUE ternary stays a `? :` expression', () => {
    const view = sw(APP(`{true ? <Text>a</Text> : <Text>b</Text>}`)).code
    expect(view).toContain('if true {')
    expect(view).toContain('} else {')

    const value = sw(APP(`{true ? 'a' : 'b'}`)).code
    expect(value).toContain('? "a" : "b"')
    expect(value).not.toMatch(/if true \{\n\s*Text\(verbatim/)
  })

  it('a ternary with ONE view branch still takes the if/else lowering', () => {
    expect(sw(APP(`{true ? <Text>a</Text> : null}`)).code).toContain('if true {')
  })

  it('a `.map()` that BUILDS JSX in a stringified child position is a named warning', () => {
    const { warnings } = sw(
      APP(`{[1, 2].map((i) => <Text>{i}</Text>)}`),
    )
    expect(warnings.some((w) => w.toLowerCase().includes('for'))).toBe(true)
  })
})

describe('string-segment escaping — the control-character arms', () => {
  it('a quasi carrying a real newline / tab / CR escapes rather than breaking the literal', () => {
    const { code } = sw(APP('{`a\nb\tc`}'))
    expect(code).toContain('\\n')
    expect(code).toContain('\\t')
    expect(code).not.toMatch(/Text\("a\nb/)
  })

  it('a quasi carrying a quote and a backslash escapes both', () => {
    const { code } = sw(APP('{`say "hi" \\\\ done ${1}`}'))
    expect(code).toContain('\\"hi\\"')
  })
})
