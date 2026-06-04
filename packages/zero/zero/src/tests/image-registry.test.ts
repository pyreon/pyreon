/**
 * createImageRegistry — the icon-set / logo-list primitive.
 *
 * Verifies the three lookup styles (full path, basename with extension,
 * basename without), the option to disable basename aliases, the
 * dev-mode missing-key error shape, and fallback behaviour.
 */
import { describe, expect, it } from 'vitest'
import { createImageRegistry } from '../image-registry'
import type { ProcessedImage } from '../image-plugin'

function descriptor(src: string): ProcessedImage {
  return {
    src,
    srcset: `${src} 1024w`,
    width: 1024,
    height: 768,
    placeholder: '',
    formats: [],
    sources: [{ src, width: 1024, format: 'webp' }],
  }
}

describe('createImageRegistry', () => {
  it('looks up by full path', () => {
    const r = createImageRegistry({
      '../assets/partners/strv.png': descriptor('/img/strv.png'),
    })
    expect(r('../assets/partners/strv.png').src).toBe('/img/strv.png')
  })

  it('aliases basename + basename-without-ext under "auto" (the default)', () => {
    const r = createImageRegistry({
      '../assets/partners/strv.png': descriptor('/img/strv.png'),
    })
    expect(r('strv.png').src).toBe('/img/strv.png')
    expect(r('strv').src).toBe('/img/strv.png')
  })

  it('disables basename aliases under "path" mode', () => {
    const r = createImageRegistry(
      { '../assets/partners/strv.png': descriptor('/img/strv.png') },
      { keyBy: 'path' },
    )
    expect(r.has('strv')).toBe(false)
    expect(r.has('strv.png')).toBe(false)
    expect(r('../assets/partners/strv.png').src).toBe('/img/strv.png')
  })

  it('unwraps the { default: descriptor } module shape', () => {
    const r = createImageRegistry({
      './a.png': { default: descriptor('/img/a.png') },
    })
    expect(r('a').src).toBe('/img/a.png')
  })

  it('first entry wins for basename collisions (auto mode)', () => {
    // Two paths with same basename — registry picks up the FIRST one's
    // descriptor for the basename alias, leaves the second under its full
    // path only. `keyBy: 'path'` is the documented escape hatch.
    const r = createImageRegistry({
      'logos/strv.png': descriptor('/logos/strv.png'),
      'icons/strv.png': descriptor('/icons/strv.png'),
    })
    expect(r('strv').src).toBe('/logos/strv.png')
    expect(r('logos/strv.png').src).toBe('/logos/strv.png')
    expect(r('icons/strv.png').src).toBe('/icons/strv.png')
  })

  it('throws a descriptive error with available keys when missing', () => {
    const r = createImageRegistry({
      './a.png': descriptor('/img/a.png'),
      './b.png': descriptor('/img/b.png'),
    })
    expect(() => r('nope')).toThrow(/no image registered for 'nope'/)
    expect(() => r('nope')).toThrow(/Registered keys:.*a/)
  })

  it('returns the fallback when supplied for a missing key', () => {
    const r = createImageRegistry({ './a.png': descriptor('/img/a.png') })
    const placeholder = descriptor('/img/placeholder.png')
    expect(r('nope', placeholder)).toBe(placeholder)
  })

  it('returns the explicit null fallback (signalling "no image")', () => {
    const r = createImageRegistry({ './a.png': descriptor('/img/a.png') })
    // null is a valid fallback — opt-in skip-rendering pattern.
    expect(r('nope', null)).toBe(null as unknown as ProcessedImage)
  })

  it('has() reports membership for every aliased key', () => {
    const r = createImageRegistry({ 'p/strv.png': descriptor('/img/strv.png') })
    expect(r.has('p/strv.png')).toBe(true)
    expect(r.has('strv.png')).toBe(true)
    expect(r.has('strv')).toBe(true)
    expect(r.has('nope')).toBe(false)
  })

  it('keys() enumerates everything stored', () => {
    const r = createImageRegistry({ 'p/strv.png': descriptor('/img/strv.png') })
    const ks = r.keys()
    expect(ks).toContain('p/strv.png')
    expect(ks).toContain('strv.png')
    expect(ks).toContain('strv')
  })

  it('preserves the FULL descriptor (not just .src)', () => {
    const desc = descriptor('/img/strv.png')
    const r = createImageRegistry({ './strv.png': desc })
    const found = r('strv')
    expect(found.width).toBe(1024)
    expect(found.height).toBe(768)
    expect(found.srcset).toContain('1024w')
    expect(found.sources).toHaveLength(1)
  })
})
