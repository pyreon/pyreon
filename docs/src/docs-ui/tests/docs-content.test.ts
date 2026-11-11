import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(import.meta.dirname, '../../site/content')
const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown

describe('docs content files', () => {
  it('the split sidebar and overview files equal _docs.json (re-run scripts/sync-docs-content.ts)', () => {
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
