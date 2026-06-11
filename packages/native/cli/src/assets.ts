// Asset pipeline (asset-pipeline arc, 2026-06-11) — materialize the
// shared `assets/` directory into each platform's bundled-image format:
//
//   iOS     → `Assets.xcassets/<name>.imageset/` (Contents.json + files;
//             XcodeGen picks up any xcassets inside an included group)
//   Android → `res/drawable*` (density buckets from @2x/@3x suffixes;
//             names sanitized to Android resource rules)
//   Web     → a plain copy under `public/assets/` (the web `<Image>`
//             primitive prefixes bare names with `/assets/`)
//
// Naming contract (shared with the PMTC `<Image src>` emit and the
// runtime-kotlin `pyreonDrawable` lookup): the asset NAME is the
// basename sans scale-suffix sans extension. `logo.png` + `logo@2x.png`
// + `logo@3x.png` form ONE asset named `logo`.
//
// Collision discipline (the M1.4 doctrine — never silently dedupe):
// two assets whose ANDROID-sanitized names collide (`my-logo.png` vs
// `my_logo.png`) abort the build loudly.

import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  materializeAndroidFonts,
  materializeIosFonts,
  materializeWebFonts,
  scanFontDir,
} from './fonts'

export interface AssetVariant {
  /** 1 | 2 | 3 — from the @2x/@3x filename suffix (1 when bare). */
  scale: 1 | 2 | 3
  /** Absolute path of the source file. */
  file: string
  /** Lowercased extension without the dot (`png`, `jpg`, …). */
  ext: string
}

export interface AssetGroup {
  /** Canonical name — basename sans scale-suffix sans extension. */
  name: string
  /** Android resource name (lowercase, [a-z0-9_], no leading digit). */
  androidName: string
  variants: AssetVariant[]
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

/**
 * Android resource-name rules. MUST stay in lockstep with
 * runtime-kotlin's `sanitizeResourceName` (PyreonAssets.kt) — the
 * emitted `pyreonDrawable(name)` lookup and this materializer are the
 * two halves of one contract.
 */
export function sanitizeAndroidName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
}

/** Parse `logo@2x.png` → { name: 'logo', scale: 2, ext: 'png' }. */
export function parseAssetFilename(
  filename: string,
): { name: string; scale: 1 | 2 | 3; ext: string } | null {
  const m = /^(.+?)(?:@([23])x)?\.([A-Za-z0-9]+)$/.exec(filename)
  if (!m) return null
  const ext = m[3]!.toLowerCase()
  if (!IMAGE_EXTS.has(ext)) return null
  return {
    name: m[1]!,
    scale: (m[2] !== undefined ? Number(m[2]) : 1) as 1 | 2 | 3,
    ext,
  }
}

/**
 * Scan an assets directory (flat, v1) into asset groups. Throws on
 * Android-name collisions and on duplicate scale variants.
 */
export function scanAssetDir(dir: string): AssetGroup[] {
  const groups = new Map<string, AssetGroup>()
  const byAndroidName = new Map<string, string>()
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (!statSync(full).isFile()) continue
    const parsed = parseAssetFilename(entry)
    if (!parsed) continue
    let group = groups.get(parsed.name)
    if (!group) {
      const androidName = sanitizeAndroidName(parsed.name)
      const owner = byAndroidName.get(androidName)
      if (owner !== undefined && owner !== parsed.name) {
        throw new Error(
          `[Pyreon] Asset name collision: '${parsed.name}' and '${owner}' both sanitize to Android resource '${androidName}'. Rename one.`,
        )
      }
      byAndroidName.set(androidName, parsed.name)
      group = { name: parsed.name, androidName, variants: [] }
      groups.set(parsed.name, group)
    }
    if (group.variants.some((v) => v.scale === parsed.scale)) {
      throw new Error(
        `[Pyreon] Asset '${parsed.name}' has two @${parsed.scale}x variants — one file per scale.`,
      )
    }
    group.variants.push({ scale: parsed.scale, file: full, ext: parsed.ext })
  }
  return [...groups.values()]
}

/** The Contents.json an imageset needs — universal idiom, per-scale. */
export function buildImagesetContents(group: AssetGroup): string {
  const images = [1, 2, 3].map((scale) => {
    const variant = group.variants.find((v) => v.scale === scale)
    const entry: Record<string, string> = {
      idiom: 'universal',
      scale: `${scale}x`,
    }
    if (variant) {
      entry.filename = imagesetFilename(group, variant)
    }
    return entry
  })
  return JSON.stringify({ images, info: { version: 1, author: 'xcode' } }, null, 2) + '\n'
}

function imagesetFilename(group: AssetGroup, v: AssetVariant): string {
  return v.scale === 1 ? `${group.name}.${v.ext}` : `${group.name}@${v.scale}x.${v.ext}`
}

/** Density bucket per scale — the standard 1x/2x/3x mapping. */
const ANDROID_BUCKET: Record<number, string> = {
  1: 'drawable-mdpi',
  2: 'drawable-xhdpi',
  3: 'drawable-xxhdpi',
}

export interface MaterializeResult {
  assets: number
  files: number
}

/**
 * iOS: write `<out>/Assets.xcassets` (catalog root + per-asset
 * imagesets + an AppIcon.appiconset).
 *
 * The AppIcon set is ALWAYS emitted: once a project carries ANY asset
 * catalog, actool enforces the target's
 * `ASSETCATALOG_COMPILER_APPICON_NAME` (default `AppIcon`) and FAILS
 * the build when no catalog contains it — a projectless-catalog trap
 * found by the first real `xcodebuild test` of this pipeline. An
 * `app-icon.png` asset (ideally 1024×1024) becomes the universal
 * marketing icon (iOS 14+ single-size format — Xcode derives every
 * size); without one, a valid EMPTY set satisfies the name lookup
 * (actool warns, builds, and the device shows the placeholder icon).
 */
export function materializeIosAssets(groups: AssetGroup[], outDir: string): MaterializeResult {
  const catalog = join(outDir, 'Assets.xcassets')
  mkdirSync(catalog, { recursive: true })
  writeFileSync(
    join(catalog, 'Contents.json'),
    JSON.stringify({ info: { version: 1, author: 'xcode' } }, null, 2) + '\n',
    'utf8',
  )
  let files = 0
  const appIcon = groups.find((g) => g.name === 'app-icon')
  const imageGroups = groups.filter((g) => g.name !== 'app-icon')
  const iconDir = join(catalog, 'AppIcon.appiconset')
  mkdirSync(iconDir, { recursive: true })
  if (appIcon) {
    const best = [...appIcon.variants].sort((a, b) => b.scale - a.scale)[0]!
    const filename = `app-icon.${best.ext}`
    copyFileSync(best.file, join(iconDir, filename))
    files += 1
    writeFileSync(
      join(iconDir, 'Contents.json'),
      JSON.stringify(
        {
          images: [{ idiom: 'universal', platform: 'ios', size: '1024x1024', filename }],
          info: { version: 1, author: 'xcode' },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    )
  } else {
    writeFileSync(
      join(iconDir, 'Contents.json'),
      JSON.stringify(
        {
          images: [{ idiom: 'universal', platform: 'ios', size: '1024x1024' }],
          info: { version: 1, author: 'xcode' },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    )
  }
  for (const group of imageGroups) {
    const setDir = join(catalog, `${group.name}.imageset`)
    mkdirSync(setDir, { recursive: true })
    writeFileSync(join(setDir, 'Contents.json'), buildImagesetContents(group), 'utf8')
    for (const v of group.variants) {
      copyFileSync(v.file, join(setDir, imagesetFilename(group, v)))
      files += 1
    }
  }
  return { assets: groups.length, files }
}

/** Android: write `<out>/res/drawable-*` density buckets. */
export function materializeAndroidAssets(
  groups: AssetGroup[],
  outDir: string,
): MaterializeResult {
  let files = 0
  for (const group of groups) {
    for (const v of group.variants) {
      const bucket = join(outDir, 'res', ANDROID_BUCKET[v.scale]!)
      mkdirSync(bucket, { recursive: true })
      copyFileSync(v.file, join(bucket, `${group.androidName}.${v.ext}`))
      files += 1
    }
  }
  return { assets: groups.length, files }
}

/** Web: plain copy of the 1x variants under `<out>/assets/`. */
export function materializeWebAssets(groups: AssetGroup[], outDir: string): MaterializeResult {
  const dir = join(outDir, 'assets')
  mkdirSync(dir, { recursive: true })
  let files = 0
  for (const group of groups) {
    // Web serves one file per asset — prefer the highest scale
    // available (browsers downscale cleanly; upscaling 1x looks bad
    // on retina). Keep the CANONICAL filename (name.ext) so the
    // `/assets/<bare-src>` runtime prefix resolves.
    const best = [...group.variants].sort((a, b) => b.scale - a.scale)[0]!
    copyFileSync(best.file, join(dir, `${group.name}.${best.ext}`))
    files += 1
  }
  return { assets: groups.length, files }
}

export type AssetTarget = 'ios' | 'android' | 'web'

export function materializeAssets(
  sourceDir: string,
  target: AssetTarget,
  outDir: string,
): MaterializeResult {
  const groups = scanAssetDir(sourceDir)
  if (target === 'ios') {
    const r = materializeIosAssets(groups, outDir)
    const f = materializeIosFonts(scanFontDir(sourceDir), outDir)
    return { assets: r.assets, files: r.files + f.fonts }
  }
  if (target === 'android') {
    const r = materializeAndroidAssets(groups, outDir)
    const f = materializeAndroidFonts(scanFontDir(sourceDir), outDir)
    return { assets: r.assets, files: r.files + f.fonts }
  }
  const r = materializeWebAssets(groups, outDir)
  const f = materializeWebFonts(scanFontDir(sourceDir), outDir)
  return { assets: r.assets, files: r.files + f.fonts }
}
