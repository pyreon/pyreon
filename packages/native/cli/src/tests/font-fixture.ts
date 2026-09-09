import { writeFileSync } from 'node:fs'

/**
 * Build a minimal sfnt (TrueType) file carrying only a `name` table, with the
 * PostScript name (nameID 6) set to `psName`.
 *
 * This exists so the font tests do not depend on a host font. They were gated
 * on `/System/Library/Fonts/Supplemental/Trattatello.ttf` — a macOS-only
 * absolute path — while `@pyreon/native-cli`'s tests run on ubuntu, so four
 * specs, including the one the file calls "the device-critical extraction",
 * had never executed in CI. Only on a developer's Mac.
 *
 * A fixture is the right fix rather than a louder skip: the trap under test is
 * a filename that disagrees with the sfnt name table, and that is a property of
 * the BYTES, which we can write exactly.
 *
 * Layout, all big-endian:
 *   offset table   12 bytes  sfntVersion, numTables, searchRange,
 *                            entrySelector, rangeShift
 *   table record   16 bytes  tag, checksum, offset, length
 *   name table               format, count, stringOffset,
 *                            count x 12-byte records, then string storage
 *
 * The parser reads numTables at +4, walks 16-byte records from +12, and only
 * needs `name`, so a single-table font is sufficient and honest — nothing in
 * the extraction path looks at glyphs.
 */
export function writeFixtureFont(
  path: string,
  psName: string,
  platform: 'mac' | 'windows' = 'windows',
): void {
  const isMac = platform === 'mac'
  // platformID 1 (Mac) stores Mac-Roman ~ latin1; 3 (Windows) stores UTF-16BE.
  const encoded = isMac
    ? Buffer.from(psName, 'latin1')
    : Buffer.from(
        psName
          .split('')
          .flatMap((c) => [0, c.charCodeAt(0)])
          .map((b) => b),
      )

  const NAME_RECORD_COUNT = 1
  const nameHeader = Buffer.alloc(6)
  nameHeader.writeUInt16BE(0, 0) // format 0
  nameHeader.writeUInt16BE(NAME_RECORD_COUNT, 2)
  const stringOffset = 6 + NAME_RECORD_COUNT * 12
  nameHeader.writeUInt16BE(stringOffset, 4)

  const record = Buffer.alloc(12)
  record.writeUInt16BE(isMac ? 1 : 3, 0) // platformID
  record.writeUInt16BE(isMac ? 0 : 1, 2) // encodingID
  record.writeUInt16BE(0, 4) // languageID
  record.writeUInt16BE(6, 6) // nameID 6 = PostScript name
  record.writeUInt16BE(encoded.length, 8)
  record.writeUInt16BE(0, 10) // offset into string storage

  const nameTable = Buffer.concat([nameHeader, record, encoded])

  const numTables = 1
  const offsetTable = Buffer.alloc(12)
  offsetTable.writeUInt32BE(0x00010000, 0) // sfntVersion 1.0
  offsetTable.writeUInt16BE(numTables, 4)
  offsetTable.writeUInt16BE(16, 6) // searchRange
  offsetTable.writeUInt16BE(0, 8) // entrySelector
  offsetTable.writeUInt16BE(0, 10) // rangeShift

  const tableOffset = 12 + numTables * 16
  const dir = Buffer.alloc(16)
  dir.write('name', 0, 'latin1')
  dir.writeUInt32BE(0, 4) // checksum — unread by the extractor
  dir.writeUInt32BE(tableOffset, 8)
  dir.writeUInt32BE(nameTable.length, 12)

  writeFileSync(path, Buffer.concat([offsetTable, dir, nameTable]))
}
