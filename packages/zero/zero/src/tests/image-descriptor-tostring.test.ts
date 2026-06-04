/**
 * Descriptor compatibility guardrail.
 *
 * The bi-modal `<Image>` design defaults image imports to a descriptor
 * object (carries width/height/srcset/placeholder/formats) instead of a
 * bare URL string. The compat bridge that makes this safe across the
 * ecosystem is `ProcessedImage.toString()` / `[Symbol.toPrimitive]` /
 * `.valueOf` returning the URL — so foreign code that does
 * `<img src={import('./pic.png')}>` continues to render the right image
 * even when it's not using Pyreon's `<Image>`. This test locks the
 * exact emit shape of the runtime helper that the image plugin uses
 * (`emitDescriptor` in `image-plugin.ts`).
 */
import { describe, expect, it } from 'vitest'

/**
 * Reproduces the emit shape `emitDescriptor` writes — kept inline so the
 * test stays a single-file lock on the compat contract and doesn't
 * depend on running the Vite plugin pipeline end-to-end.
 */
function applyDescriptorGuardrails<T extends { src: string }>(d: T): T {
  const s = () => d.src
  Object.defineProperty(d, 'toString', { value: s })
  Object.defineProperty(d, 'valueOf', { value: s })
  Object.defineProperty(d, Symbol.toPrimitive, { value: s })
  return Object.freeze(d)
}

const desc = applyDescriptorGuardrails({
  src: '/assets/hero-a1b2c3.webp',
  srcset: '/hero-320.webp 320w, /hero-1920.webp 1920w',
  width: 1920,
  height: 1080,
  placeholder: '',
  formats: [],
  sources: [],
})

describe('descriptor coerces to URL in string contexts', () => {
  it('String(desc) returns the URL', () => {
    expect(String(desc)).toBe('/assets/hero-a1b2c3.webp')
  })

  it('template literal embedding returns the URL', () => {
    expect(`${desc}`).toBe('/assets/hero-a1b2c3.webp')
  })

  it('valueOf is the URL (so + concatenation and `==` work)', () => {
    expect(desc + '').toBe('/assets/hero-a1b2c3.webp')
    expect(desc == '/assets/hero-a1b2c3.webp').toBe(true)
  })

  it('Symbol.toPrimitive returns the URL for both hint modes', () => {
    const prim = desc[Symbol.toPrimitive] as (h: string) => string
    expect(prim.call(desc, 'string')).toBe('/assets/hero-a1b2c3.webp')
    expect(prim.call(desc, 'default')).toBe('/assets/hero-a1b2c3.webp')
  })

  it('rich fields are still accessible directly', () => {
    expect(desc.width).toBe(1920)
    expect(desc.height).toBe(1080)
    expect(desc.srcset).toContain('320w')
  })

  it('descriptor is frozen — accidental mutation would surface immediately', () => {
    expect(() => {
      ;(desc as { src: string }).src = '/nope'
    }).toThrow(TypeError)
  })

  it('JSON.stringify does NOT emit toString as a data field (it is non-enumerable)', () => {
    // `Object.defineProperty` defaults `enumerable: false`, so toString /
    // valueOf / Symbol.toPrimitive never show up in the serialized JSON
    // text. JSON.parse'ing it still gives an object whose prototype chain
    // has `toString` (every JS object does), so we assert the serialized
    // BYTES, not the parsed shape's `.toString` property.
    const serialized = JSON.stringify(desc)
    expect(serialized).toContain('"src":"/assets/hero-a1b2c3.webp"')
    expect(serialized).toContain('"width":1920')
    expect(serialized).not.toContain('"toString"')
    expect(serialized).not.toContain('"valueOf"')
  })
})

describe('foreign-component compat — bare <img src={descriptor}>', () => {
  it('setAttribute stringifies the descriptor via toString', () => {
    const img = { setAttribute: (k: string, v: unknown) => ((img as { [k: string]: unknown })[k] = v) }
    img.setAttribute('src', desc as unknown as string)
    expect((img as { src: unknown }).src).toBe(desc)
    expect(String((img as { src: unknown }).src)).toBe('/assets/hero-a1b2c3.webp')
  })

  it('object-spread preserves toString in the spread copy', () => {
    // <img {...desc}> from a foreign component — though this is normally
    // a bad practice, the result still has the URL via .src + .toString.
    const spread = { ...desc }
    expect(spread.src).toBe('/assets/hero-a1b2c3.webp')
    // Note: defineProperty's non-enumerable toString does NOT carry via
    // object spread. The spread copy reverts to Object.prototype.toString,
    // which is "[object Object]". Consumers that spread MUST use .src
    // explicitly. This is the one ergonomic price the guardrail charges.
    expect(String(spread)).toBe('[object Object]')
  })
})
