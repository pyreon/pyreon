// The reverse channel of the CodeMirror bridge: `v:<text>` is an edit, `e:<message>` a host failure.
// Plain prefixes (not JSON) so the LOWERED native handler can take the payload apart with string operations.
import { describe, expect, it } from 'vitest'
import { CodeWebView, buildCodeHostHtml } from '../webview'

function handlerOf(props: Parameters<typeof CodeWebView>[0]): (m: string) => void {
  const vnode = CodeWebView(props) as unknown as { props: { onMessage?: (m: string) => void } }
  return vnode.props.onMessage!
}

describe('CodeWebView reverse channel', () => {
  it('routes v: to onChange and e: to onError', () => {
    const edits: string[] = []
    const errors: string[] = []
    const onMessage = handlerOf({ state: { value: '' }, onChange: (v) => edits.push(v), onError: (m) => errors.push(m) })
    onMessage('v:const a = 1')
    onMessage('e:window.CM not provided')
    expect(edits).toEqual(['const a = 1'])
    expect(errors).toEqual(['window.CM not provided'])
  })
  it('an edit that LOOKS like a protocol or JSON value is still text', () => {
    const edits: string[] = []
    const onMessage = handlerOf({ state: { value: '' }, onChange: (v) => edits.push(v) })
    onMessage('v:{"value":"x"}')
    onMessage('v:e:not an error')
    onMessage('v:')
    expect(edits).toEqual(['{"value":"x"}', 'e:not an error', ''])
  })
  it('a custom host posting the old JSON envelope keeps working', () => {
    const edits: string[] = []
    const onMessage = handlerOf({ state: { value: '' }, onChange: (v) => edits.push(v) })
    onMessage(JSON.stringify({ value: 'legacy' }))
    expect(edits).toEqual(['legacy'])
  })
  it('installs no handler when nothing listens', () => {
    const vnode = CodeWebView({ state: { value: '' } }) as unknown as { props: { onMessage?: unknown } }
    expect(vnode.props.onMessage).toBeUndefined()
  })
  it('the host page posts the same prefixes the handler reads', () => {
    const html = buildCodeHostHtml()
    expect(html).toContain("pyreonPostMessage('v:' + v)")
    expect(html).toContain("pyreonPostMessage('e:' + msg)")
    expect(html).not.toContain('JSON.stringify({ value')
  })
})
