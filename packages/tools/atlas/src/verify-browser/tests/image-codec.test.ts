/**
 * Differential lock for atlas's own PNG decoder and pixel diff, against the
 * two libraries they replaced (`pngjs@7.0.0`, `pixelmatch@7.2.0`).
 *
 * `fixtures/image-diff/oracle.json` was RECORDED from those libraries before
 * they were removed (the generator is described in the PR that removed them):
 *
 *   - `real` — pairs of genuine Chromium element screenshots (text shifted by
 *     a pixel, letter-spacing changed, a colour change, a layout change,
 *     identical, sub-pixel SVG, translucent panels captured with
 *     `omitBackground`, dark-on-light), each compared under five option sets.
 *     For every pair the oracle holds pngjs's decoded bytes and pixelmatch's
 *     count AND diff image.
 *   - `synthetic` — 400 seeded pairs built to reach every branch (identical
 *     images, translucency, image borders, blended "anti-aliased" pixels).
 *   - `decode` — pngjs-ENCODED files over every colour type we accept and
 *     every scanline filter, so the decoder is checked against a second,
 *     independent encoder rather than only Chromium's.
 *
 * Asserting SHA-256 of the full output (rather than a few pixels) is the
 * point: a single differing byte in a diff image fails here.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { crc32, decodePng, encodePng } from '../png'
import { type PixelDiffOptions, pixelDiff } from '../pixel-diff'

const DIR = join(import.meta.dirname, 'fixtures/image-diff')
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

interface Oracle {
  real: {
    name: string
    width: number
    height: number
    decodedSha: [string, string]
    results: { opts: PixelDiffOptions; count: number; diffSha: string }[]
  }[]
  synthetic: { seed: number; opts: PixelDiffOptions; count: number; diffSha: string }[]
  decode: { name: string; width: number; height: number; decodedSha: string }[]
}
const oracle = JSON.parse(readFileSync(join(DIR, 'oracle.json'), 'utf8')) as Oracle

describe('decodePng — differential vs pngjs', () => {
  it.each(oracle.real)('decodes the Chromium screenshot pair $name byte-identically', (pair) => {
    for (const [i, side] of (['a', 'b'] as const).entries()) {
      const png = decodePng(readFileSync(join(DIR, `${pair.name}.${side}.png`)))
      expect(png.width).toBe(pair.width)
      expect(png.height).toBe(pair.height)
      expect(sha(png.data)).toBe(pair.decodedSha[i])
    }
  })

  it.each(oracle.decode)('decodes the pngjs-encoded $name byte-identically', (entry) => {
    const png = decodePng(readFileSync(join(DIR, entry.name)))
    expect([png.width, png.height]).toEqual([entry.width, entry.height])
    expect(sha(png.data)).toBe(entry.decodedSha)
  })

  it('the corpus covers every colour type and every filter it claims to', () => {
    // Guards the premise: a corpus that silently lost its filter-4 files
    // would leave the Paeth path unchecked while every spec stayed green.
    const names = oracle.decode.map((d) => d.name)
    for (const ct of [0, 2, 4, 6]) for (const f of [0, 1, 2, 3, 4]) expect(names).toContain(`codec-ct${ct}-f${f}.png`)
  })
})

describe('decodePng — integrity and refusals', () => {
  const good = (): Buffer => readFileSync(join(DIR, 'codec-ct6-f4.png'))

  it('rejects a bad signature', () => {
    const b = good()
    b[1] = 0
    expect(() => decodePng(b)).toThrow(/bad signature/)
  })

  it('rejects a flipped byte via the chunk CRC', () => {
    const b = good()
    // Inside the IHDR payload (offset 8 sig + 8 header).
    b[20] = b[20]! ^ 0xff
    expect(() => decodePng(b)).toThrow(/CRC mismatch in the IHDR chunk/)
  })

  it('rejects a truncated file', () => {
    const b = good()
    expect(() => decodePng(b.subarray(0, b.length - 20))).toThrow(/truncated|IEND/)
  })

  function withHeader(bitDepth: number, colorType: number, interlace = 0): Buffer {
    const b = Buffer.from(good())
    b[24] = bitDepth
    b[25] = colorType
    b[28] = interlace
    b.writeUInt32BE(crc32(b, 12, 29), 29)
    return b
  }

  it('refuses a palette image with a message naming the cause and the fix', () => {
    expect(() => decodePng(withHeader(8, 3))).toThrow(/8-bit palette .*re-record/s)
  })

  it('refuses 16-bit and sub-byte depths rather than decoding approximately', () => {
    expect(() => decodePng(withHeader(16, 6))).toThrow(/16-bit truecolor \+ alpha/)
    expect(() => decodePng(withHeader(4, 0))).toThrow(/4-bit greyscale/)
  })

  it('refuses Adam7 interlacing', () => {
    expect(() => decodePng(withHeader(8, 6, 1))).toThrow(/interlaced/)
  })

  it('rejects an unknown scanline filter type', () => {
    // Re-encode with a bogus filter byte on row 0 and valid CRCs throughout.
    const raw = Buffer.from([9, 1, 2, 3, 4])
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(1, 0)
    ihdr.writeUInt32BE(1, 4)
    ihdr[8] = 8
    ihdr[9] = 6
    const chunk = (type: string, data: Buffer): Buffer => {
      const c = Buffer.alloc(12 + data.length)
      c.writeUInt32BE(data.length, 0)
      c.write(type, 4, 'latin1')
      data.copy(c, 8)
      c.writeUInt32BE(crc32(c, 4, 8 + data.length), 8 + data.length)
      return c
    }
    const file = Buffer.concat([
      good().subarray(0, 8),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ])
    expect(() => decodePng(file)).toThrow(/unknown filter type 9/)
  })
})

describe('encodePng', () => {
  it('round-trips through decodePng', () => {
    const w = 7
    const h = 5
    const rgba = Buffer.alloc(w * h * 4)
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37) & 255
    const back = decodePng(encodePng(w, h, rgba))
    expect([back.width, back.height]).toEqual([w, h])
    expect(back.data.equals(rgba)).toBe(true)
  })

  it('refuses a buffer that is not width*height*4 bytes', () => {
    expect(() => encodePng(2, 2, new Uint8Array(15))).toThrow(/15 bytes for a 2x2/)
  })
})

describe('pixelDiff — differential vs pixelmatch', () => {
  it.each(oracle.real)('real Chromium pair $name: every option set matches count AND diff image', (pair) => {
    const a = decodePng(readFileSync(join(DIR, `${pair.name}.a.png`)))
    const b = decodePng(readFileSync(join(DIR, `${pair.name}.b.png`)))
    for (const r of pair.results) {
      const out = Buffer.alloc(a.data.length)
      expect(pixelDiff(a.data, b.data, out, a.width, a.height, r.opts), JSON.stringify(r.opts)).toBe(r.count)
      expect(sha(out), JSON.stringify(r.opts)).toBe(r.diffSha)
      // The count must not depend on whether a diff image is requested.
      expect(pixelDiff(a.data, b.data, null, a.width, a.height, r.opts)).toBe(r.count)
    }
  })

  it('the real corpus actually exercises differences, not only identical pairs', () => {
    const counts = oracle.real.flatMap((p) => p.results.map((r) => r.count))
    expect(counts.filter((c) => c > 0).length).toBeGreaterThan(10)
  })

  it('400 seeded synthetic pairs match count AND diff image', () => {
    const mismatches: number[] = []
    for (const entry of oracle.synthetic) {
      const { w, h, a, b } = synth(entry.seed)
      const out = Buffer.alloc(a.length)
      const count = pixelDiff(a, b, out, w, h, entry.opts)
      if (count !== entry.count || sha(out) !== entry.diffSha) mismatches.push(entry.seed)
    }
    expect(mismatches).toEqual([])
  })

  it('rejects mismatched buffers and a wrong declared size', () => {
    expect(() => pixelDiff(new Uint8Array(4), new Uint8Array(8), null, 1, 1)).toThrow(/sizes do not match/)
    expect(() => pixelDiff(new Uint8Array(8), new Uint8Array(8), null, 1, 1)).toThrow(/expected 4 for 1x1/)
    expect(() => pixelDiff([] as unknown as Uint8Array, new Uint8Array(4), null, 1, 1)).toThrow(/Uint8Array/)
  })
})

/**
 * The synthetic generator — MUST stay byte-for-byte what produced the oracle
 * (a mulberry32 PRNG over structured blocks plus edits: recolour, alpha
 * change, small brightness nudge, and neighbour-blend "anti-aliasing").
 */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    return (((s ^ (s >>> 15)) * (s | 1)) >>> 0) / 4294967296
  }
}

function synth(seed: number): { w: number; h: number; a: Buffer; b: Buffer } {
  const r = rng(seed)
  const w = 3 + Math.floor(r() * 30)
  const h = 3 + Math.floor(r() * 30)
  const a = Buffer.alloc(w * h * 4)
  const palette = Array.from({ length: 4 }, () => [
    (r() * 256) | 0,
    (r() * 256) | 0,
    (r() * 256) | 0,
    r() < 0.3 ? (r() * 256) | 0 : 255,
  ])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = palette[((x * 3 < w ? 0 : x * 3 < 2 * w ? 1 : 2) + (y * 2 < h ? 0 : 1)) & 3]!
      const i = (y * w + x) * 4
      a[i] = c[0]!
      a[i + 1] = c[1]!
      a[i + 2] = c[2]!
      a[i + 3] = c[3]!
    }
  }
  const b = Buffer.from(a)
  const edits = Math.floor(r() * w * h * 0.3)
  for (let e = 0; e < edits; e++) {
    const i = Math.floor(r() * w * h) * 4
    const kind = r()
    if (kind < 0.4) {
      b[i] = (r() * 256) | 0
      b[i + 1] = (r() * 256) | 0
      b[i + 2] = (r() * 256) | 0
    } else if (kind < 0.6) {
      b[i + 3] = (r() * 256) | 0
    } else if (kind < 0.8) {
      const d = ((r() * 40) | 0) - 20
      for (let k = 0; k < 3; k++) b[i + k] = Math.max(0, Math.min(255, b[i + k]! + d))
    } else {
      const j = Math.min(i + 4, b.length - 4)
      for (let k = 0; k < 3; k++) b[i + k] = ((a[i + k]! + a[j + k]!) / 2) | 0
    }
  }
  if (r() < 0.1) b.set(a)
  return { w, h, a, b }
}
