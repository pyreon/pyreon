// Font pipeline (asset-pipeline arc PR-1.4, 2026-06-11) — materialize a
// shared `fonts/` directory of `.ttf`/`.otf` files into each platform's
// custom-font registration:
//
//   iOS     → copy into the bundle group + an `_pyreon-fonts.json`
//             manifest (filenames + PostScript names) the host injects
//             into Info.plist `UIAppFonts`. `Font.custom(...)` needs the
//             font's POSTSCRIPT NAME (from the sfnt `name` table), NOT
//             the filename — `<Text font="…">` emits that name.
//   Android → copy into `res/font/` with resource-rule-sanitized names;
//             `FontFamily(Font(pyreonFont("name")))` resolves by name.
//
// The PostScript-name extraction is the load-bearing iOS bit: a bundled
// font whose `Font.custom` argument is the FILENAME (the naïve choice)
// silently falls back to the system font on-device — invisible until a
// real device renders it. We read the name table with no deps (the
// sfnt format is fixed-layout) so the emit's `Font.custom(<postscript>)`
// always matches what iOS registered.

import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const FONT_EXTS = new Set(['ttf', 'otf'])

export interface FontEntry {
  /** Canonical name — basename sans extension (the `<Text font="…">` key on Android). */
  name: string
  /** Android resource name (lowercase, [a-z0-9_], no leading digit). */
  androidName: string
  /** Original filename (e.g. `Inter-Bold.ttf`). */
  filename: string
  /** PostScript name from the sfnt `name` table — the iOS `Font.custom` key. */
  postScriptName: string
  /** Absolute source path. */
  file: string
}

/** Mirror of the asset materializer's sanitizer (Android resource rules). */
export function sanitizeFontResourceName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
}

/**
 * Read the PostScript name (nameID 6) from an sfnt (TTF/OTF) `name`
 * table — no dependencies; the format is fixed big-endian layout.
 * Falls back to the basename when the table is absent/unreadable (a
 * broken font is the user's problem, but we don't crash the build).
 */
export function readPostScriptName(file: string): string {
  const fallback = basename(file).replace(/\.[^.]+$/, '')
  try {
    const d = readFileSync(file)
    const numTables = d.readUInt16BE(4)
    let off = 12
    for (let i = 0; i < numTables; i++) {
      const tag = d.toString('latin1', off, off + 4)
      const tableOff = d.readUInt32BE(off + 8)
      if (tag === 'name') {
        const count = d.readUInt16BE(tableOff + 2)
        const stringOffset = d.readUInt16BE(tableOff + 4)
        for (let j = 0; j < count; j++) {
          // sfnt name record (12 bytes): platformID@0, encodingID@2,
          // languageID@4, nameID@6, length@8, offset@10.
          const rec = tableOff + 6 + j * 12
          const platformId = d.readUInt16BE(rec)
          const nameId = d.readUInt16BE(rec + 6)
          const len = d.readUInt16BE(rec + 8)
          const strOff = d.readUInt16BE(rec + 10)
          if (nameId === 6) {
            const start = tableOff + stringOffset + strOff
            const raw = d.subarray(start, start + len)
            // platformId 3 (Windows) / 0 (Unicode) store the name as
            // UTF-16BE (Node has no 'utf16be' encoding — decode by hand);
            // platformId 1 (Mac) is Mac-Roman ≈ latin1 for the ASCII
            // PostScript names this field always holds.
            const ps =
              platformId === 3 || platformId === 0
                ? utf16beDecode(raw)
                : raw.toString('latin1')
            if (ps.length > 0) return ps
          }
        }
      }
      off += 16
    }
  } catch {
    // fall through to basename
  }
  return fallback
}

function utf16beDecode(buf: Buffer): string {
  let s = ''
  for (let i = 0; i + 1 < buf.length; i += 2) {
    s += String.fromCharCode((buf[i]! << 8) | buf[i + 1]!)
  }
  return s
}

export function parseFontFilename(
  filename: string,
): { name: string; ext: string } | null {
  const m = /^(.+)\.([A-Za-z0-9]+)$/.exec(filename)
  if (!m) return null
  const ext = m[2]!.toLowerCase()
  if (!FONT_EXTS.has(ext)) return null
  return { name: m[1]!, ext }
}

/** Scan a fonts directory into entries (throws on android-name collisions). */
export function scanFontDir(dir: string): FontEntry[] {
  const entries: FontEntry[] = []
  const byAndroid = new Map<string, string>()
  for (const filename of readdirSync(dir).sort()) {
    const full = join(dir, filename)
    if (!statSync(full).isFile()) continue
    const parsed = parseFontFilename(filename)
    if (!parsed) continue
    const androidName = sanitizeFontResourceName(parsed.name)
    const owner = byAndroid.get(androidName)
    if (owner !== undefined && owner !== parsed.name) {
      throw new Error(
        `[Pyreon] Font name collision: '${parsed.name}' and '${owner}' both sanitize to '${androidName}'. Rename one.`,
      )
    }
    byAndroid.set(androidName, parsed.name)
    entries.push({
      name: parsed.name,
      androidName,
      filename,
      postScriptName: readPostScriptName(full),
      file: full,
    })
  }
  return entries
}

export interface FontMaterializeResult {
  fonts: number
}

/**
 * iOS: copy the fonts into `<out>/fonts/` and write a
 * `_pyreon-fonts.json` manifest (filename + postScriptName). XcodeGen
 * picks up the `fonts/` group; the build (or a one-time setup) adds the
 * filenames to `UIAppFonts`. The manifest's postScriptName is what the
 * `<Text font="…">` emit references.
 */
export function materializeIosFonts(fonts: FontEntry[], outDir: string): FontMaterializeResult {
  const fontsDir = join(outDir, 'fonts')
  mkdirSync(fontsDir, { recursive: true })
  for (const f of fonts) {
    copyFileSync(f.file, join(fontsDir, f.filename))
  }
  writeFileSync(
    join(fontsDir, '_pyreon-fonts.json'),
    JSON.stringify(
      {
        fonts: fonts.map((f) => ({
          name: f.name,
          filename: f.filename,
          postScriptName: f.postScriptName,
        })),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )
  return { fonts: fonts.length }
}

/** Android: copy into `<out>/res/font/` with sanitized names. */
export function materializeAndroidFonts(
  fonts: FontEntry[],
  outDir: string,
): FontMaterializeResult {
  const fontDir = join(outDir, 'res', 'font')
  mkdirSync(fontDir, { recursive: true })
  for (const f of fonts) {
    const ext = f.filename.replace(/^.+\./, '')
    copyFileSync(f.file, join(fontDir, `${f.androidName}.${ext}`))
  }
  return { fonts: fonts.length }
}

/** Web: copy into `<out>/fonts/` (the host's CSS @font-face references them). */
export function materializeWebFonts(fonts: FontEntry[], outDir: string): FontMaterializeResult {
  const fontDir = join(outDir, 'fonts')
  mkdirSync(fontDir, { recursive: true })
  for (const f of fonts) {
    copyFileSync(f.file, join(fontDir, f.filename))
  }
  return { fonts: fonts.length }
}
