// `<RichTextWebView>` (from `@pyreon/rich-text/webview`) on native.
//
// Same defect and same fix as `native-code-webview.test.ts`: `@pyreon/rich-text` is web-only (TipTap / ProseMirror is a
// DOM engine), its documented native route is the `/webview` bridge, and that subpath was exempt from the web-only
// warning while nothing lowered it — `<RichTextWebView>` emitted a call to a symbol neither runtime defines, with zero
// warnings. The document crosses as TEXT in both directions (TipTap JSON serialized to a string), because a native
// handler cannot hold a JSON object.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (jsx: string) => `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { RichTextWebView } from '@pyreon/rich-text/webview'
export function App() {
  const text = signal('<p>hello</p>')
  const err = signal('')
  return (
    <Stack>
      ${jsx}
      <Text>{text()}</Text>
      <Text>{err()}</Text>
    </Stack>
  )
}`

const FULL = `<RichTextWebView state={() => ({ content: text(), editable: true })} onChange={(v) => text.set(v)} onError={(m) => { err.set(m) }} />`

describe('<RichTextWebView> lowers to a hosted <WebView>', () => {
  it('Swift: loads the bundled page, pushes state, routes edits and errors', () => {
    const r = transform(app(FULL), { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonWebView(src: "pyreon-richtext-host.html"')
    expect(r.code).toContain('"{\\"content\\":\\(PyreonJSON.encode(text)),\\"editable\\":true}"')
    expect(r.code).toContain('hasPrefix("c:")')
    expect(r.code).toContain('hasPrefix("e:")')
    // The symbol that does not exist must not survive.
    expect(r.code).not.toMatch(/\bRichTextWebView\(/)
  })
  it('Kotlin: the same shape', () => {
    const r = transform(app(FULL), { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonWebView(src = "pyreon-richtext-host.html"')
    expect(r.code).toContain('startsWith("c:")')
    expect(r.code).toContain('startsWith("e:")')
    expect(r.code).not.toMatch(/\bRichTextWebView\(/)
  })
  it.skipIf(!isSwiftcAvailable())('Swift type-checks', () => {
    const v = validateSwiftWithStubs(transform(app(FULL), { target: 'swift' }).code)
    expect(v.ok, v.ok ? '' : String((v as { error?: string }).error)).toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Kotlin type-checks', () => {
    const v = validateKotlin(transform(app(FULL), { target: 'kotlin' }).code)
    expect(v.ok, v.ok ? '' : String((v as { error?: string }).error)).toBe(true)
  })
  it('an edit handler alone installs the message handler; none installs nothing', () => {
    const edit = transform(app(`<RichTextWebView state={() => ({ content: text() })} onChange={(v) => text.set(v)} />`), { target: 'swift' })
    expect(edit.code).toContain('onMessage:')
    expect(edit.code).not.toContain('hasPrefix("e:")')
    const none = transform(app(`<RichTextWebView state={() => ({ content: text() })} />`), { target: 'swift' })
    expect(none.code).not.toContain('onMessage')
  })
  it('a state OBJECT (not an accessor) is accepted', () => {
    const r = transform(app(`<RichTextWebView state={{ content: 'fixed' }} />`), { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('\\"content\\":\\"fixed\\"')
  })
  it('a single-return block accessor is the same as the expression form', () => {
    const r = transform(app(`<RichTextWebView state={() => { return { content: text() } }} />`), { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonWebView(src: "pyreon-richtext-host.html"')
  })
  it('custom html replaces the bundled page', () => {
    const r = transform(app(`<RichTextWebView html="<html></html>" state={() => ({ content: text() })} />`), { target: 'swift' })
    expect(r.code).toContain('html: "<html></html>"')
    expect(r.code).not.toContain('pyreon-richtext-host.html')
  })
  it('names what cannot lower instead of emitting a broken host', () => {
    const noState = transform(app(`<RichTextWebView onChange={(v) => text.set(v)} />`), { target: 'swift' })
    expect(noState.warnings.join('\n')).toMatch(/`state` is required on native/)
    const block = transform(app(`<RichTextWebView state={() => { const v = text(); return { content: v } }} />`), { target: 'swift' })
    expect(block.warnings.join('\n')).toMatch(/block-bodied accessor cannot lower/)
    const script = transform(app(`<RichTextWebView tiptapScript="x" state={() => ({ content: text() })} />`), { target: 'swift' })
    expect(script.warnings.join('\n')).toMatch(/tiptapScript is ignored/)
  })
})
