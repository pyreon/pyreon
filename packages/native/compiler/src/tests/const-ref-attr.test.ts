// Const-ref resolution for static attrs — a module-level `const X =
// <literal>` referenced as an attr value (`<Image src={CHART_URL}>`)
// resolves to its literal at emit time, so naming a URL/constant once
// works on native as well as inlining it. Generalizes to every
// `readStaticAttr`/`readStaticAttrKotlin` consumer (Image, font,
// background, …, and <WebView> once it lands). `let` (mutable) bindings
// and non-const / component-scope / unknown identifiers do NOT resolve —
// they fall through to the existing "needs static" emit path.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = (decls: string, body: string) =>
  `import { Stack, Image } from '@pyreon/primitives'
${decls}
export function App() { return <Stack>${body}</Stack> }`

describe('const-ref attr resolution', () => {
  describe('Swift', () => {
    it('module const string → resolved into AsyncImage url', () => {
      const out = transform(
        SRC(`const CHART_URL = "https://x.com/c.png"`, `<Image src={CHART_URL} alt="chart" />`),
        { target: 'swift' },
      ).code
      expect(out).toContain('AsyncImage(url: URL(string: "https://x.com/c.png"))')
    })

    it('module const bundled-asset name → resolved into Image("logo")', () => {
      const out = transform(
        SRC(`const LOGO = "logo.png"`, `<Image src={LOGO} alt="logo" />`),
        { target: 'swift' },
      ).code
      expect(out).toContain('Image("logo")')
    })

    it('a `let` (mutable) binding does NOT resolve (falls through)', () => {
      const out = transform(
        SRC(`let CHART_URL = "https://x.com/c.png"`, `<Image src={CHART_URL} alt="chart" />`),
        { target: 'swift' },
      ).code
      expect(out).not.toContain('AsyncImage(url: URL(string: "https://x.com/c.png"))')
    })

    it('an unknown identifier does NOT resolve (falls through)', () => {
      const out = transform(
        SRC(``, `<Image src={MISSING} alt="x" />`),
        { target: 'swift' },
      ).code
      expect(out).not.toContain('AsyncImage(url: URL(string:')
    })
  })

  describe('Kotlin', () => {
    it('module const string → resolved into AsyncImage model', () => {
      const out = transform(
        SRC(`const CHART_URL = "https://x.com/c.png"`, `<Image src={CHART_URL} alt="chart" />`),
        { target: 'kotlin' },
      ).code
      expect(out).toContain('AsyncImage(model = "https://x.com/c.png"')
    })

    it('a `let` (mutable) binding does NOT resolve (falls through)', () => {
      // Assert on the AsyncImage wrapper, NOT the bare URL — a mutable
      // module binding still emits `var CHART_URL = "…"`, so the URL
      // string itself legitimately appears in the output.
      const out = transform(
        SRC(`let CHART_URL = "https://x.com/c.png"`, `<Image src={CHART_URL} alt="chart" />`),
        { target: 'kotlin' },
      ).code
      expect(out).not.toContain('AsyncImage(model = "https://x.com/c.png"')
    })
  })
})
