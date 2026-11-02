// `<WebView grow>` — the sizing contract (#3956 item 5).
//
// Unsized, a web view is the `<iframe>` default on every target: full width,
// 150 high. `grow` takes the parent stack's free main-axis space. The parent is
// a COMPILE-TIME fact here: Compose's `Modifier.weight` only compiles as a
// direct child of a Column / Row, and SwiftUI must grow along the parent's main
// axis only — so what is under test is that the emitter knows the parent.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
// The hosted editor views are lowered by their packages' plugins.
import { transform as transformWithPlugins } from '../../../../../scripts/native-first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const wrap = (body: string, extra = '') =>
  `import { Stack, Inline, Layer, Scroll, Show, Text, WebView } from '@pyreon/primitives'
${extra}
export function App() { const on = signal(true); return ${body} }`

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })
const webLine = (code: string) => code.split('\n').find((l) => l.includes('PyreonWebView('))?.trim() ?? ''

describe('<WebView grow> lowering', () => {
  it('unsized emits exactly what it did before — no weight, no grow argument', () => {
    const src = wrap('<Stack><Text>a</Text><WebView src="p.html" data-testid="w" /></Stack>')
    expect(webLine(swift(src).code)).toBe('PyreonWebView(src: "p.html").accessibilityIdentifier("w")')
    expect(webLine(kotlin(src).code)).toBe('PyreonWebView(src = "p.html", modifier = Modifier.testTag("w"))')
    // grow={false} is the same thing spelled out.
    const off = wrap('<Stack><Text>a</Text><WebView src="p.html" grow={false} data-testid="w" /></Stack>')
    expect(swift(off).code).toBe(swift(src).code)
    expect(kotlin(off).code).toBe(kotlin(src).code)
  })

  it('a direct child of <Stack> grows vertically: weight on Compose, .vertical on SwiftUI', () => {
    const src = wrap('<Stack><Text>a</Text><WebView src="p.html" grow data-testid="w" /></Stack>')
    expect(webLine(swift(src).code)).toBe('PyreonWebView(src: "p.html", grow: .vertical).accessibilityIdentifier("w")')
    expect(webLine(kotlin(src).code)).toBe('PyreonWebView(src = "p.html", modifier = Modifier.weight(1f).testTag("w"))')
    expect(swift(src).warnings).toEqual([])
    expect(kotlin(src).warnings).toEqual([])
  })

  it('a direct child of <Inline> grows horizontally', () => {
    const src = wrap('<Inline><Text>a</Text><WebView html="<p/>" grow /></Inline>')
    expect(webLine(swift(src).code)).toBe('PyreonWebView(html: "<p/>", grow: .horizontal)')
    expect(webLine(kotlin(src).code)).toBe('PyreonWebView(html = "<p/>", modifier = Modifier.weight(1f))')
  })

  it('<Stack direction="row"> is a row', () => {
    const src = wrap('<Stack direction="row"><WebView html="<p/>" grow /></Stack>')
    expect(webLine(swift(src).code)).toContain('grow: .horizontal')
  })

  it('<Show> and escape hatches are transparent — the WebView is still the Column\'s child', () => {
    const src = wrap('<Stack><Show when={on()}><WebView html="<p/>" grow /></Show></Stack>')
    expect(webLine(kotlin(src).code)).toContain('Modifier.weight(1f)')
    expect(webLine(swift(src).code)).toContain('grow: .vertical')
    const hatch = wrap('<Stack><NativeAndroid><WebView html="<p/>" grow /></NativeAndroid></Stack>', "import { NativeAndroid } from '@pyreon/primitives'")
    expect(webLine(kotlin(hatch).code)).toContain('Modifier.weight(1f)')
  })

  it('anywhere else (Layer, a component root) fills both axes: fillMaxSize / .both', () => {
    const layer = wrap('<Stack><Layer><WebView html="<p/>" grow /></Layer></Stack>')
    expect(webLine(kotlin(layer).code)).toBe('PyreonWebView(html = "<p/>", modifier = Modifier.fillMaxSize())')
    expect(webLine(swift(layer).code)).toBe('PyreonWebView(html: "<p/>", grow: .both)')
    const root = wrap('<WebView html="<p/>" grow padding={2} />')
    expect(webLine(kotlin(root).code)).toMatch(/^PyreonWebView\(html = "<p\/>", modifier = Modifier\.fillMaxSize\(\)\.padding\(/)
    expect(webLine(swift(root).code)).toContain('grow: .both')
  })

  it('a grandchild is NOT weighted: the Column\'s scope does not reach through another element', () => {
    // A <Stack> → <Layer> → <WebView> is not a ColumnScope call site; emitting
    // weight there is a Gradle compile error on the real Compose.
    const src = wrap('<Stack><Layer><Stack direction="row"><Layer><WebView html="<p/>" grow /></Layer></Stack></Layer></Stack>')
    expect(webLine(kotlin(src).code)).toContain('Modifier.fillMaxSize()')
    expect(webLine(kotlin(src).code)).not.toContain('weight')
  })

  describe('inside a <Scroll>: no free space to fill — dropped with a named warning', () => {
    it('a direct child of a vertical <Scroll>', () => {
      const src = wrap('<Scroll><WebView html="<p/>" grow /></Scroll>')
      for (const r of [swift(src), kotlin(src)]) {
        expect(webLine(r.code)).not.toMatch(/grow:|weight|fillMaxSize/)
        expect(r.warnings.join('\n')).toContain('<WebView grow> inside a <Scroll>')
      }
    })
    it('a Stack inside a Scroll (the common page shape) — still unbounded', () => {
      const src = wrap('<Scroll><Stack><WebView html="<p/>" grow /></Stack></Scroll>')
      for (const r of [swift(src), kotlin(src)]) {
        expect(webLine(r.code)).not.toMatch(/grow:|weight/)
        expect(r.warnings.join('\n')).toContain('inside a <Scroll>')
      }
    })
    it('an <Inline> inside a vertical <Scroll> is bounded horizontally, so it still grows', () => {
      const src = wrap('<Scroll><Inline><Text>a</Text><WebView html="<p/>" grow /></Inline></Scroll>')
      expect(webLine(kotlin(src).code)).toContain('Modifier.weight(1f)')
      expect(webLine(swift(src).code)).toContain('grow: .horizontal')
      expect(kotlin(src).warnings).toEqual([])
    })
    it('the warning does not leak to a sibling after the <Scroll>', () => {
      const src = wrap('<Stack><Scroll><Text>a</Text></Scroll><WebView html="<p/>" grow /></Stack>')
      expect(webLine(kotlin(src).code)).toContain('Modifier.weight(1f)')
      expect(kotlin(src).warnings).toEqual([])
    })
  })

  it('a dynamic value warns by name and keeps the default', () => {
    const src = wrap('<Stack><WebView html="<p/>" grow={on()} /></Stack>')
    for (const r of [swift(src), kotlin(src)]) {
      expect(webLine(r.code)).not.toMatch(/grow:|weight|fillMaxSize/)
      expect(r.warnings.join('\n')).toContain('<WebView grow={…}>')
    }
  })

  it('a module-level const resolves statically', () => {
    const src = wrap('<Stack><WebView html="<p/>" grow={FILL} /></Stack>', 'const FILL = true')
    expect(webLine(kotlin(src).code)).toContain('Modifier.weight(1f)')
  })

  it('the hosted editor views pass grow through to the WebView they become', () => {
    const code = `import { Stack } from '@pyreon/primitives'
import { CodeWebView } from '@pyreon/code/webview'
export function App() { const s = signal('x'); return <Stack><CodeWebView state={() => ({ value: s() })} grow /></Stack> }`
    expect(webLine(transformWithPlugins(code, { target: 'kotlin' }).code)).toContain('Modifier.weight(1f)')
    expect(webLine(transformWithPlugins(code, { target: 'swift' }).code)).toContain('grow: .vertical')
  })

  const COMPILE = wrap(`<Stack>
  <Text>a</Text>
  <WebView src="p.html" grow data-testid="col" />
  <Inline><WebView html="<p/>" grow /></Inline>
  <Layer><WebView html="<p/>" grow /></Layer>
  <Show when={on()}><WebView html="<p/>" grow /></Show>
</Stack>`)

  it.skipIf(!isKotlincAvailable())('kotlin: every shape compiles against the scope-faithful stubs', () => {
    const r = validateKotlin(kotlin(COMPILE).code)
    expect(r.skipped).not.toBe(true)
    expect(r.ok, r.error).toBe(true)
  }, 180_000)

  it.skipIf(!isKotlincAvailable())('kotlin: the stub REJECTS weight outside a Column/Row, as real Compose does', () => {
    // The stub used to declare `weight` as a plain Modifier member, accepting a
    // weighted call anywhere — which would have hidden a mis-scoped emit here.
    // Both shapes: a component root (no scope at all) and a Box inside a Column
    // (the outer ColumnScope is cut off by Compose's @LayoutScopeMarker).
    for (const body of ['<WebView html="<p/>" grow />', '<Stack><Layer><WebView html="<p/>" grow /></Layer></Stack>']) {
      const misScoped = kotlin(wrap(body)).code.replace('Modifier.fillMaxSize()', 'Modifier.weight(1f)')
      expect(misScoped).toContain('Modifier.weight(1f)')
      const r = validateKotlin(misScoped)
      expect(r.skipped).not.toBe(true)
      expect(r.ok, body).toBe(false)
      expect(r.error).toMatch(/weight/)
    }
  }, 360_000)

  it.skipIf(!isSwiftcAvailable())('swift: every shape compiles against the stub gate', () => {
    const r = validateSwiftWithStubs(swift(COMPILE).code)
    expect(r.skipped).not.toBe(true)
    expect(r.ok, r.error).toBe(true)
  }, 180_000)
})
