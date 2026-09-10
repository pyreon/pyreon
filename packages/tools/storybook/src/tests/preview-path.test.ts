/**
 * `previewPathFor` — the scheme guard, both arms.
 *
 * The module must stay TOTAL in every ESM environment. Storybook loads the
 * built preset with a real `file:` URL, where the annotation has to be a
 * filesystem path; transform pipelines (vitest serves modules over their own
 * scheme) hand out non-file URLs, where `fileURLToPath` THROWS at module eval.
 * A throw there is not a degraded preset — the whole Storybook config fails to
 * load, which is the failure this guard was added to cure.
 *
 * Only the non-file arm is reachable from a source test, because vitest's own
 * scheme is what `import.meta.url` carries here. Naming the decision is what
 * makes the shipped arm testable at all.
 */
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { previewPathFor } from '../preset'

describe('previewPathFor', () => {
  it('converts a real file: URL to a filesystem path (the SHIPPED arm)', () => {
    const url = pathToFileURL('/tmp/pkg/lib/preview.js')
    const out = previewPathFor(url)
    expect(out, 'a file: URL must become a path, not stay a URL').toBe('/tmp/pkg/lib/preview.js')
    expect(out.startsWith('file:')).toBe(false)
  })

  it('falls back to the pathname for a non-file scheme, without throwing', () => {
    // `fileURLToPath` throws on any non-file URL. Reaching it here would take
    // down config load in every transform pipeline.
    const url = new URL('http://localhost:5173/src/preview.ts')
    expect(() => previewPathFor(url)).not.toThrow()
    expect(previewPathFor(url)).toBe('/src/preview.ts')
  })

  it('handles the other non-file schemes a loader can produce', () => {
    for (const raw of ['https://cdn.test/x/preview.js', 'data:text/javascript,0']) {
      expect(() => previewPathFor(new URL(raw)), raw).not.toThrow()
    }
  })
})
