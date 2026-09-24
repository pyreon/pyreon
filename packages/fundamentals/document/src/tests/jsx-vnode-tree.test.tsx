import { Fragment, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import {
  _resetRenderers,
  Document,
  Heading,
  isDocNode,
  List,
  ListItem,
  Page,
  render,
  Section,
  Text,
} from '../index'
import type { DocNode } from '../index'

// Regression: composing primitives through the Pyreon JSX runtime / `h()`
// builds a VNode tree whose `type` is the primitive FUNCTION. `render()` used
// to accept it (isDocNode was structural and a VNode has type/props/children),
// never invoked the component, and every renderer fell through to its default
// arm — the output was flat concatenated text ("Titlehello"), no structure.

afterEach(() => {
  _resetRenderers()
})

function directDoc(): DocNode {
  return Document({
    title: 'T',
    children: Page({
      children: [Heading({ children: 'Title' }), Text({ children: 'hello' })],
    }),
  })
}

describe('VNode (h / JSX) document trees', () => {
  it('h() tree renders the same HTML as calling the primitives directly', async () => {
    const vnode = h(
      Document,
      { title: 'T' },
      h(Page, null, h(Heading, null, 'Title'), h(Text, null, 'hello')),
    )
    const viaH = (await render(vnode, 'html')) as string
    const direct = (await render(directDoc(), 'html')) as string
    expect(viaH).toContain('<h1>Title</h1>')
    expect(viaH).toContain('<p>hello</p>')
    expect(viaH).toBe(direct)
  })

  it('JSX tree renders the same HTML as calling the primitives directly', async () => {
    const doc = (
      <Document title="T">
        <Page>
          <Heading>Title</Heading>
          <Text>hello</Text>
        </Page>
      </Document>
    )
    expect(await render(doc, 'html')).toBe(await render(directDoc(), 'html'))
  })

  it('every built-in text format matches the direct-call tree', async () => {
    const vnode = h(
      Document,
      { title: 'T' },
      h(Page, null, h(Heading, null, 'Title'), h(Text, null, 'hello')),
    )
    for (const format of ['md', 'text', 'email', 'slack', 'json', 'svg', 'confluence']) {
      expect(await render(vnode, format), format).toEqual(await render(directDoc(), format))
    }
  })

  it('invokes user components, flattens fragments and resolves accessor children', async () => {
    const name = signal('Ada')
    function Greeting(props: { who: string }) {
      return (
        <>
          <Heading level={2}>Hi {props.who}</Heading>
          <Text>{() => `from ${name()}`}</Text>
        </>
      )
    }
    const doc = (
      <Document>
        <Page>
          <Greeting who="you" />
          <List>
            {['a', 'b'].map((x) => (
              <ListItem>{x}</ListItem>
            ))}
          </List>
        </Page>
      </Document>
    )
    const html = (await render(doc, 'html')) as string
    expect(html).toContain('<h2>Hi you</h2>')
    expect(html).toContain('<p>from Ada</p>')
    expect(html).toContain('<li>a</li>')
    expect(html).toContain('<li>b</li>')
  })

  it('a primitive called directly accepts VNode children', async () => {
    const doc = Document({ children: h(Page, null, h(Section, null, h(Text, null, 'x'))) })
    expect(doc.children[0]).toMatchObject({ type: 'page' })
    expect(await render(doc, 'md')).toBe('x\n')
  })

  it('a DOM element in a document tree throws a clear [Pyreon] error', async () => {
    const doc = h(Document, null, h(Page, null, h('div', null, 'x')))
    await expect(render(doc, 'html')).rejects.toThrow(/<div> is a DOM element/)
  })

  it('a root that does not resolve to a single node throws', async () => {
    await expect(render(h(Fragment, null, h(Page, null), h(Page, null)), 'html')).rejects.toThrow(
      /must resolve to a single document node/,
    )
  })

  it('a root that resolves to text, or nothing, throws', async () => {
    await expect(render('x' as never, 'html')).rejects.toThrow(/resolved to 1 item/)
    await expect(render(h(Fragment, null), 'html')).rejects.toThrow(/resolved to 0 item/)
  })

  it('a plain-object root still throws the plain-object error', async () => {
    await expect(render({ foo: 1 } as never, 'html')).rejects.toThrow(/plain objects/)
  })

  it('an unknown symbol type throws', async () => {
    const doc = h(Document, null, h(Symbol('custom'), null))
    await expect(render(doc, 'html')).rejects.toThrow(/Unsupported node type Symbol\(custom\)/)
  })

  it('compiler-branded reactive props are resolved to their value', async () => {
    const title = Object.assign(() => 'Branded', { [Symbol.for('pyreon.reactiveProp')]: true })
    const body = Object.assign(() => h(Page, null, h(Text, null, 'b')), {
      [Symbol.for('pyreon.reactiveProp')]: true,
    })
    const out = (await render(h(Document, { title, children: body }), 'html')) as string
    expect(out).toContain('<title>Branded</title>')
    expect(out).toContain('<p>b</p>')
  })

  it('a VNode is not a DocNode', () => {
    expect(isDocNode(h(Text, null, 'x'))).toBe(false)
    expect(isDocNode(Text({ children: 'x' }))).toBe(true)
  })

  it('a VNode with null props (hand-built) is still resolved', async () => {
    const vnode = { type: Page, props: null, children: [], key: null }
    expect((await render(h(Document, null, vnode as never), 'json')) as string).toContain('"page"')
  })
})
