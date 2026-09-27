import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseSync } from 'oxc-parser'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jsStringLiteral } from '../codegen-literal'
import { generateMiddlewareModule, generateRouteModule } from '../fs-router'

// Filesystem-derived strings (route paths, action ids) are embedded into
// generated virtual-module SOURCE. The literal must round-trip to exactly the
// original string for ANY input — a path containing a quote, a backslash, a
// JS line terminator or `</script>` must not close the literal or inject code.
const HOSTILE = [
  '/src/routes/plain.tsx',
  '/src/routes/quo"te.tsx',
  '/src/routes/back\\slash.tsx',
  '/src/routes/ls\u2028ps\u2029.tsx',
  '/src/routes/</script><script>alert(1)</script>.tsx',
  '/src/routes/"); globalThis.pwned = 1; ("',
]

describe('jsStringLiteral', () => {
  for (const value of HOSTILE) {
    it(`round-trips ${JSON.stringify(value)}`, () => {
      const lit = jsStringLiteral(value)
      expect(new Function(`return ${lit}`)()).toBe(value)
      expect(lit).not.toMatch(/[<>\u2028\u2029]/)
    })
  }

  it('leaves realistic import paths byte-identical to JSON.stringify', () => {
    const p = '/Users/me/app/src/routes/blog/[slug].tsx'
    expect(jsStringLiteral(p)).toBe(JSON.stringify(p))
  })
})

describe('generated modules with a hostile route file name', () => {
  // A `"` is a legal file-name character on macOS/Linux. Before routing every
  // specifier through jsStringLiteral, the loader / error / getStaticPaths /
  // middleware / action sites interpolated the path raw inside `"…"`, so this
  // file name closed the literal and produced unparseable (or injected) code.
  const NAME = 'x"); globalThis.pwned = 1; ("y.tsx'
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pyreon-codegen-literal-'))
    writeFileSync(
      join(dir, NAME),
      'export const middleware = () => {}\nexport async function loader() { return 1 }\nexport async function getStaticPaths() { return [] }\nexport function error() { return null }\nexport default function Page() { return null }\n',
    )
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('route module still parses', () => {
    const code = generateRouteModule([NAME], dir)
    expect(parseSync('routes.js', code, { sourceType: 'module' }).errors).toEqual([])
  })

  it('middleware module still parses', () => {
    const code = generateMiddlewareModule([NAME], dir)
    expect(code).toContain('middleware')
    expect(parseSync('mw.js', code, { sourceType: 'module' }).errors).toEqual([])
  })
})
