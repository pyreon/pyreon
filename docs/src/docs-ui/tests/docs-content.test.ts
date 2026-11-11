import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(import.meta.dirname, '../../site/content')
const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown

describe('docs content files', () => {
  it('the split sidebar and overview files equal _docs.json (re-run scripts/sync-site-content.ts)', () => {
    const docs = read('_docs.json') as { sidebar: unknown; overviews: unknown }
    expect(read('_docs-sidebar.json')).toEqual(docs.sidebar)
    expect(read('_docs-overviews.json')).toEqual(docs.overviews)
    const overviews = docs.overviews as { productId: string; docsPage: string | null; docsHref: string; crossSell: string[] }[]
    expect(read('_docs-index.json')).toEqual({
      overviewPages: Object.fromEntries(overviews.filter((o) => o.docsPage !== null).map((o) => [o.docsHref, o.productId])),
      rail: Object.fromEntries(overviews.filter((o) => o.crossSell[0]).map((o) => [o.productId, o.crossSell[0]])),
    })
  })
})

const pagesDir = join(import.meta.dirname, '../../content/docs')
function mdFiles(d: string): string[] {
  return readdirSync(d).flatMap((f) => {
    const p = join(d, f)
    return statSync(p).isDirectory() ? mdFiles(p) : f.endsWith('.md') ? [p] : []
  })
}

describe('docs pages', () => {
  // The docs layout prints the frontmatter title as the page's one h1, with
  // the inline "On this page" under it; a Markdown `# heading` would be a
  // second h1 below the TOC. Generated pages too (docs/scripts/gen-*.ts).
  it('carry no `# heading` of their own (the title is the h1)', () => {
    const withH1 = mdFiles(pagesDir).filter((file) => {
      let inFence = false
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (line.startsWith('```')) inFence = !inFence
        else if (!inFence && line.startsWith('# ')) return true
      }
      return false
    })
    expect(withH1.map((f) => relative(pagesDir, f))).toEqual([])
  })
})
