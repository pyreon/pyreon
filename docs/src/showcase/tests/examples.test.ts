import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SHOWCASE, THEMES } from '../examples'

const DOCS = resolve(import.meta.dirname, '../../..')
const EXAMPLES = resolve(DOCS, '../examples')

const pyreonDeps = (dir: string): Set<string> => {
  const pkg = JSON.parse(readFileSync(resolve(EXAMPLES, dir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  return new Set(Object.keys(pkg.dependencies ?? {}).filter((n) => n.startsWith('@pyreon/')).map((n) => n.slice(8)))
}

describe('showcase data', () => {
  for (const ex of SHOWCASE) {
    describe(ex.dir, () => {
      it('names only packages the example depends on', () => {
        const deps = pyreonDeps(ex.dir)
        expect(ex.highlights.filter((name) => !deps.has(name))).toEqual([])
      })

      it('links to source directories that exist', () => {
        for (const dir of [ex.dir, ...(ex.alsoSource ?? []).map((s) => s.dir)]) {
          expect(existsSync(resolve(EXAMPLES, dir, 'package.json')), dir).toBe(true)
        }
      })

      it('ships its screenshots', () => {
        for (const shot of [ex.desktop, ex.mobile].filter((s) => s !== undefined)) {
          expect(existsSync(resolve(DOCS, 'public', shot.src.slice(1))), shot.src).toBe(true)
        }
      })

      it('belongs to a known theme', () => {
        expect(THEMES.map((t) => t.id)).toContain(ex.theme)
      })
    })
  }
})
