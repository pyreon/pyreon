import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SHOWCASE_COPY } from '../../site/content/channels'
import { asset } from '../../site/kit/assets'
import { sourceUrl } from '../ShowcasePage'

const DOCS = resolve(import.meta.dirname, '../../..')
const EXAMPLES = resolve(DOCS, '../examples')
const EXAMPLE_LIST = [SHOWCASE_COPY.featured.example, ...SHOWCASE_COPY.more.items]

const pyreonDeps = (dir: string): Set<string> => {
  const pkg = JSON.parse(readFileSync(resolve(EXAMPLES, dir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  return new Set(Object.keys(pkg.dependencies ?? {}).filter((n) => n.startsWith('@pyreon/')).map((n) => n.slice(8)))
}

describe('showcase content', () => {
  for (const ex of EXAMPLE_LIST) {
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

      it('runs from the directory it names', () => {
        expect(ex.run.startsWith(`cd examples/${ex.dir} && `)).toBe(true)
      })
    })
  }

  it('every capture is a showcase image in the synced asset set', () => {
    expect(SHOWCASE_COPY.featured.captures.length).toBeGreaterThan(0)
    for (const c of SHOWCASE_COPY.featured.captures) {
      const record = asset(c.file)
      expect(record.slot, c.file).toBe('showcase-card')
      expect(record.alt.length, c.file).toBeGreaterThan(20)
    }
  })

  it('builds GitHub source URLs', () => {
    expect(sourceUrl('hn-clone')).toBe('https://github.com/pyreon/pyreon/tree/main/examples/hn-clone')
  })
})
