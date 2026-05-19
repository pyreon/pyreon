#!/usr/bin/env bun
/**
 * Generates PNG icons for the Chrome extension.
 * Uses a minimal PNG encoder (no dependencies) to create
 * a simple "P" logo on a rounded-corner-style background.
 *
 * Run: bun run scripts/generate-icons.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

// --- Minimal PNG encoder ---

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ crcTable[(c ^ buf[i]!) & 0xff]!
  }
  return (c ^ 0xffffffff) >>> 0
}

const crcTable: number[] = []
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[n] = c
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length
  const buf = new Uint8Array(12 + len)
  const view = new DataView(buf.buffer)

  view.setUint32(0, len)
  buf[4] = type.charCodeAt(0)
  buf[5] = type.charCodeAt(1)
  buf[6] = type.charCodeAt(2)
  buf[7] = type.charCodeAt(3)
  buf.set(data, 8)

  const crcData = new Uint8Array(4 + len)
  crcData.set(buf.subarray(4, 8 + len))
  view.setUint32(8 + len, crc32(crcData))

  return buf
}

function encodePNG(width: number, height: number, rgba: Uint8Array): Buffer {
  // IHDR
  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  ihdrView.setUint32(0, width)
  ihdrView.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  // IDAT — filter type 0 (none) for each row
  const rawRows = new Uint8Array(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    rawRows[y * (1 + width * 4)] = 0 // filter: none
    rawRows.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      y * (1 + width * 4) + 1,
    )
  }
  const compressed = deflateSync(Buffer.from(rawRows))

  // Assemble
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdrChunk = pngChunk('IHDR', ihdr)
  const idatChunk = pngChunk('IDAT', new Uint8Array(compressed))
  const iendChunk = pngChunk('IEND', new Uint8Array(0))

  const png = Buffer.alloc(
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length,
  )
  let offset = 0
  png.set(signature, offset)
  offset += signature.length
  png.set(ihdrChunk, offset)
  offset += ihdrChunk.length
  png.set(idatChunk, offset)
  offset += idatChunk.length
  png.set(iendChunk, offset)

  return png
}

// --- Icon rendering ---

function renderIcon(size: number): Uint8Array {
  const rgba = new Uint8Array(size * size * 4)

  // Pyreon brand identity: ember-core signal mark on the ink canvas.
  const bg = { r: 10, g: 10, b: 14 } // #0A0A0E — ink-1 (base canvas)
  const fg = { r: 255, g: 94, b: 26 } // #FF5E1A — ember-core (signal)

  const radius = Math.floor(size * 0.2)

  function inRoundedRect(x: number, y: number): boolean {
    if (x < radius && y < radius) {
      return (x - radius) ** 2 + (y - radius) ** 2 <= radius ** 2
    }
    if (x >= size - radius && y < radius) {
      return (x - (size - radius - 1)) ** 2 + (y - radius) ** 2 <= radius ** 2
    }
    if (x < radius && y >= size - radius) {
      return (x - radius) ** 2 + (y - (size - radius - 1)) ** 2 <= radius ** 2
    }
    if (x >= size - radius && y >= size - radius) {
      return (
        (x - (size - radius - 1)) ** 2 + (y - (size - radius - 1)) ** 2 <=
        radius ** 2
      )
    }
    return true
  }

  // Draw "P" letter — simple bitmap approach
  // P is drawn in a box from ~25% to ~75% of size
  const letterLeft = Math.floor(size * 0.3)
  const letterRight = Math.floor(size * 0.72)
  const letterTop = Math.floor(size * 0.18)
  const letterBottom = Math.floor(size * 0.82)
  const stroke = Math.max(2, Math.floor(size * 0.14))
  const midY = Math.floor((letterTop + letterBottom) * 0.5)

  function inLetterP(x: number, y: number): boolean {
    // Vertical bar (left side)
    if (
      x >= letterLeft &&
      x < letterLeft + stroke &&
      y >= letterTop &&
      y < letterBottom
    ) {
      return true
    }

    // Top horizontal bar
    if (
      y >= letterTop &&
      y < letterTop + stroke &&
      x >= letterLeft &&
      x < letterRight
    ) {
      return true
    }

    // Middle horizontal bar
    if (y >= midY && y < midY + stroke && x >= letterLeft && x < letterRight) {
      return true
    }

    // Right vertical bar (top half only — the bump of the P)
    if (
      x >= letterRight - stroke &&
      x < letterRight &&
      y >= letterTop &&
      y < midY + stroke
    ) {
      return true
    }

    return false
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4

      if (!inRoundedRect(x, y)) {
        rgba[i] = 0
        rgba[i + 1] = 0
        rgba[i + 2] = 0
        rgba[i + 3] = 0
        continue
      }

      if (inLetterP(x, y)) {
        rgba[i] = fg.r
        rgba[i + 1] = fg.g
        rgba[i + 2] = fg.b
        rgba[i + 3] = 255
      } else {
        rgba[i] = bg.r
        rgba[i + 1] = bg.g
        rgba[i + 2] = bg.b
        rgba[i + 3] = 255
      }
    }
  }

  return rgba
}

// --- Generate all sizes ---

const sizes = [16, 32, 48, 128]

mkdirSync('icons', { recursive: true })

for (const size of sizes) {
  const rgba = renderIcon(size)
  const png = encodePNG(size, size, rgba)
  const path = `icons/pyreon-${size}.png`
  writeFileSync(path, png)
  console.log(`  + ${path} (${png.length} bytes)`)
}

console.log('\nDone.')
