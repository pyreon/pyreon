/*! Perceptual pixel diff — derived from pixelmatch (https://github.com/mapbox/pixelmatch).
 *  ISC License. Copyright (c) 2025, Mapbox.
 *  Permission to use, copy, modify, and/or distribute this software for any purpose
 *  with or without fee is hereby granted, provided that the above copyright notice
 *  and this permission notice appear in all copies.
 *  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 *  REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
 *  FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 *  INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
 *  OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
 *  TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
 *  THIS SOFTWARE.
 */
/**
 * The snapshot comparator behind `atlas verify-browser`.
 *
 * Two published techniques, reproduced so atlas's verdicts do not move when
 * this replaced the `pixelmatch` dependency:
 *
 *   - the colour metric is the squared YIQ distance from Kotsarenko & Ramos,
 *     "Measuring perceived color difference using YIQ NTSC transmission color
 *     space in mobile applications" — a perceptual weighting, so a shift the
 *     eye cannot see does not count;
 *   - a pixel that differs is forgiven as ANTI-ALIASING when it sits on an
 *     intensity slope between a darker and a brighter neighbour that are each
 *     solid regions in both images (Vysniauskas, "Anti-aliased Pixel and
 *     Intensity Slope Detector", 2009). That is what lets a snapshot survive
 *     sub-pixel text rasterization differences without a loose threshold.
 *
 * Output — the count AND the optional diff image — is byte-identical to
 * pixelmatch 7.2.0 for every option below; `pixel-diff.test.ts` holds it to a
 * corpus recorded from that version (real Chromium screenshot pairs plus
 * seeded synthetic pairs that reach every branch), so a drift here fails a
 * test rather than silently re-baselining users' snapshots.
 */

export type RGB = readonly [number, number, number]

export interface PixelDiffOptions {
  /** Matching threshold, 0..1; smaller is more sensitive. Default 0.1. */
  threshold?: number
  /** Count anti-aliased pixels as differences instead of forgiving them. Default false. */
  includeAA?: boolean
  /** Opacity of the original image drawn under the diff. Default 0.1. */
  alpha?: number
  /** Colour of forgiven anti-aliased pixels in the diff image. Default yellow. */
  aaColor?: RGB
  /** Colour of differing pixels in the diff image. Default red. */
  diffColor?: RGB
  /** Colour for differing pixels where image 2 is DARKER; defaults to `diffColor`. */
  diffColorAlt?: RGB
  /** Draw only the differences over a transparent background. Default false. */
  diffMask?: boolean
  /** Blend translucent pixels against a checkerboard (true) or white (false). Default true. */
  checkerboard?: boolean
}

type Pixels = Uint8Array | Uint8ClampedArray

/** Squared YIQ distance has this maximum; `threshold` scales against it. */
const MAX_YIQ_DELTA = 35215

function isPixelData(arr: unknown): arr is Pixels {
  return ArrayBuffer.isView(arr) && (arr as Pixels).BYTES_PER_ELEMENT === 1
}

/**
 * Compare two equally-sized RGBA images. Returns the number of pixels that
 * differ perceptibly (anti-aliasing excluded unless `includeAA`), and — when
 * `output` is given — draws the diff image into it.
 */
export function pixelDiff(
  img1: Pixels,
  img2: Pixels,
  output: Pixels | null,
  width: number,
  height: number,
  options: PixelDiffOptions = {},
): number {
  const {
    threshold = 0.1,
    alpha = 0.1,
    aaColor = [255, 255, 0],
    diffColor = [255, 0, 0],
    checkerboard = true,
    includeAA = false,
    diffColorAlt,
    diffMask = false,
  } = options

  if (!isPixelData(img1) || !isPixelData(img2) || (output && !isPixelData(output))) {
    throw new Error('[Pyreon] atlas pixelDiff: image data must be a Uint8Array, Uint8ClampedArray or Buffer.')
  }
  if (img1.length !== img2.length || (output && output.length !== img1.length)) {
    throw new Error(
      `[Pyreon] atlas pixelDiff: image sizes do not match (image 1: ${img1.length} bytes, image 2: ${img2.length} bytes).`,
    )
  }
  if (img1.length !== width * height * 4) {
    throw new Error(
      `[Pyreon] atlas pixelDiff: image data is ${img1.length} bytes, expected ${width * height * 4} for ${width}x${height}.`,
    )
  }

  const len = width * height
  const a32 = new Uint32Array(img1.buffer, img1.byteOffset, len)
  const b32 = new Uint32Array(img2.buffer, img2.byteOffset, len)

  let identical = true
  for (let i = 0; i < len; i++) {
    if (a32[i] !== b32[i]) {
      identical = false
      break
    }
  }
  if (identical) {
    if (output && !diffMask) {
      for (let i = 0, pos = 0; i < len; i++, pos += 4) drawGrayPixel(img1, pos, alpha, output)
    }
    return 0
  }

  const maxDelta = MAX_YIQ_DELTA * threshold * threshold
  const [aaR, aaG, aaB] = aaColor
  const [diffR, diffG, diffB] = diffColor
  const [altR, altG, altB] = diffColorAlt ?? diffColor
  let diff = 0

  for (let i = 0, pos = 0; i < len; i++, pos += 4) {
    // Signed: negative when the img2 pixel is darker.
    const delta = a32[i] === b32[i] ? 0 : colorDelta(img1, img2, pos, pos, checkerboard)

    if (Math.abs(delta) > maxDelta) {
      const x = i % width
      const y = (i / width) | 0
      const isExcludedAA =
        !includeAA &&
        (antialiased(img1, x, y, width, height, a32, b32, checkerboard) ||
          antialiased(img2, x, y, width, height, b32, a32, checkerboard))
      if (isExcludedAA) {
        // Forgiven, and deliberately left out of a mask.
        if (output && !diffMask) drawPixel(output, pos, aaR, aaG, aaB)
      } else {
        if (output) {
          if (delta < 0) drawPixel(output, pos, altR, altG, altB)
          else drawPixel(output, pos, diffR, diffG, diffB)
        }
        diff++
      }
    } else if (output && !diffMask) {
      drawGrayPixel(img1, pos, alpha, output)
    }
  }
  return diff
}

/** Is the pixel at (x1, y1) likely part of anti-aliasing? (Vysniauskas 2009) */
function antialiased(
  img: Pixels,
  x1: number,
  y1: number,
  width: number,
  height: number,
  a32: Uint32Array,
  b32: Uint32Array,
  checkerboard: boolean,
): boolean {
  const x0 = Math.max(x1 - 1, 0)
  const y0 = Math.max(y1 - 1, 0)
  const x2 = Math.min(x1 + 1, width - 1)
  const y2 = Math.min(y1 + 1, height - 1)
  const pos4 = (y1 * width + x1) * 4
  const cr = img[pos4]!
  const cg = img[pos4 + 1]!
  const cb = img[pos4 + 2]!
  const ca = img[pos4 + 3]!
  // An edge pixel starts with one "equal sibling" so an image border never
  // reads as a slope.
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0
  let min = 0
  let max = 0
  let minX = 0
  let minY = 0
  let maxX = 0
  let maxY = 0

  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue
      const delta = brightnessDelta(img, pos4, (y * width + x) * 4, cr, cg, cb, ca, checkerboard)
      if (delta === 0) {
        zeroes++
        // Three or more identical neighbours: a flat region, not a slope.
        if (zeroes > 2) return false
      } else if (delta < min) {
        min = delta
        minX = x
        minY = y
      } else if (delta > max) {
        max = delta
        maxX = x
        maxY = y
      }
    }
  }

  // A slope needs both a darker and a brighter neighbour.
  if (min === 0 || max === 0) return false

  return (
    (hasManySiblings(a32, minX, minY, width, height) && hasManySiblings(b32, minX, minY, width, height)) ||
    (hasManySiblings(a32, maxX, maxY, width, height) && hasManySiblings(b32, maxX, maxY, width, height))
  )
}

/** Does the pixel have 3+ identical neighbours? */
function hasManySiblings(img: Uint32Array, x1: number, y1: number, width: number, height: number): boolean {
  const x0 = Math.max(x1 - 1, 0)
  const y0 = Math.max(y1 - 1, 0)
  const x2 = Math.min(x1 + 1, width - 1)
  const y2 = Math.min(y1 + 1, height - 1)
  const val = img[y1 * width + x1]
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0
  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue
      zeroes += +(val === img[y * width + x])
      if (zeroes > 2) return true
    }
  }
  return false
}

/** Background channel a translucent pixel is blended against. */
function background(k: number, checkerboard: boolean): RGB {
  if (!checkerboard) return [255, 255, 255]
  return [
    48 + 159 * (k % 2),
    48 + 159 * (((k / 1.618033988749895) | 0) % 2),
    48 + 159 * (((k / 2.618033988749895) | 0) % 2),
  ]
}

/**
 * Signed squared YIQ distance between two pixels (Kotsarenko & Ramos). The
 * caller guarantees the pixels differ. Negative when the second is darker.
 */
function colorDelta(img1: Pixels, img2: Pixels, k: number, m: number, checkerboard: boolean): number {
  const r1 = img1[k]!
  const g1 = img1[k + 1]!
  const b1 = img1[k + 2]!
  const a1 = img1[k + 3]!
  const r2 = img2[m]!
  const g2 = img2[m + 1]!
  const b2 = img2[m + 2]!
  const a2 = img2[m + 3]!

  let dr = r1 - r2
  let dg = g1 - g2
  let db = b1 - b2
  const da = a1 - a2

  if (a1 < 255 || a2 < 255) {
    const [rb, gb, bb] = background(k, checkerboard)
    dr = (r1 * a1 - r2 * a2 - rb * da) / 255
    dg = (g1 * a1 - g2 * a2 - gb * da) / 255
    db = (b1 * a1 - b2 * a2 - bb * da) / 255
  }

  const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223
  const i = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189
  const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694
  const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q
  return y > 0 ? -delta : delta
}

/** Brightness-only (Y) delta, with the centre pixel's RGBA hoisted by the caller. */
function brightnessDelta(
  img: Pixels,
  k: number,
  m: number,
  r1: number,
  g1: number,
  b1: number,
  a1: number,
  checkerboard: boolean,
): number {
  const r2 = img[m]!
  const g2 = img[m + 1]!
  const b2 = img[m + 2]!
  const a2 = img[m + 3]!

  let dr = r1 - r2
  let dg = g1 - g2
  let db = b1 - b2
  const da = a1 - a2
  if (!dr && !dg && !db && !da) return 0

  if (a1 < 255 || a2 < 255) {
    const [rb, gb, bb] = background(k, checkerboard)
    dr = (r1 * a1 - r2 * a2 - rb * da) / 255
    dg = (g1 * a1 - g2 * a2 - gb * da) / 255
    db = (b1 * a1 - b2 * a2 - bb * da) / 255
  }
  return dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223
}

function drawPixel(output: Pixels, pos: number, r: number, g: number, b: number): void {
  output[pos] = r
  output[pos + 1] = g
  output[pos + 2] = b
  output[pos + 3] = 255
}

function drawGrayPixel(img: Pixels, i: number, alpha: number, output: Pixels): void {
  const val =
    255 +
    ((img[i]! * 0.29889531 + img[i + 1]! * 0.58662247 + img[i + 2]! * 0.11448223 - 255) * alpha * img[i + 3]!) / 255
  drawPixel(output, i, val, val, val)
}
