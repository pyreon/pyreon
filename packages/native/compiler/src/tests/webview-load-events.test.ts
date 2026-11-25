// `<WebView onLoad onError reloadKey backNavigation>` lowering (#4827, #4829).
//
// A hosted page whose load fails must reach the app (`onError`), a retry must
// be expressible (`reloadKey`: setting the same `src` again is not a change),
// and a full-screen web flow must take system Back / the iOS swipe into its own
// history (`backNavigation`, on by default for a `grow` view). Each prop has to
// reach BOTH runtimes with the same meaning, and the emit has to compile
// against the runtime signatures (positional labels on Swift).

import { describe, expect, it } from 'vitest'
import { transform } from '../../../../../scripts/native-first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const wrap = (body: string) =>
  `import { signal } from '@pyreon/reactivity'
import { Button, Scroll, Stack, Text, WebView } from '@pyreon/primitives'
export function App() {
  const status = signal('loading')
  const attempt = signal(0)
  const swipe = signal(true)
  return (
    <Stack>
      <Text>{status()}</Text>
      <Button onPress={() => attempt.update((n) => n + 1)}>Try again</Button>
      ${body}
    </Stack>
  )
}`

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })
const webLine = (code: string) => code.split('\n').find((l) => l.includes('PyreonWebView('))?.trim() ?? ''

describe('<WebView> load outcome, retry and back navigation', () => {
  it('a WebView without the new props emits exactly what it did before', () => {
    const src = wrap('<WebView src="p.html" />')
    expect(webLine(swift(src).code)).toBe('PyreonWebView(src: "p.html")')
    expect(webLine(kotlin(src).code)).toBe('PyreonWebView(src = "p.html")')
  })

  it('onLoad / onError / reloadKey reach both runtimes, in the Swift initializer order', () => {
    const src = wrap(
      `<WebView src="https://example.test/" reloadKey={attempt()} onLoad={() => status.set('ok')} onError={(e) => status.set(e.kind + ' ' + e.code + ': ' + e.description)} />`,
    )
    const s = swift(src)
    const k = kotlin(src)
    expect(s.warnings).toEqual([])
    expect(k.warnings).toEqual([])
    expect(webLine(s.code)).toBe(
      'PyreonWebView(src: "https://example.test/", onLoad: { status = "ok" }, onError: { e in status = e.kind + " " + String(e.code) + ": " + e.description }, reloadKey: "\\(attempt)")',
    )
    expect(webLine(k.code)).toBe(
      'PyreonWebView(src = "https://example.test/", onLoad = { status = "ok" }, onError = { e -> status = e.kind + " " + (e.code).toString() + ": " + e.description }, reloadKey = "${attempt}")',
    )
  })

  it('an annotated `(e: WebViewError)` handler and a block body lower the same way', () => {
    const src = wrap(
      `<WebView src="p.html" onError={(e: WebViewError) => { if (e.kind === 'http') status.set(e.url) }} />`,
    )
    const s = swift(src).code
    const k = kotlin(src).code
    expect(s).toContain('onError: { e in')
    expect(s).toContain('if e.kind == "http" {')
    expect(s).not.toContain('WebViewError')
    expect(k).toContain('onError = { e ->')
    expect(k).toContain('if (e.kind == "http") {')
  })

  it('a literal reloadKey is passed as a string', () => {
    const src = wrap('<WebView src="p.html" reloadKey={3} />')
    expect(webLine(swift(src).code)).toBe('PyreonWebView(src: "p.html", reloadKey: "3")')
    expect(webLine(kotlin(src).code)).toBe('PyreonWebView(src = "p.html", reloadKey = "3")')
  })

  it('backNavigation defaults ON for a growing view and OFF otherwise', () => {
    const grown = wrap('<WebView src="p.html" grow />')
    expect(webLine(swift(grown).code)).toBe('PyreonWebView(src: "p.html", grow: .vertical, backNavigation: true)')
    expect(webLine(kotlin(grown).code)).toBe('PyreonWebView(src = "p.html", modifier = Modifier.weight(1f), backNavigation = true)')
    // `grow` dropped inside a <Scroll> (warned) is not full-screen.
    const scrolled = wrap('<Scroll><WebView src="p.html" grow /></Scroll>')
    expect(webLine(swift(scrolled).code)).not.toContain('backNavigation')
    expect(webLine(kotlin(scrolled).code)).not.toContain('backNavigation')
  })

  it('backNavigation can be turned off for a growing view, on for any view, or bound to a signal', () => {
    const off = wrap('<WebView src="p.html" grow backNavigation={false} />')
    expect(webLine(swift(off).code)).not.toContain('backNavigation')
    expect(webLine(kotlin(off).code)).not.toContain('backNavigation')
    const on = wrap('<WebView src="p.html" backNavigation />')
    expect(webLine(swift(on).code)).toBe('PyreonWebView(src: "p.html", backNavigation: true)')
    expect(webLine(kotlin(on).code)).toBe('PyreonWebView(src = "p.html", backNavigation = true)')
    const bound = wrap('<WebView src="p.html" backNavigation={swipe()} />')
    expect(webLine(swift(bound).code)).toBe('PyreonWebView(src: "p.html", backNavigation: swipe)')
    expect(webLine(kotlin(bound).code)).toBe('PyreonWebView(src = "p.html", backNavigation = swipe)')
  })

  const COMPILE = wrap(`<WebView grow src="https://example.test/" data-testid="w" reloadKey={attempt()} backNavigation={swipe()} onLoad={() => status.set('ok')} onError={(e) => { if (e.kind === 'http' && e.code >= 500) status.set(e.url) }} />
      <WebView html="<p/>" domStorage={false} reloadKey="a" onError={(e) => status.set(e.description)} />`)

  it.skipIf(!isKotlincAvailable())('kotlin: the emit compiles against the runtime signature', () => {
    const r = validateKotlin(kotlin(COMPILE).code)
    expect(r.skipped).not.toBe(true)
    expect(r.ok, r.error).toBe(true)
  }, 180_000)

  it.skipIf(!isSwiftcAvailable())('swift: the emit compiles against the runtime signature (labels in order)', () => {
    const r = validateSwiftWithStubs(swift(COMPILE).code)
    expect(r.skipped).not.toBe(true)
    expect(r.ok, r.error).toBe(true)
  }, 180_000)
})
