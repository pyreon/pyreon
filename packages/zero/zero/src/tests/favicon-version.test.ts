/**
 * Regression: favicon `?v=` cache-bust query must be a STABLE content
 * hash — identical source bytes → identical query (no needless browser
 * cache churn); changed bytes → different query (returning visitors
 * actually re-download the changed icon); unreadable source → `''`
 * (no query; never break the build over a cache-bust nicety).
 *
 * Browsers cache favicons extremely aggressively, so without this a
 * changed icon on a stable URL is never re-fetched (the gap this fixes).
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { faviconVersionQuery } from '../favicon'

let dir: string
let a: string
let b: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pyreon-favver-'))
  a = join(dir, 'a.svg')
  b = join(dir, 'b.svg')
  await writeFile(a, '<svg fill="#6d28d9"/>')
  await writeFile(b, '<svg fill="#0ea5e9"/>')
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('faviconVersionQuery', () => {
  it('returns a ?v=<8 hex> query for a readable source', () => {
    expect(faviconVersionQuery([a])).toMatch(/^\?v=[0-9a-f]{8}$/)
  })

  it('is stable for identical content (no cache churn)', () => {
    expect(faviconVersionQuery([a])).toBe(faviconVersionQuery([a]))
  })

  it('changes when content changes (returning visitors re-download)', () => {
    expect(faviconVersionQuery([a])).not.toBe(faviconVersionQuery([b]))
  })

  it('order/multi-source: base+dark folds both into the hash', () => {
    expect(faviconVersionQuery([a, b])).not.toBe(faviconVersionQuery([a]))
    expect(faviconVersionQuery([a, b])).toBe(faviconVersionQuery([a, b]))
  })

  it("unreadable source → '' (no query — build not broken)", () => {
    expect(faviconVersionQuery([join(dir, 'does-not-exist.svg')])).toBe('')
  })
})
