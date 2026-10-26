// oxc 0.155 represents string-literal values as `JSStr` (WTF-8), which can
// hold a lone surrogate that a Rust `str` cannot. The native backend maps
// one to U+FFFD (`js_text` in native/src/lib.rs); the JS backend keeps the
// raw code unit in its in-memory string. The two in-memory outputs differ,
// but every consumer of compiler output writes UTF-8 (a bundler, a file, a
// napi boundary), and UTF-8 cannot encode a lone surrogate: it becomes
// U+FFFD there too. So the bytes that ship are identical — which is the
// parity that matters, and the one this file locks.
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const SHAPES = [
  'const a = <div title={"\\uD800"}>{"\\uD800"}</div>',
  'const a = <div title={"a\\uDC00b"} />',
  'const a = <span>{"\\uD83D"}</span>',
]

describe('lone surrogate in a string literal', () => {
  for (const code of SHAPES) {
    it(`native and JS backends emit the same UTF-8 bytes: ${code}`, () => {
      const js = transformJSX_JS(code, 'a.tsx').code ?? ''
      const native = transformJSX(code, 'a.tsx').code ?? ''
      expect(Buffer.from(native, 'utf8').equals(Buffer.from(js, 'utf8'))).toBe(true)
      expect(native).not.toMatch(/[\uD800-\uDFFF]/)
    })
  }

  it('a valid surrogate PAIR is preserved unchanged by both backends', () => {
    const code = 'const a = <div title={"\\uD83D\\uDE00"}>{"\\uD83D\\uDE00"}</div>'
    const js = transformJSX_JS(code, 'a.tsx').code ?? ''
    const native = transformJSX(code, 'a.tsx').code ?? ''
    expect(native).toBe(js)
    expect(native).toContain('😀')
  })
})
