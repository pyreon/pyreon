import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEMO_REFERENCE_ONLY, REFERENCE_ONLY, stripReferenceOnly } from '../../../vite-plugins/product-content'

/**
 * The build drops the fields of a product file that no page renders (the
 * canvas prototype behind each demo, reference HTML, claim sources), so no
 * chunk or SSR pass carries them. A field the template starts rendering must
 * come off these lists in the same change.
 */
const dir = resolve(__dirname, '../content/products')
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'))

describe('stripReferenceOnly', () => {
  it.each(files)('%s keeps what pages render and loses the reference-only fields', (file) => {
    const raw = readFileSync(resolve(dir, file), 'utf8')
    const data = stripReferenceOnly(JSON.parse(raw) as Record<string, unknown>)
    for (const k of REFERENCE_ONLY) expect(data, k).not.toHaveProperty(k)
    const demo = data.demo as Record<string, unknown>
    for (const k of DEMO_REFERENCE_ONLY) expect(demo, `demo.${k}`).not.toHaveProperty(k)
    for (const k of ['title', 'text', 'component']) expect(demo, `demo.${k}`).toHaveProperty(k)
    for (const k of ['hero', 'why', 'features', 'api', 'limits', 'related', 'end']) expect(data, k).toHaveProperty(k)
    // The reference fields are most of each file.
    expect(JSON.stringify(data).length).toBeLessThan(raw.length)
  })
})
