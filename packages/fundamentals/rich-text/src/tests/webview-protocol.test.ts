// The reverse channel of the TipTap bridge: `c:<document JSON text>` is an edit, `e:<message>` a host failure.
// The document is TEXT in both directions so one handler shape runs on every target.
import { describe, expect, it } from 'vitest'
import { RichTextWebView, buildRichTextHostHtml } from '../webview'

function handlerOf(props: Parameters<typeof RichTextWebView>[0]): (m: string) => void {
  const vnode = RichTextWebView(props) as unknown as { props: { onMessage?: (m: string) => void } }
  return vnode.props.onMessage!
}

describe('RichTextWebView reverse channel', () => {
  it('routes c: to onChange (as TEXT) and e: to onError', () => {
    const doc = JSON.stringify({ type: 'doc', content: [] })
    const edits: string[] = []
    const errors: string[] = []
    const onMessage = handlerOf({ state: { content: '' }, onChange: (c) => edits.push(c), onError: (m) => errors.push(m) })
    onMessage('c:' + doc)
    onMessage('e:window.TT not provided')
    expect(edits).toEqual([doc])
    expect(typeof edits[0]).toBe('string')
    expect(errors).toEqual(['window.TT not provided'])
  })
  it('a custom host posting the old JSON envelope is delivered as text too', () => {
    const edits: string[] = []
    const onMessage = handlerOf({ state: { content: '' }, onChange: (c) => edits.push(c) })
    onMessage(JSON.stringify({ content: { type: 'doc' } }))
    expect(edits).toEqual(['{"type":"doc"}'])
  })
  it('the host page posts the prefixes the handler reads and accepts JSON text as content', () => {
    const html = buildRichTextHostHtml()
    expect(html).toContain("pyreonPostMessage('c:' + s)")
    expect(html).toContain("pyreonPostMessage('e:' + msg)")
    expect(html).toContain('JSON.parse(incoming)')
  })
})
