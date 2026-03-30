import { describe, expect, it } from 'vitest'
import { parseJpegDimensions, parseWebPDimensions } from '../image-plugin'

describe('parseJpegDimensions', () => {
  function makeJpeg(width: number, height: number): Buffer {
    // Minimal JPEG: SOI + SOF0 marker with dimensions
    // Layout: [0-1] SOI, [2-3] SOF0 marker, [4-5] segment length,
    //         [6] precision, [7-8] height, [9-10] width, [11] components
    const buf = Buffer.alloc(12)
    buf[0] = 0xff // SOI
    buf[1] = 0xd8
    buf[2] = 0xff // SOF0 marker
    buf[3] = 0xc0
    buf.writeUInt16BE(9, 4) // segment length (includes itself)
    buf[6] = 8 // precision
    buf.writeUInt16BE(height, 7) // height at marker_offset + 5
    buf.writeUInt16BE(width, 9) // width at marker_offset + 7
    buf[11] = 3 // components
    return buf
  }

  it('parses dimensions from SOF0 marker', () => {
    const result = parseJpegDimensions(makeJpeg(1920, 1080))
    expect(result).toEqual({ width: 1920, height: 1080 })
  })

  it('parses small dimensions', () => {
    const result = parseJpegDimensions(makeJpeg(1, 1))
    expect(result).toEqual({ width: 1, height: 1 })
  })

  it('parses square dimensions', () => {
    const result = parseJpegDimensions(makeJpeg(500, 500))
    expect(result).toEqual({ width: 500, height: 500 })
  })

  it('returns 0x0 for empty buffer', () => {
    const result = parseJpegDimensions(Buffer.alloc(0))
    expect(result).toEqual({ width: 0, height: 0 })
  })

  it('returns 0x0 for buffer without SOF marker', () => {
    const buf = Buffer.alloc(10, 0)
    const result = parseJpegDimensions(buf)
    expect(result).toEqual({ width: 0, height: 0 })
  })
})

describe('parseWebPDimensions', () => {
  function makeWebPLossy(width: number, height: number): Buffer {
    // RIFF + WEBP + VP8 header with dimensions
    const buf = Buffer.alloc(30, 0)
    buf.write('RIFF', 0, 'ascii')
    buf.writeUInt32LE(22, 4) // file size
    buf.write('WEBP', 8, 'ascii')
    buf.write('VP8 ', 12, 'ascii') // lossy
    buf.writeUInt32LE(10, 16) // chunk size
    // VP8 bitstream: signature at 23-25, then dimensions
    buf[23] = 0x9d
    buf[24] = 0x01
    buf[25] = 0x2a
    buf.writeUInt16LE(width & 0x3fff, 26)
    buf.writeUInt16LE(height & 0x3fff, 28)
    return buf
  }

  function makeWebPLossless(width: number, height: number): Buffer {
    // RIFF + WEBP + VP8L header with dimensions
    const buf = Buffer.alloc(25, 0)
    buf.write('RIFF', 0, 'ascii')
    buf.writeUInt32LE(17, 4)
    buf.write('WEBP', 8, 'ascii')
    buf.write('VP8L', 12, 'ascii')
    buf.writeUInt32LE(5, 16) // chunk size
    buf[20] = 0x2f // signature
    // Dimensions packed: 14 bits width-1, 14 bits height-1
    const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14)
    buf.writeUInt32LE(bits, 21)
    return buf
  }

  function makeWebPExtended(width: number, height: number): Buffer {
    // RIFF + WEBP + VP8X header with dimensions
    const buf = Buffer.alloc(30, 0)
    buf.write('RIFF', 0, 'ascii')
    buf.writeUInt32LE(22, 4)
    buf.write('WEBP', 8, 'ascii')
    buf.write('VP8X', 12, 'ascii')
    buf.writeUInt32LE(10, 16) // chunk size
    buf.writeUInt32LE(0, 20) // flags
    // Canvas width-1 at bytes 24-26 (3 bytes LE)
    const w = width - 1
    buf[24] = w & 0xff
    buf[25] = (w >> 8) & 0xff
    buf[26] = (w >> 16) & 0xff
    // Canvas height-1 at bytes 27-29 (3 bytes LE)
    const h = height - 1
    buf[27] = h & 0xff
    buf[28] = (h >> 8) & 0xff
    buf[29] = (h >> 16) & 0xff
    return buf
  }

  it('parses lossy VP8 dimensions', () => {
    const result = parseWebPDimensions(makeWebPLossy(640, 480))
    expect(result).toEqual({ width: 640, height: 480 })
  })

  it('parses lossless VP8L dimensions', () => {
    const result = parseWebPDimensions(makeWebPLossless(1024, 768))
    expect(result).toEqual({ width: 1024, height: 768 })
  })

  it('parses extended VP8X dimensions', () => {
    const result = parseWebPDimensions(makeWebPExtended(1920, 1080))
    expect(result).toEqual({ width: 1920, height: 1080 })
  })

  it('returns 0x0 for unknown chunk type', () => {
    const buf = Buffer.alloc(20, 0)
    buf.write('RIFF', 0, 'ascii')
    buf.write('WEBP', 8, 'ascii')
    buf.write('XXXX', 12, 'ascii')
    const result = parseWebPDimensions(buf)
    expect(result).toEqual({ width: 0, height: 0 })
  })
})
