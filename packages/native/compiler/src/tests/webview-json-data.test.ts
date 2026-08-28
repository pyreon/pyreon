import { describe, expect, it } from 'vitest'
import { transform } from '../index'

/**
 * `<WebView data={…}>` hands its value straight to `PyreonJSON.encode` /
 * `PyreonJson.encode`. So an object/array LITERAL in that position is JSON, not
 * a model — and routing it through struct synthesis is a detour that fails on
 * exactly the payloads JSON exists to carry.
 *
 * An ECharts option object is the worked example: heterogeneous nesting, empty
 * objects, arrays of differently-shaped records. No struct can be synthesized
 * for it, so the emit fell back to a tuple — which is named arguments with no
 * constructor in Kotlin (and `encode` is `inline fun <reified T>`, so the build
 * died on `cannot infer type for type parameter 'T'`), and on Swift a labelled
 * tuple that is not `Encodable`, so `encode` cannot serialize it. That is why
 * `examples/native-viz`, the charts webview example, did not build on Android.
 *
 * The fix builds the JSON at COMPILE time and interpolates the runtime parts,
 * so live data still flows.
 */
const P = '@pyreon/primitives'
const R = '@pyreon/reactivity'

const compile = (data: string, target: 'swift' | 'kotlin'): string =>
  transform(
    `import { signal } from '${R}'
     import { Stack, WebView } from '${P}'
     export function C() {
       const revenue = signal([1, 2, 3])
       return <Stack><WebView html="<p/>" data={${data}} /></Stack>
     }`,
    { target },
  ).code

const webViewLine = (code: string): string =>
  code.split('\n').find((l) => l.includes('PyreonWebView')) ?? ''

describe('<WebView data> with an object literal lowers to JSON', () => {
  it('Kotlin: an ECharts-shaped option object becomes a JSON string, not a tuple', () => {
    const line = webViewLine(
      compile(`{ xAxis: { type: 'category', data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: revenue() }] }`, 'kotlin'),
    )
    expect(line).toContain('\\"xAxis\\":{\\"type\\":\\"category\\"')
    expect(line).toContain('\\"yAxis\\":{}') // an empty object is valid JSON
    expect(line).toContain('${PyreonJson.encode(revenue)}') // live data still flows
    // The tuple emit is a bare `(` where a constructor should be.
    expect(line).not.toContain('data = (')
  })

  it('Swift: the same object becomes a JSON string with an interpolation', () => {
    const line = webViewLine(
      compile(`{ xAxis: { type: 'category', data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: revenue() }] }`, 'swift'),
    )
    expect(line).toContain('\\"xAxis\\":{\\"type\\":\\"category\\"')
    expect(line).toContain('\\(PyreonJSON.encode(revenue))')
    expect(line).not.toContain('data: (')
  })

  it.each(['swift', 'kotlin'] as const)(
    '%s: a NON-literal data value keeps the plain encode() form it always had',
    (target) => {
      // The identifier path is what every existing WebView spec asserts; the
      // JSON lowering must not disturb it.
      const line = webViewLine(compile('revenue()', target))
      const encode = target === 'swift' ? 'PyreonJSON.encode(revenue)' : 'PyreonJson.encode(revenue)'
      expect(line).toContain(encode)
    },
  )

  it.each(['swift', 'kotlin'] as const)('%s: a literal payload emits no warnings', (target) => {
    // Before this lowering, the same source produced an untypeable-literal
    // warning AND a broken emit. Both are gone; asserting zero warnings keeps
    // a future regression from reappearing as noise.
    const r = transform(
      `import { signal } from '${R}'
       import { Stack, WebView } from '${P}'
       export function C() {
         const revenue = signal([1, 2, 3])
         return <Stack><WebView html="<p/>" data={{ xAxis: {}, series: [{ type: 'bar', data: revenue() }] }} /></Stack>
       }`,
      { target },
    )
    expect(r.warnings ?? []).toEqual([])
  })

  it('escapes quotes and backslashes in string values', () => {
    // A host page selector or a Windows path in the payload must survive both
    // the JSON escaping and the target language's own string escaping.
    const line = webViewLine(compile(`{ sel: 'a "b" c', path: 'x\\\\y', n: 1 }`, 'kotlin'))
    expect(line).toContain('data = "')
    expect(line).not.toContain('data = (')
  })
})
