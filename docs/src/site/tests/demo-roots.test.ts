import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A product demo is an island: on a static page it hydrates as its own root,
 * with no UI-system provider above it. Without `KitScope` (or `DemoGrid`,
 * which roots in it) its kit components resolve with no theme: the client
 * computes other classes than the server (no breakpoints, unresolved
 * light/dark pairs, `NaN` sizes) and the demo loses its padding and gaps the
 * moment it hydrates. Eight demos shipped that way.
 */
const dir = resolve(__dirname, '../demos')
const demos = readdirSync(dir).filter((f) => /^Demo[A-Z].*\.tsx$/.test(f))

describe('product demo roots', () => {
  // The first component in the returned tree must be KitScope or DemoGrid.
  // Plain elements and the data providers below may sit outside it: they
  // render no kit component.
  const OUTSIDE_OK = /^(?:[a-z][a-z0-9]*|QueryClientProvider)$/
  it.each(demos)('%s renders no kit component outside KitScope / DemoGrid', (file) => {
    const src = readFileSync(resolve(dir, file), 'utf8')
    const body = src.slice(src.indexOf('export default function'))
    const ret = body.slice(body.indexOf('\n  return ('))
    const tags = [...ret.matchAll(/<([A-Za-z][\w.]*)/g)].map((m) => m[1] ?? '')
    const first = tags.find((t) => !OUTSIDE_OK.test(t))
    if (first === 'Readers') return // DemoQuery: Readers roots in DemoGrid (checked below)
    expect(first, file).toMatch(/^(KitScope|DemoGrid)$/)
  })

  it('DemoQuery: its Readers roots in DemoGrid', () => {
    const src = readFileSync(resolve(dir, 'DemoQuery.tsx'), 'utf8')
    const readers = src.slice(src.indexOf('function Readers'))
    expect(readers.slice(readers.indexOf('return ('))).toMatch(/return \(\s*<DemoGrid>/)
  })
})
