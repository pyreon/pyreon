// #4482 — SwiftUI defaults that the Swift emit left IMPLICIT, so the same
// source looked unfinished on iOS next to web and Android:
//
//   <Button>          bare `Button` → `.automatic` style, a borderless tinted
//                     link outside a List (web: filled blue; Compose: filled)
//   <Field>           bare `TextField` → borderless placeholder on the page
//                     (web: 1px grey rounded border; Compose: filled + underline)
//   <Stack>/<Inline>  no `alignment:` → centred on the cross axis (web flex:
//                     stretch, i.e. start; Compose Column/Row: Start/Top), so
//                     every line centred and unequal columns staggered
//   <Scroll>          content in the ScrollView's implicit CENTRED stack
//   routed screens    laid out at intrinsic size and centred in the stack
//                     (web and Compose: top-start)
//
// Each rule is pinned here on the Swift output, the Kotlin output is pinned as
// unchanged (Compose already meets the contract), and the composite source is
// type-checked against the SwiftUI stubs.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, validateSwiftWithStubs } from '../validate'

const app = (jsx: string, decls = '') => `
  import { Stack, Inline, Text, Button, Press, Field, Scroll, For } from '@pyreon/primitives'
  export function C() {
    const draft = signal('')
    const reveal = signal(false)
    const items = signal([{ id: 1, title: 'a' }])
    ${decls}
    return (${jsx})
  }
`
const swift = (jsx: string) => transform(app(jsx), { target: 'swift' }).code
const kotlin = (jsx: string) => transform(app(jsx), { target: 'kotlin' }).code

describe('<Button> draws its documented chrome on iOS (#4482)', () => {
  it('absent and `primary` variant → .borderedProminent (filled, like Compose Button and the web primary)', () => {
    expect(swift(`<Button onPress={() => {}}>Add</Button>`)).toContain(
      'Button("Add") { }.buttonStyle(.borderedProminent)',
    )
    expect(swift(`<Button variant="primary" onPress={() => {}}>Add</Button>`)).toContain(
      '.buttonStyle(.borderedProminent)',
    )
  })

  it('the default reaches the mixed-label and the complex-content forms too', () => {
    expect(swift(`<Button onPress={() => {}}>{draft()} open</Button>`)).toMatch(/\n\s*}\.buttonStyle\(\.borderedProminent\)/)
    expect(swift(`<Button onPress={() => {}}><Stack><Text>a</Text></Stack></Button>`)).toMatch(
      /\n\s*}\.buttonStyle\(\.borderedProminent\)/,
    )
  })

  it('ghost → .borderless (tinted text, like Compose TextButton and the web blue text), not .plain', () => {
    const out = swift(`<Button variant="ghost" onPress={() => {}}>Skip</Button>`)
    expect(out).toContain('.buttonStyle(.borderless)')
    expect(out).not.toContain('.buttonStyle(.plain)')
  })

  it('secondary and danger keep their styles', () => {
    expect(swift(`<Button variant="secondary" onPress={() => {}}>x</Button>`)).toContain('.buttonStyle(.bordered)')
    expect(swift(`<Button variant="danger" onPress={() => {}}>x</Button>`)).toContain(
      '.buttonStyle(.borderedProminent).tint(.red)',
    )
  })

  it('an app-drawn surface wins: a style background / border, or a ternary leaf with one, adds no system chrome', () => {
    for (const style of [
      `style={{ backgroundColor: '#111827', padding: 12 }}`,
      `style={{ borderWidth: 1, borderColor: '#d1d5db' }}`,
      `style={draft() === '' ? { padding: 4 } : { background: '#2563eb' }}`,
    ]) {
      const out = swift(`<Button onPress={() => {}} ${style}>Go</Button>`)
      expect(out, style).not.toContain('.buttonStyle(')
    }
    // A style that does not draw a surface keeps the chrome.
    expect(swift(`<Button onPress={() => {}} style={{ padding: 12 }}>Go</Button>`)).toContain(
      '.buttonStyle(.borderedProminent)',
    )
  })

  it('a pressed style still draws the button alone', () => {
    // `__pyPressed` is the press-state identifier a rocketstyle `active:` block lowers to.
    const out = swift(`<Button onPress={() => {}} style={__pyPressed ? { opacity: 0.5 } : { opacity: 1 }}>Go</Button>`)
    expect(out).toContain('.buttonStyle(PyreonPressStyle')
    expect(out).not.toContain('.borderedProminent')
  })

  it('Compose output is unchanged: a plain Material Button', () => {
    const out = kotlin(`<Button onPress={() => {}}>Add</Button>`)
    expect(out).toContain('Button(onClick = {')
    expect(out).not.toContain('TextButton(')
  })
})

describe('<Press> stays chrome-less (its contract on every target)', () => {
  it('a Press around a styled Stack is not wrapped in system button chrome', () => {
    const out = swift(
      `<Press onPress={() => {}}><Stack padding={3} background="primary" radius="md"><Text>Add</Text></Stack></Press>`,
    )
    expect(out).toContain('.buttonStyle(.plain)')
    expect(out).not.toContain('.borderedProminent')
    expect(out).not.toContain('.bordered)')
  })
})

describe('<Field> has a visible box on iOS (#4482)', () => {
  it('a text field → .textFieldStyle(.roundedBorder)', () => {
    expect(swift(`<Field value={draft} onChangeText={(v) => draft.set(v)} placeholder="What needs doing?" />`)).toMatch(
      /TextField\("What needs doing\?", text: \$draft\)\n\s*\.textFieldStyle\(\.roundedBorder\)/,
    )
  })

  it('a password field and the AnyView ternary of the two kinds get it too', () => {
    expect(swift(`<Field kind="password" value={draft} onChangeText={(v) => draft.set(v)} />`)).toMatch(
      /SecureField\("", text: \$draft\)\n\s*\.textFieldStyle\(\.roundedBorder\)/,
    )
    expect(
      swift(`<Field kind={reveal() ? 'text' : 'password'} value={draft} onChangeText={(v) => draft.set(v)} />`),
    ).toMatch(/AnyView\(SecureField\("", text: \$draft\)\)\)\n\s*\.textFieldStyle\(\.roundedBorder\)/)
  })

  it('a multiline field is boxed as well', () => {
    expect(swift(`<Field multiline value={draft} onChangeText={(v) => draft.set(v)} />`)).toMatch(
      /\.lineLimit\(3, reservesSpace: true\)\n\s*\.textFieldStyle\(\.roundedBorder\)/,
    )
  })

  it('an app-drawn surface wins: a style border / background or a background prop adds no field chrome', () => {
    for (const extra of [
      `style={{ borderWidth: 2, borderColor: '#2563eb', borderRadius: 8 }}`,
      `style={{ backgroundColor: '#f3f4f6' }}`,
      `background="surface"`,
    ]) {
      const out = swift(`<Field value={draft} onChangeText={(v) => draft.set(v)} ${extra} />`)
      expect(out, extra).not.toContain('.textFieldStyle(')
    }
  })

  it('a date field is a DatePicker, not a text box: untouched', () => {
    expect(swift(`<Field kind="date" value={draft} onChangeText={(v) => draft.set(v)} />`)).not.toContain(
      '.textFieldStyle(',
    )
  })
})

describe('<Stack> / <Inline> align to the start by default (#4482)', () => {
  it('no align → VStack(alignment: .leading) / HStack(alignment: .top): web flex stretch, Compose Start / Top', () => {
    expect(swift(`<Stack gap={3}><Text>a</Text></Stack>`)).toContain('VStack(alignment: .leading, spacing: 12) {')
    expect(swift(`<Inline gap={2}><Text>a</Text></Inline>`)).toContain('HStack(alignment: .top, spacing: 8) {')
    expect(swift(`<Stack direction="row"><Text>a</Text></Stack>`)).toContain('HStack(alignment: .top) {')
    expect(swift(`<Stack><Text>a</Text></Stack>`)).toContain('VStack(alignment: .leading) {')
  })

  it('two columns of unequal length in an Inline share their top edge', () => {
    const out = swift(
      `<Inline gap={2}><Stack gap={2}><Button onPress={() => {}}>Add</Button></Stack><Stack gap={2}><Button onPress={() => {}}>Stats</Button><Button onPress={() => {}}>Logout</Button></Stack></Inline>`,
    )
    expect(out).toContain('HStack(alignment: .top, spacing: 8) {')
    expect(out.match(/VStack\(alignment: \.leading, spacing: 8\)/g)).toHaveLength(2)
  })

  it('an explicit align still wins', () => {
    expect(swift(`<Stack align="center"><Text>a</Text></Stack>`)).toContain('VStack(alignment: .center) {')
    expect(swift(`<Inline align="end"><Text>a</Text></Inline>`)).toContain('HStack(alignment: .bottom) {')
  })

  it('Compose output is unchanged (Column / Row already default to Start / Top)', () => {
    expect(kotlin(`<Stack gap={3}><Text>a</Text></Stack>`)).toContain(
      'Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {',
    )
  })
})

describe('<Scroll> content starts at the leading edge (#4482)', () => {
  it('vertical: an explicit leading stack pinned to the leading edge', () => {
    expect(swift(`<Scroll><Text>a</Text><Text>b</Text></Scroll>`)).toMatch(
      /ScrollView \{\n\s*VStack\(alignment: \.leading\) \{\n[\s\S]*\n\s*\}\.frame\(minWidth: 0, maxWidth: \.infinity, alignment: \.leading\)\n\s*\}/,
    )
  })

  it('horizontal: a top-aligned row, no width pin', () => {
    const out = swift(`<Scroll axis="horizontal"><Text>a</Text></Scroll>`)
    expect(out).toContain('ScrollView(.horizontal) {')
    expect(out).toContain('HStack(alignment: .top) {')
    expect(out).not.toContain(".frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)")
  })

  it('a lazy list keeps its spacing and gains the alignment', () => {
    const out = swift(`<Scroll><For each={items} by={(t) => t.id}>{(t) => <Text>{t.title}</Text>}</For></Scroll>`)
    expect(out).toMatch(/LazyVStack\(alignment: \.leading, spacing: 0\) \{[\s\S]*\}\.frame\(minWidth: 0, maxWidth: \.infinity, alignment: \.leading\)/)
  })
})

describe('routed screens start at the top (#4482)', () => {
  const routed = `
    import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
    import { Stack, Text } from '@pyreon/primitives'
    function Home() { return <Stack><Text>home</Text></Stack> }
    function Detail(props: { params: { id: string } }) { return <Stack><Text>{props.params.id}</Text></Stack> }
    export function App() {
      const router = createRouter({ routes: [{ path: '/', component: Home }, { path: '/d/:id', component: Detail }] })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
    }
  `
  const FRAME = '.frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity, alignment: .topLeading)'

  it('the home route and every navigationDestination are pinned top-leading', () => {
    const out = transform(routed, { target: 'swift' }).code
    expect(out).toContain(`Home()${FRAME}`)
    expect(out).toMatch(/\.navigationDestination\(for: String\.self\) \{ path in\n\s*Group \{\n[\s\S]*?\n\s*\}\.frame\(minWidth: 0, maxWidth: \.infinity, minHeight: 0, maxHeight: \.infinity, alignment: \.topLeading\)\n/)
  })

  it.skipIf(!isSwiftcAvailable())('the routed emit type-checks', () => {
    const r = validateSwiftWithStubs(transform(routed, { target: 'swift' }).code)
    expect(r.ok, r.error).toBe(true)
  })
})

describe('the new defaults type-check against the SwiftUI stubs', () => {
  it.skipIf(!isSwiftcAvailable())('buttons, fields, stacks and scrolls', () => {
    const out = swift(`<Scroll>
      <Stack gap={3}>
        <Inline gap={2}>
          <Button onPress={() => {}}>Add</Button>
          <Button variant="ghost" onPress={() => {}}>Skip</Button>
        </Inline>
        <Field value={draft} onChangeText={(v) => draft.set(v)} placeholder="x" />
        <Field kind={reveal() ? 'text' : 'password'} value={draft} onChangeText={(v) => draft.set(v)} />
        <Field multiline value={draft} onChangeText={(v) => draft.set(v)} />
      </Stack>
    </Scroll>`)
    const r = validateSwiftWithStubs(out)
    expect(r.ok, r.error).toBe(true)
  })
})
