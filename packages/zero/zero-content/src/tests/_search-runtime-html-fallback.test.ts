/**
 * What the search loader says when it fetches HTML instead of an index.
 *
 * Every static host answers a MISSING file with its SPA fallback — a 200
 * carrying `index.html` — so `res.ok` is true and the loader walks
 * straight into `.json()`, which throws
 * `Unexpected token '<', "<!DOCTYPE "...`. That message names a DOCTYPE
 * for a file that was never written, and whoever reads it goes looking
 * at their markup rather than at their build.
 *
 * It is reachable in production, not only in dev: `buildSearchIndex`
 * writes the catalog ONLY when at least one collection produced entries
 * (asserted in `_search-index-and-tabs`), so a site whose content has
 * not landed, a partial deploy, or a `base` that does not match the
 * deploy path all arrive here. The dev-server middleware exists to
 * prevent exactly this error in dev; nothing was covering the
 * production side.
 */
import { describe, expect, it } from 'vitest'
import { loadSearchIndex } from '../search/search-runtime'

const SPA_FALLBACK = '<!DOCTYPE html>\n<html><body><div id="app"></div></body></html>'

/** A real `Response`, so the loader's clone-then-parse path is exercised. */
const respond = (body: string, init: ResponseInit = {}) =>
  async () => new Response(body, { status: 200, ...init })

// A fresh URL per spec: the loader memoises by catalog URL, so reusing
// one would serve the previous spec's result and prove nothing.
let n = 0
const url = () => `/spec-${++n}/search-index.json`

describe('an HTML body is reported as a MISSING FILE, not as bad JSON', () => {
  it('names the URL, the SPA fallback, and both likely causes', async () => {
    const u = url()
    const err = await loadSearchIndex(u, respond(SPA_FALLBACK) as never).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    const msg = (err as Error).message
    expect(msg, 'the URL locates the problem').toContain(u)
    expect(msg, 'and names what arrived').toContain('HTML')
    expect(msg).toContain('SPA fallback')
    expect(msg, 'and points at the build').toMatch(/collection produced entries/)
    expect(msg, 'and at the other cause').toContain('base')
    expect(msg, 'never the raw parse error').not.toContain('Unexpected token')
  })

  it('reports a CHUNK that came back as HTML too', async () => {
    // The catalog can be present while a chunk is missing — a partial
    // deploy, or a stale catalog naming a collection since removed.
    const u = url()
    const fetchFn = async (target: string | URL) =>
      String(target) === u
        ? new Response(JSON.stringify({ collections: [{ name: 'docs', url: '/search-index-docs.json' }] }))
        : new Response(SPA_FALLBACK, { status: 200 })
    const err = await loadSearchIndex(u, fetchFn as never).catch((e: Error) => e)
    expect((err as Error).message).toContain('/search-index-docs.json')
    expect((err as Error).message).toContain('HTML')
  })

  it('reports NON-html garbage differently — it is not a missing file', async () => {
    // A truncated write or a proxy that mangled the body. Blaming the
    // SPA fallback there sends the reader after the wrong thing.
    const u = url()
    const err = await loadSearchIndex(u, respond('{ truncated') as never).catch((e: Error) => e)
    const msg = (err as Error).message
    expect(msg).toContain('did not contain valid JSON')
    expect(msg).not.toContain('SPA fallback')
  })

  it('still surfaces a genuine non-200 as a status error', async () => {
    // A host that 404s properly. That message is already actionable and
    // must not be replaced by the HTML explanation.
    const u = url()
    const err = await loadSearchIndex(
      u, respond('nope', { status: 404 }) as never,
    ).catch((e: Error) => e)
    expect((err as Error).message).toContain('404')
  })

  it('loads normally when the catalog IS json', async () => {
    // The control. Without it every spec above passes against a loader
    // that rejects everything.
    const u = url()
    const fetchFn = async (target: string | URL) =>
      String(target) === u
        ? new Response(JSON.stringify({ collections: [{ name: 'docs', url: '/c.json' }] }))
        : new Response(JSON.stringify({ docs: [{ id: '1', title: 'T', body: 'b', url: '/x' }] }))
    await expect(loadSearchIndex(u, fetchFn as never)).resolves.toBeTruthy()
  })
})
