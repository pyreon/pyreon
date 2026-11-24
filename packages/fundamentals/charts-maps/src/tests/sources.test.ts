// The record of where the data came from must agree with the script that regenerates it.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const script = readFileSync(join(root, 'scripts', 'build-data.ts'), 'utf8')
const sources = readFileSync(join(root, 'SOURCES.md'), 'utf8')

describe('SOURCES.md and build-data.ts agree', () => {
  it('every source checksum and URL in the script is recorded in SOURCES.md', () => {
    const sums = [...script.matchAll(/sha256: '([0-9a-f]{64})'/g)].map((m) => m[1]!)
    const urls = [...script.matchAll(/url: '([^']+)'/g)].map((m) => m[1]!)
    expect(sums).toHaveLength(2)
    expect(urls).toHaveLength(2)
    for (const s of sums) expect(sources, `checksum ${s}`).toContain(s)
    for (const u of urls) expect(sources, `url ${u}`).toContain(u)
  })
  it('states the licence and that no simplification is applied beyond the source', () => {
    expect(sources).toMatch(/public domain/i)
    expect(sources).toMatch(/Simplification: none beyond the source/)
  })
})
