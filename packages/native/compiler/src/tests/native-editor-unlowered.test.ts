// `@pyreon/code` and `@pyreon/rich-text` left the blanket web-only list when their `/webview` bridges gained plugins.
// The rest of each package is still a DOM editor with no native lowering, and must still SAY so: before this, a call to
// `createEditor(...)` emitted verbatim and died with "cannot find 'createEditor' in scope" and no diagnostic.
import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'

const CASES = [
  { pkg: '@pyreon/code', bad: 'createEditor', good: "import { CodeWebView } from '@pyreon/code/webview'", webview: '<CodeWebView state={() => ({ value: t() })} />' },
  { pkg: '@pyreon/rich-text', bad: 'createRichTextEditor', good: "import { RichTextWebView } from '@pyreon/rich-text/webview'", webview: '<RichTextWebView state={() => ({ content: t() })} />' },
] as const

describe('editor packages: only the WebView bridge lowers', () => {
  for (const c of CASES) {
    it(`${c.pkg}: ${c.bad} warns, naming the bridge`, () => {
      const src = `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { ${c.bad} } from '${c.pkg}'
export function App() {
  const t = signal('')
  const ed = ${c.bad}({ value: 'x' })
  return <Stack />
}`
      for (const target of ['swift', 'kotlin'] as const) {
        const w = transform(src, { target }).warnings.join('\n')
        expect(w, target).toContain(c.pkg)
        expect(w, target).toMatch(/WebView/)
      }
    })
    it(`${c.pkg}: the bridge import itself is silent`, () => {
      const src = `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
${c.good}
export function App() {
  const t = signal('')
  return <Stack>${c.webview}</Stack>
}`
      expect(transform(src, { target: 'swift' }).warnings).toEqual([])
    })
  }
})
