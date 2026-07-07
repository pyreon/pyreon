// WebView viz-bundle staging (Phase 3, 2026-07).
//
// Contract locked here: a flat local web bundle (index HTML + sibling
// js/css) lands in the exact per-target location the shipped
// PyreonWebView runtime resolves `<WebView src="…">` against —
// iOS `WebContent/` (bundle-resource group, flattened to the bundle
// root so `Bundle.main.url(forResource:)` finds each bare name) and
// Android `assets/` (`file:///android_asset/`). Flat-only: nested
// subdirectories are surfaced in `skippedDirs`, never silently dropped;
// dotfiles are ignored so build noise never ships in the app bundle.
//
// Bisect site: the `copyFileSync` loop in stageWebBundle (neuter it →
// the "stages files" specs fail); the `entry.startsWith('.')` skip (the
// dotfile spec); the `isDirectory()` branch (the skippedDirs specs).

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stageWebBundle, webBundleOutSubdir } from '../web-bundle'

let src = ''
let out = ''

beforeEach(() => {
  src = mkdtempSync(join(tmpdir(), 'pyreon-web-'))
  out = mkdtempSync(join(tmpdir(), 'pyreon-web-out-'))
})

afterEach(() => {
  rmSync(src, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
})

function put(name: string, content = 'x'): void {
  writeFileSync(join(src, name), content)
}

describe('webBundleOutSubdir', () => {
  it('iOS stages into WebContent (an XcodeGen group → bundle-resource root)', () => {
    expect(webBundleOutSubdir('ios')).toBe('WebContent')
  })
  it('Android stages into assets (Gradle default → file:///android_asset/)', () => {
    expect(webBundleOutSubdir('android')).toBe('assets')
  })
})

describe('stageWebBundle — iOS', () => {
  it('copies a flat bundle into WebContent, preserving bare names', () => {
    put('chart.html', '<html><script src="chart.js"></script></html>')
    put('chart.js', 'console.log(1)')
    put('chart.css', 'body{}')
    const r = stageWebBundle(src, 'ios', out)
    const dir = join(out, 'WebContent')
    expect(r.files).toBe(3)
    // The relative-ref sibling (`<script src="chart.js">`) must land next
    // to the html so file:// resolution works.
    expect(existsSync(join(dir, 'chart.html'))).toBe(true)
    expect(existsSync(join(dir, 'chart.js'))).toBe(true)
    expect(existsSync(join(dir, 'chart.css'))).toBe(true)
    expect(readFileSync(join(dir, 'chart.js'), 'utf8')).toBe('console.log(1)')
  })

  it('skips dotfiles so build noise (.DS_Store) never ships in the bundle', () => {
    put('index.html')
    put('.DS_Store', 'junk')
    const r = stageWebBundle(src, 'ios', out)
    expect(r.files).toBe(1)
    expect(existsSync(join(out, 'WebContent', '.DS_Store'))).toBe(false)
  })

  it('surfaces nested subdirectories in skippedDirs (flat-only v1), never dropping silently', () => {
    put('index.html')
    mkdirSync(join(src, 'nested'))
    writeFileSync(join(src, 'nested', 'deep.js'), 'x')
    const r = stageWebBundle(src, 'ios', out)
    expect(r.files).toBe(1)
    expect(r.skippedDirs).toEqual(['nested'])
    expect(existsSync(join(out, 'WebContent', 'nested'))).toBe(false)
  })
})

describe('stageWebBundle — Android', () => {
  it('copies a flat bundle into assets (file:///android_asset/ root)', () => {
    put('chart.html')
    put('chart.js')
    const r = stageWebBundle(src, 'android', out)
    const dir = join(out, 'assets')
    expect(r.files).toBe(2)
    expect(existsSync(join(dir, 'chart.html'))).toBe(true)
    expect(existsSync(join(dir, 'chart.js'))).toBe(true)
  })
})

describe('stageWebBundle — degenerate inputs', () => {
  it('missing source stages nothing and does not throw', () => {
    const r = stageWebBundle(join(src, 'does-not-exist'), 'ios', out)
    expect(r.files).toBe(0)
    expect(r.skippedDirs).toEqual([])
  })

  it('empty source leaves no orphan destination directory', () => {
    const r = stageWebBundle(src, 'ios', out)
    expect(r.files).toBe(0)
    // Lazy dest creation — an empty bundle must not create WebContent/.
    expect(existsSync(join(out, 'WebContent'))).toBe(false)
  })

  it('an all-dotfile / all-subdir source creates no orphan dest dir', () => {
    put('.DS_Store')
    mkdirSync(join(src, 'sub'))
    const r = stageWebBundle(src, 'android', out)
    expect(r.files).toBe(0)
    expect(r.skippedDirs).toEqual(['sub'])
    expect(existsSync(join(out, 'assets'))).toBe(false)
  })
})
