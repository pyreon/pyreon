// Asset pipeline materializer (asset-pipeline arc, 2026-06-11).
//
// Bisect sites: parseAssetFilename's scale-suffix regex; the
// android-name collision throw in scanAssetDir; the per-scale density
// buckets in materializeAndroidAssets; the imageset Contents.json
// shape in buildImagesetContents.

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildImagesetContents,
  materializeAndroidAssets,
  materializeIosAssets,
  materializeWebAssets,
  parseAssetFilename,
  sanitizeAndroidName,
  scanAssetDir,
} from '../assets'

let dir = ''
let out = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-assets-'))
  out = mkdtempSync(join(tmpdir(), 'pyreon-assets-out-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
})

function put(name: string): void {
  writeFileSync(join(dir, name), 'png-bytes')
}

describe('parseAssetFilename', () => {
  it('bare / @2x / @3x variants parse to one name', () => {
    expect(parseAssetFilename('logo.png')).toEqual({ name: 'logo', scale: 1, ext: 'png' })
    expect(parseAssetFilename('logo@2x.png')).toEqual({ name: 'logo', scale: 2, ext: 'png' })
    expect(parseAssetFilename('logo@3x.PNG')).toEqual({ name: 'logo', scale: 3, ext: 'png' })
  })

  it('non-image files are skipped', () => {
    expect(parseAssetFilename('readme.md')).toBeNull()
    expect(parseAssetFilename('font.woff2')).toBeNull()
  })
})

describe('sanitizeAndroidName (lockstep with runtime-kotlin sanitizeResourceName)', () => {
  it('kebab → underscore, lowercase, leading-digit prefix', () => {
    expect(sanitizeAndroidName('pyreon-logo')).toBe('pyreon_logo')
    expect(sanitizeAndroidName('Hero Image')).toBe('hero_image')
    expect(sanitizeAndroidName('3d-badge')).toBe('_3d_badge')
  })
})

describe('scanAssetDir', () => {
  it('groups scale variants under one asset', () => {
    put('logo.png')
    put('logo@2x.png')
    put('hero.jpg')
    const groups = scanAssetDir(dir)
    expect(groups.map((g) => g.name).sort()).toEqual(['hero', 'logo'])
    expect(groups.find((g) => g.name === 'logo')!.variants.length).toBe(2)
  })

  it('android-name collisions abort loudly (never silent dedupe)', () => {
    put('my-logo.png')
    put('my_logo.png')
    expect(() => scanAssetDir(dir)).toThrow(/collision.*my.logo/i)
  })

  it('duplicate scale variants abort', () => {
    put('logo.png')
    put('logo.jpg')
    expect(() => scanAssetDir(dir)).toThrow(/two @1x variants/)
  })
})

describe('materializers', () => {
  it('iOS: catalog root + imageset Contents.json + per-scale files', () => {
    put('pyreon-logo.png')
    put('pyreon-logo@2x.png')
    const result = materializeIosAssets(scanAssetDir(dir), out)
    expect(result).toEqual({ assets: 1, files: 2 })
    const setDir = join(out, 'Assets.xcassets', 'pyreon-logo.imageset')
    const contents = JSON.parse(readFileSync(join(setDir, 'Contents.json'), 'utf8'))
    expect(contents.images).toEqual([
      { idiom: 'universal', scale: '1x', filename: 'pyreon-logo.png' },
      { idiom: 'universal', scale: '2x', filename: 'pyreon-logo@2x.png' },
      { idiom: 'universal', scale: '3x' },
    ])
    expect(readdirSync(setDir).sort()).toEqual([
      'Contents.json',
      'pyreon-logo.png',
      'pyreon-logo@2x.png',
    ])
    // Catalog root Contents.json exists (Xcode requires it).
    expect(readdirSync(join(out, 'Assets.xcassets'))).toContain('Contents.json')
    // AppIcon set is ALWAYS present: once a project carries any
    // catalog, actool enforces ASSETCATALOG_COMPILER_APPICON_NAME and
    // fails the build when no catalog contains it (device-found).
    const iconContents = JSON.parse(
      readFileSync(join(out, 'Assets.xcassets', 'AppIcon.appiconset', 'Contents.json'), 'utf8'),
    )
    expect(iconContents.images).toEqual([
      { idiom: 'universal', platform: 'ios', size: '1024x1024' },
    ])
  })

  it('iOS: an app-icon asset becomes the universal marketing icon (not an imageset)', () => {
    put('app-icon.png')
    put('logo.png')
    const result = materializeIosAssets(scanAssetDir(dir), out)
    expect(result.files).toBe(2)
    const iconContents = JSON.parse(
      readFileSync(join(out, 'Assets.xcassets', 'AppIcon.appiconset', 'Contents.json'), 'utf8'),
    )
    expect(iconContents.images[0].filename).toBe('app-icon.png')
    // app-icon does NOT also emit as a regular imageset.
    expect(readdirSync(join(out, 'Assets.xcassets'))).not.toContain('app-icon.imageset')
  })

  it('Android: density buckets + sanitized names', () => {
    put('pyreon-logo.png')
    put('pyreon-logo@2x.png')
    put('pyreon-logo@3x.png')
    const result = materializeAndroidAssets(scanAssetDir(dir), out)
    expect(result).toEqual({ assets: 1, files: 3 })
    expect(readdirSync(join(out, 'res', 'drawable-mdpi'))).toEqual(['pyreon_logo.png'])
    expect(readdirSync(join(out, 'res', 'drawable-xhdpi'))).toEqual(['pyreon_logo.png'])
    expect(readdirSync(join(out, 'res', 'drawable-xxhdpi'))).toEqual(['pyreon_logo.png'])
  })

  it('Web: one file per asset under assets/, canonical filename, best scale wins', () => {
    put('pyreon-logo.png')
    put('pyreon-logo@2x.png')
    const result = materializeWebAssets(scanAssetDir(dir), out)
    expect(result).toEqual({ assets: 1, files: 1 })
    // Canonical name (no @2x suffix) so /assets/<bare-src> resolves.
    expect(readdirSync(join(out, 'assets'))).toEqual(['pyreon-logo.png'])
  })

  it('imageset filenames for 3-variant groups carry the scale suffixes', () => {
    put('icon.png')
    put('icon@2x.png')
    put('icon@3x.png')
    const group = scanAssetDir(dir)[0]!
    const contents = JSON.parse(buildImagesetContents(group))
    expect(contents.images.map((i: { filename?: string }) => i.filename)).toEqual([
      'icon.png',
      'icon@2x.png',
      'icon@3x.png',
    ])
  })
})
