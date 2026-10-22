// `<CodeWebView>` (from `@pyreon/code/webview`) on native.
//
// `@pyreon/code` is web-only (CodeMirror is a DOM engine), and its documented native route is the `/webview`
// bridge. The compiler exempted that subpath from the web-only warning — "the documented fix must not warn" — but no
// plugin lowered it. So `<CodeWebView state onChange>` emitted a call to a symbol neither runtime defines:
//
//   Swift    CodeWebView(state: { __Obj0(…) })        "cannot find 'CodeWebView' in scope"
//   Kotlin   CodeWebView(state = { __Obj0(…) })       "unresolved reference"
//
// with ZERO warnings. The coverage registry's evidence for the package was a hand-written `<WebView>` snippet that
// never used the component at all (and posted `doc` where the bridge reads `value`). These specs compile the REAL
// component through the REAL plugin and type-check what comes out.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (jsx: string) => `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { CodeWebView } from '@pyreon/code/webview'
export function App() {
  const text = signal('const a = 1')
  const err = signal('')
  return (
    <Stack>
      ${jsx}
      <Text>{text()}</Text>
      <Text>{err()}</Text>
    </Stack>
  )
}`

const FULL = `<CodeWebView state={() => ({ value: text(), language: 'typescript', readOnly: false })} onChange={(v) => text.set(v)} onError={(m) => { err.set(m) }} />`

describe('<CodeWebView> lowers to a hosted <WebView>', () => {
  it('Swift: loads the bundled page, pushes state, routes edits and errors', () => {
    const r = transform(app(FULL), { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonWebView(src: "pyreon-code-host.html"')
    expect(r.code).toContain('"{\\"value\\":\\(PyreonJSON.encode(text)),\\"language\\":\\"typescript\\",\\"readOnly\\":false}"')
    expect(r.code).toContain('hasPrefix("v:")')
    expect(r.code).toContain('hasPrefix("e:")')
    // The symbol that does not exist must not survive.
    expect(r.code).not.toMatch(/\bCodeWebView\(/)
  })
  it('Kotlin: the same shape', () => {
    const r = transform(app(FULL), { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonWebView(src = "pyreon-code-host.html"')
    expect(r.code).toContain('startsWith("v:")')
    expect(r.code).toContain('startsWith("e:")')
    expect(r.code).not.toMatch(/\bCodeWebView\(/)
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
    const edit = transform(app(`<CodeWebView state={() => ({ value: text() })} onChange={(v) => text.set(v)} />`), { target: 'swift' })
    expect(edit.code).toContain('onMessage:')
    expect(edit.code).not.toContain('hasPrefix("e:")')
    const none = transform(app(`<CodeWebView state={() => ({ value: text() })} />`), { target: 'swift' })
    expect(none.code).not.toContain('onMessage')
  })
  it('a state OBJECT (not an accessor) is accepted', () => {
    const r = transform(app(`<CodeWebView state={{ value: 'fixed', language: 'json' }} />`), { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('\\"value\\":\\"fixed\\"')
  })
  it('a single-return block accessor is the same as the expression form', () => {
    const r = transform(app(`<CodeWebView state={() => { return { value: text() } }} />`), { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonWebView(src: "pyreon-code-host.html"')
  })
  it('custom html replaces the bundled page', () => {
    const r = transform(app(`<CodeWebView html="<html></html>" state={() => ({ value: text() })} />`), { target: 'swift' })
    expect(r.code).toContain('html: "<html></html>"')
    expect(r.code).not.toContain('pyreon-code-host.html')
  })
  it('names what cannot lower instead of emitting a broken host', () => {
    const noState = transform(app(`<CodeWebView onChange={(v) => text.set(v)} />`), { target: 'swift' })
    expect(noState.warnings.join('\n')).toMatch(/`state` is required on native/)
    const block = transform(app(`<CodeWebView state={() => { const v = text(); return { value: v } }} />`), { target: 'swift' })
    expect(block.warnings.join('\n')).toMatch(/block-bodied accessor cannot lower/)
    const script = transform(app(`<CodeWebView codemirrorScript="x" state={() => ({ value: text() })} />`), { target: 'swift' })
    expect(script.warnings.join('\n')).toMatch(/codemirrorScript is ignored/)
  })
})
