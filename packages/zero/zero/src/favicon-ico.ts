// ─── favicon-ico.ts ────────────────────────────────────────────────────────
//
// Internal: packs PNG renditions into a multi-size `.ico`. Split out of the
// public entry `favicon.ts`, which imports from here, so these helpers are
// not public API; their unit tests reach them through
// `@pyreon/zero/internal-server`.

import type { IcoEntry } from './favicon'

/** @internal Exported for testing */
export function createIcoFromPngs(entries: IcoEntry[]): Uint8Array {
  const headerSize = 6
  const dirEntrySize = 16
  const dirSize = dirEntrySize * entries.length
  let dataOffset = headerSize + dirSize

  // ICO header
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)              // reserved
  header.writeUInt16LE(1, 2)              // type: icon
  header.writeUInt16LE(entries.length, 4) // count

  // Directory entries
  const dirEntries = Buffer.alloc(dirSize)
  const dataBuffers: Buffer[] = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const offset = i * dirEntrySize
    dirEntries.writeUInt8(entry.size === 256 ? 0 : entry.size, offset)     // width
    dirEntries.writeUInt8(entry.size === 256 ? 0 : entry.size, offset + 1) // height
    dirEntries.writeUInt8(0, offset + 2)                                    // palette
    dirEntries.writeUInt8(0, offset + 3)                                    // reserved
    dirEntries.writeUInt16LE(1, offset + 4)                                 // color planes
    dirEntries.writeUInt16LE(32, offset + 6)                                // bits per pixel
    dirEntries.writeUInt32LE(entry.buffer.length, offset + 8)               // size
    dirEntries.writeUInt32LE(dataOffset, offset + 12)                       // offset

    dataOffset += entry.buffer.length
    dataBuffers.push(entry.buffer)
  }

  return Buffer.concat([header, dirEntries, ...dataBuffers])
}
