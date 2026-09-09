// Font pipeline (asset-pipeline arc PR-1.4, 2026-06-11).
//
// The load-bearing test: readPostScriptName extracts the font's
// INTERNAL name (sfnt nameID 6), NOT the filename — a real device
// silently falls back to the system font when Font.custom is given the
// wrong name, so this is the one part that can't be eyeballed.
//
// Bisect sites: the name-record offsets in readPostScriptName (nameID@6,
// length@8, offset@10); the android-name collision throw in scanFontDir;
// the res/font sanitized copy in materializeAndroidFonts.

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { writeFixtureFont } from './font-fixture'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  materializeAndroidFonts,
  materializeIosFonts,
  parseFontFilename,
  readPostScriptName,
  sanitizeFontResourceName,
  scanFontDir,
} from '../fonts'

let dir = ''
let out = ''

// A renamed TTF: the filename says "Brand", the sfnt name table says its real
// PostScript name — the exact trap the extraction must clear.
//
// SYNTHESIZED, not borrowed from the host. This was gated on
// `/System/Library/Fonts/Supplemental/Trattatello.ttf`, a macOS-only absolute
// path, while this package's tests run on ubuntu — so four specs, including
// the one this file calls "the device-critical extraction", had never executed
// in CI. Only on a developer's Mac, which is the least useful place for them.
//
// A fixture is the right answer rather than a louder skip: the trap is a
// filename that disagrees with the name table, and that is a property of the
// BYTES, which `writeFixtureFont` writes exactly. Both platform encodings are
// covered — Windows/UTF-16BE and Mac-Roman — which the borrowed font could not
// do either.
const FIXTURE_PS_NAME = 'Trattatello'
const putFont = (target: string, ps = FIXTURE_PS_NAME): void => writeFixtureFont(target, ps)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-fonts-'))
  out = mkdtempSync(join(tmpdir(), 'pyreon-fonts-out-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
})

describe('parseFontFilename', () => {
  it('accepts ttf/otf, rejects others', () => {
    expect(parseFontFilename('Inter.ttf')).toEqual({ name: 'Inter', ext: 'ttf' })
    expect(parseFontFilename('Inter.otf')).toEqual({ name: 'Inter', ext: 'otf' })
    expect(parseFontFilename('logo.png')).toBeNull()
  })
})

describe('sanitizeFontResourceName', () => {
  it('android resource rules', () => {
    expect(sanitizeFontResourceName('Inter-Bold')).toBe('inter_bold')
    expect(sanitizeFontResourceName('Brand')).toBe('brand')
  })
})

describe('readPostScriptName — the device-critical extraction', () => {
  it('reads the sfnt PostScript name, NOT the filename (rename trap)', () => {
    putFont(join(dir, 'Brand.ttf'))
    // Filename is "Brand"; the embedded PostScript name is the font's
    // real internal name — they MUST differ for this test to mean
    // anything, and the extraction must return the internal one.
    const ps = readPostScriptName(join(dir, 'Brand.ttf'))
    expect(ps).not.toBe('Brand')
    expect(ps.length).toBeGreaterThan(0)
    // Trattatello's PostScript name is "Trattatello".
    expect(ps).toBe('Trattatello')
  })

  it('reads a Mac-Roman name record too', () => {
    writeFixtureFont(join(dir, 'Brand.ttf'), 'MacRomanName', 'mac')
    expect(readPostScriptName(join(dir, 'Brand.ttf'))).toBe('MacRomanName')
  })

  it('falls back to the basename on a non-font / unreadable file', () => {
    writeFileSync(join(dir, 'Bogus.ttf'), 'not a real font')
    expect(readPostScriptName(join(dir, 'Bogus.ttf'))).toBe('Bogus')
  })
})

describe('scanFontDir + materializers', () => {
  it('scan carries the PostScript name through', () => {
    putFont(join(dir, 'Brand.ttf'))
    const fonts = scanFontDir(dir)
    expect(fonts.length).toBe(1)
    expect(fonts[0]!.name).toBe('Brand')
    expect(fonts[0]!.androidName).toBe('brand')
    expect(fonts[0]!.postScriptName).toBe('Trattatello')
  })

  it('iOS: copies the font + a manifest with the PostScript name', () => {
    putFont(join(dir, 'Brand.ttf'))
    const r = materializeIosFonts(scanFontDir(dir), out)
    expect(r.fonts).toBe(1)
    expect(readdirSync(join(out, 'fonts')).sort()).toEqual(['Brand.ttf', '_pyreon-fonts.json'])
    const manifest = JSON.parse(readFileSync(join(out, 'fonts', '_pyreon-fonts.json'), 'utf8'))
    expect(manifest.fonts[0]).toEqual({
      name: 'Brand',
      filename: 'Brand.ttf',
      postScriptName: 'Trattatello',
    })
  })

  it('Android: copies to res/font with the sanitized name', () => {
    putFont(join(dir, 'Brand.ttf'))
    const r = materializeAndroidFonts(scanFontDir(dir), out)
    expect(r.fonts).toBe(1)
    expect(readdirSync(join(out, 'res', 'font'))).toEqual(['brand.ttf'])
  })

  it('android-name collisions abort loudly', () => {
    writeFileSync(join(dir, 'My-Font.ttf'), 'x')
    writeFileSync(join(dir, 'My_Font.ttf'), 'x')
    expect(() => scanFontDir(dir)).toThrow(/collision/i)
  })
})
