import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCodeHostHtml } from '../../../../fundamentals/code/src/webview'
import { buildRichTextHostHtml } from '../../../../fundamentals/rich-text/src/webview'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

/**
 * The webview-host archetype: ONE source hosting a flow diagram
 * (`<FlowWebView>`), a CodeMirror editor and a TipTap editor in WebViews,
 * compiled for both native targets. This fixture was `examples/native-viz`
 * (compile-only, no device host); its checks moved here with it:
 *
 *   - its `gen-hosts --check`: the CODE_HOST / RICHTEXT_HOST literals are
 *     LOCAL consts (PMTC inlines a local literal into `PyreonWebView(html:)`;
 *     an imported const stays an unresolved reference), so they must equal what
 *     the packages' host builders produce today;
 *   - its `check-native-output.ts`: both emits carry the complete Flow WebView
 *     bridge and no unresolved `FlowWebView(` call;
 *   - both emits compile (Swift against stubs, kotlinc).
 *
 * It also carries the two WebView payload shapes that once had no
 * synthesizable struct and emitted a tuple (an ECharts-style option object,
 * a heterogeneous ProseMirror document typed through `PMNode`).
 */
const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'showcase-viz.tsx')
const source = readFileSync(FIXTURE, 'utf8')

/** The string literal assigned to a top-level `const NAME = "…"` in the fixture. */
function embeddedHost(name: string): string {
  const m = new RegExp(`^const ${name} = (".*")$`, 'm').exec(source)
  if (!m) throw new Error(`[showcase-viz] no \`const ${name} = "…"\` line in the fixture`)
  return JSON.parse(m[1]!) as string
}

describe('showcase-viz — hosted flow, code and rich-text editors on both native targets', () => {
  it('embeds the host pages the packages build today (regenerate the literals when a builder changes)', () => {
    expect(embeddedHost('CODE_HOST')).toBe(buildCodeHostHtml({ codemirrorSrc: './assets/cm.js' }))
    expect(embeddedHost('RICHTEXT_HOST')).toBe(buildRichTextHostHtml({ tiptapSrc: './assets/tt.js' }))
  })

  it.each(['swift', 'kotlin'] as const)('emits the complete Flow WebView bridge on %s', (target) => {
    const result = transform(source, { target, filename: FIXTURE })
    for (const required of [
      'PyreonWebView(',
      'pyreonFlowWebViewData(',
      'pyreonDispatchFlowWebViewMessage(',
      'initial-fit',
      'Flow error: ',
    ]) {
      expect(result.code, `${target} output is missing ${JSON.stringify(required)}`).toContain(required)
    }
    expect(result.code, `${target} retained an unresolved FlowWebView call`).not.toContain('FlowWebView(')
    if (target === 'swift' && isSwiftcAvailable()) {
      expect(validateSwiftWithStubs(result.code)).toMatchObject({ ok: true })
    }
    if (target === 'kotlin' && isKotlincAvailable()) {
      expect(validateKotlin(result.code)).toMatchObject({ ok: true })
    }
  })
})
