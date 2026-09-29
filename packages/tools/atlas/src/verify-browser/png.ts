/**
 * A PNG codec scoped to what `atlas verify-browser` actually handles.
 *
 * Every image atlas reads is a Playwright/Chromium element screenshot, and
 * Chromium emits exactly two shapes: 8-bit truecolor (colour type 2) for an
 * opaque capture and 8-bit truecolor + alpha (colour type 6) when the
 * background is omitted. Both are non-interlaced. This decoder covers those,
 * plus the two 8-bit greyscale types (0 and 4), which cost one branch each —
 * and REFUSES everything else with a message naming the shape, rather than
 * decoding it approximately.
 *
 * The refusal is deliberate. The realistic way an unsupported PNG reaches
 * atlas is a committed baseline that an image optimizer re-encoded (palette,
 * 1/2/4-bit, 16-bit, Adam7). Decoding that "close enough" would compare
 * pixels that are not the ones Chromium rendered; failing with the cause lets
 * the user re-record the baseline instead.
 *
 * Integrity is checked, not assumed: the signature, every chunk's CRC-32 (the
 * ancillary ones included), IHDR's fixed fields, the filter byte of every
 * scanline, and that the inflated stream is exactly one image's worth of
 * bytes. A truncated or bit-flipped baseline therefore fails loudly instead of
 * diffing as a mostly-black image.
 *
 * The output shape (`{ width, height, data }`, `data` = RGBA, 8 bits per
 * channel, opaque types padded with alpha 255, greyscale replicated into
 * R/G/B) is the one `pngjs`'s `PNG.sync.read` produced, which is what the
 * diff was written against.
 */
import { deflateSync, inflateSync } from 'node:zlib'

export interface DecodedPng {
  width: number
  height: number
  /** RGBA, 8 bits per channel, row-major, `width * height * 4` bytes. */
  data: Buffer
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Channels per pixel for each supported 8-bit colour type. */
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 }

const COLOR_TYPE_NAMES: Readonly<Record<number, string>> = {
  0: 'greyscale',
  2: 'truecolor',
  3: 'palette',
  4: 'greyscale + alpha',
  6: 'truecolor + alpha',
}

let crcTable: Uint32Array | null = null

/** CRC-32 (ISO 3309 / ITU-T V.42), the checksum PNG chunks carry. */
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  if (crcTable === null) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = start; i < end; i++) c = crcTable[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function fail(message: string): never {
  throw new Error(`[Pyreon] atlas: cannot read PNG — ${message}`)
}

/** Decode a PNG into 8-bit RGBA. Throws a `[Pyreon]` error for anything unsupported or corrupt. */
export function decodePng(buf: Uint8Array): DecodedPng {
  if (buf.length < SIGNATURE.length + 12 || !SIGNATURE.equals(Buffer.from(buf.subarray(0, 8)))) {
    fail('not a PNG file (bad signature)')
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let pos = 8
  let width = 0
  let height = 0
  let colorType = -1
  let sawHeader = false
  let sawEnd = false
  const idat: Uint8Array[] = []

  while (pos < buf.length) {
    if (pos + 12 > buf.length) fail('truncated chunk header')
    const length = view.getUint32(pos)
    const typeStart = pos + 4
    const dataStart = pos + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > buf.length) fail('truncated chunk data')
    const type = String.fromCharCode(buf[typeStart]!, buf[typeStart + 1]!, buf[typeStart + 2]!, buf[typeStart + 3]!)
    if (crc32(buf, typeStart, dataEnd) !== view.getUint32(dataEnd)) {
      fail(`CRC mismatch in the ${type} chunk (the file is corrupt)`)
    }

    if (!sawHeader && type !== 'IHDR') fail('the first chunk is not IHDR')
    if (type === 'IHDR') {
      if (sawHeader) fail('more than one IHDR chunk')
      if (length !== 13) fail('IHDR has the wrong length')
      width = view.getUint32(dataStart)
      height = view.getUint32(dataStart + 4)
      const bitDepth = buf[dataStart + 8]!
      colorType = buf[dataStart + 9]!
      const compression = buf[dataStart + 10]!
      const filter = buf[dataStart + 11]!
      const interlace = buf[dataStart + 12]!
      if (width === 0 || height === 0) fail(`zero-sized image (${width}x${height})`)
      if (compression !== 0 || filter !== 0) fail('unknown compression or filter method')
      if (CHANNELS[colorType] === undefined || bitDepth !== 8) {
        fail(
          `${bitDepth}-bit ${COLOR_TYPE_NAMES[colorType] ?? `colour type ${colorType}`} is not a shape Chromium screenshots produce (8-bit truecolor, optionally with alpha). ` +
            'A baseline re-encoded by an image optimizer is the usual cause — delete it and re-record with `atlas verify-browser --update-snapshots`.',
        )
      }
      if (interlace !== 0) {
        fail('interlaced (Adam7) PNGs are not supported — Chromium never writes them; re-record the baseline.')
      }
      sawHeader = true
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(dataStart, dataEnd))
    } else if (type === 'IEND') {
      sawEnd = true
      break
    } else if ((buf[typeStart]! & 0x20) === 0) {
      // Bit 5 of the first type byte clear = CRITICAL chunk. A decoder that
      // does not understand one must not render the image (PNG spec §5.4).
      fail(`unsupported critical chunk ${type}`)
    }
    pos = dataEnd + 4
  }
  if (!sawEnd) fail('missing IEND chunk (the file is truncated)')
  if (idat.length === 0) fail('no IDAT chunk')

  const channels = CHANNELS[colorType]!
  const stride = width * channels
  let raw: Buffer
  try {
    raw = inflateSync(Buffer.concat(idat))
  } catch (err) {
    fail(`image data does not inflate (${err instanceof Error ? err.message : String(err)})`)
  }
  if (raw.length !== (stride + 1) * height) {
    fail(`image data is ${raw.length} bytes, expected ${(stride + 1) * height}`)
  }

  const out = Buffer.alloc(width * height * 4)
  let prev = new Uint8Array(stride)
  let cur = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1)
    const filterType = raw[rowStart]!
    unfilter(filterType, raw, rowStart + 1, cur, prev, stride, channels, y)
    const o = y * width * 4
    for (let x = 0; x < width; x++) {
      const s = x * channels
      const d = o + x * 4
      if (channels >= 3) {
        out[d] = cur[s]!
        out[d + 1] = cur[s + 1]!
        out[d + 2] = cur[s + 2]!
        out[d + 3] = channels === 4 ? cur[s + 3]! : 255
      } else {
        const v = cur[s]!
        out[d] = v
        out[d + 1] = v
        out[d + 2] = v
        out[d + 3] = channels === 2 ? cur[s + 1]! : 255
      }
    }
    const swap = prev
    prev = cur
    cur = swap
  }
  return { width, height, data: out }
}

/**
 * Reverse one scanline's filter (PNG spec §9). `prev` is the previous
 * reconstructed row — all zeroes for the first row, which is exactly the
 * spec's "treat the row above as zero" rule.
 */
function unfilter(
  type: number,
  raw: Uint8Array,
  offset: number,
  cur: Uint8Array,
  prev: Uint8Array,
  stride: number,
  bpp: number,
  row: number,
): void {
  switch (type) {
    case 0:
      for (let i = 0; i < stride; i++) cur[i] = raw[offset + i]!
      return
    case 1:
      for (let i = 0; i < stride; i++) {
        cur[i] = (raw[offset + i]! + (i >= bpp ? cur[i - bpp]! : 0)) & 0xff
      }
      return
    case 2:
      for (let i = 0; i < stride; i++) cur[i] = (raw[offset + i]! + prev[i]!) & 0xff
      return
    case 3:
      for (let i = 0; i < stride; i++) {
        const left = i >= bpp ? cur[i - bpp]! : 0
        cur[i] = (raw[offset + i]! + ((left + prev[i]!) >> 1)) & 0xff
      }
      return
    case 4:
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp]! : 0
        const b = prev[i]!
        const c = i >= bpp ? prev[i - bpp]! : 0
        cur[i] = (raw[offset + i]! + paeth(a, b, c)) & 0xff
      }
      return
    default:
      fail(`unknown filter type ${type} on row ${row}`)
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  out.set(data, 8)
  out.writeUInt32BE(crc32(out, 4, 8 + data.length), 8 + data.length)
  return out
}

/**
 * Encode 8-bit RGBA as a PNG (colour type 6, filter 0 on every row).
 *
 * Only atlas's own artifacts go through this — the diff image written beside
 * a failing snapshot — so size is not a concern and the simplest valid
 * encoding is the right one: no per-row filter heuristics to get wrong.
 */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) {
    throw new Error(`[Pyreon] atlas: encodePng got ${rgba.length} bytes for a ${width}x${height} RGBA image`)
  }
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    // raw[y * (stride + 1)] stays 0 = filter type None.
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: truecolor + alpha
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ])
}
