// oxc 0.155 represents string-literal values as `JSStr` (WTF-8), which can
// hold a lone surrogate that a Rust `str` cannot. The native backend maps
// one to U+FFFD (`js_text` in native/src/lib.rs); the JS backend keeps the
// raw code unit in its in-memory string. The two in-memory outputs differ,
// but every consumer of compiler output writes UTF-8 (a bundler, a file, a
// napi boundary), and UTF-8 cannot encode a lone surrogate: it becomes
// U+FFFD there too. So the bytes that ship are identical — which is the
// parity that matters, and the one this file locks.
//
// The native binary is loaded DIRECTLY rather than through `transformJSX`,
// which silently falls back to the JS backend when no binary is installed:
// through that path the "native" output is the JS output, and a native-only
// assertion would be checking the wrong backend. The unit-test cells build
// no binary, so the native comparisons skip there; the job that builds one
// sets PYREON_REQUIRE_NATIVE_COMPILER and is held to running them.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (
  code: string,
  filename: string,
  ssr: boolean,
  knownSignals: string[] | null,
) => { code: string }

let nativeTransform: NativeTransform | null = null
try {
  // A napi `.node` addon cannot be loaded through `await import()`.
  const requireAddon = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  const native = requireAddon(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as {
    transformJsx: NativeTransform
  }
  nativeTransform = native.transformJsx
} catch {
  // No binary in this job — the native comparisons below skip.
}

const SHAPES = [
  'const a = <div title={"\\uD800"}>{"\\uD800"}</div>',
  'const a = <div title={"a\\uDC00b"} />',
  'const a = <span>{"\\uD83D"}</span>',
]

const js = (code: string): string => transformJSX_JS(code, 'a.tsx').code ?? ''

describe('lone surrogate in a string literal', () => {
  it('the native binary is present wherever the job says it builds one', () => {
    if (process.env.PYREON_REQUIRE_NATIVE_COMPILER) expect(nativeTransform).not.toBeNull()
  })

  for (const code of SHAPES) {
    it.skipIf(!nativeTransform)(`native and JS backends emit the same UTF-8 bytes: ${code}`, () => {
      const native = nativeTransform!(code, 'a.tsx', false, null).code
      expect(Buffer.from(native, 'utf8').equals(Buffer.from(js(code), 'utf8'))).toBe(true)
      expect(native).not.toMatch(/[\uD800-\uDFFF]/)
    })
  }

  it.skipIf(!nativeTransform)('a valid surrogate PAIR is preserved unchanged by both backends', () => {
    const code = 'const a = <div title={"\\uD83D\\uDE00"}>{"\\uD83D\\uDE00"}</div>'
    const native = nativeTransform!(code, 'a.tsx', false, null).code
    expect(native).toBe(js(code))
    expect(native).toContain('😀')
  })

  it('the JS backend keeps a valid surrogate pair (runs without the binary)', () => {
    expect(js('const a = <span>{"\\uD83D\\uDE00"}</span>')).toContain('😀')
  })
})
