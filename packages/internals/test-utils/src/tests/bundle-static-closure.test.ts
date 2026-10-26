import { describe, expect, it } from 'vitest'
import {
  staticClosureCode,
  staticRelativeImports,
} from '../../../../../scripts/bundle-static-closure'

const out = (kind: string, path: string, code: string) => ({ kind, path, text: async () => code })

describe('staticRelativeImports', () => {
  it('finds static imports, side-effect imports and re-exports, minified or not', () => {
    const code = [
      'import{a as b}from"./chunk-a.js";',
      'import "./side.js"',
      'export { c } from "./chunk-c.js"',
      'export*from"./chunk-star.js";',
    ].join('\n')
    expect(staticRelativeImports(code)).toEqual([
      './chunk-a.js',
      './side.js',
      './chunk-c.js',
      './chunk-star.js',
    ])
  })

  it('ignores dynamic import() — the lazy boundary', () => {
    expect(
      staticRelativeImports(
        'const m = import("./lazy.js"); const n = await import( "./lazy2.js" )',
      ),
    ).toEqual([])
  })
})

describe('staticClosureCode', () => {
  it('includes statically imported chunks transitively and excludes lazy ones', async () => {
    const code = await staticClosureCode([
      out(
        'entry-point',
        '/o/entry.js',
        'import{x}from"./chunk-shared.js";import("./chunk-lazy.js");ENTRY',
      ),
      out('chunk', '/o/chunk-shared.js', 'import"./chunk-deep.js";SHARED'),
      out('chunk', '/o/chunk-deep.js', 'DEEP'),
      out('chunk', '/o/chunk-lazy.js', 'LAZY'),
    ])
    expect(code).toContain('ENTRY')
    expect(code).toContain('SHARED')
    expect(code).toContain('DEEP')
    expect(code).not.toContain('LAZY')
  })

  it('counts a chunk imported twice once', async () => {
    const code = await staticClosureCode([
      out('entry-point', '/o/entry.js', 'import"./a.js";import"./b.js";E'),
      out('chunk', '/o/a.js', 'import"./b.js";A'),
      out('chunk', '/o/b.js', 'B'),
    ])
    expect(code?.match(/B/g)).toHaveLength(1)
  })

  it('returns null when there is no entry-point output', async () => {
    expect(await staticClosureCode([out('chunk', '/o/a.js', 'A')])).toBeNull()
  })
})
