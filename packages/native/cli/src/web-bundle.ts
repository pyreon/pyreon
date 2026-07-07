// WebView viz-bundle staging (Phase 3, 2026-07).
//
// The shipped PyreonWebView runtime already loads `<WebView src="…">`
// from a LOCAL app resource (the policy-safe path — Apple 4.2 / Google's
// webview policy both discourage remote-only chrome):
//   - iOS  (PyreonWebView.swift): `Bundle.main.url(forResource: src,
//           withExtension: nil)` → `loadFileURL(…, allowingReadAccessTo:
//           Bundle.main.bundleURL)`.
//   - Android (PyreonWebView.kt): `loadUrl("file:///android_asset/$src")`.
//
// What was MISSING was the build-time step that COPIES a local viz
// bundle (an index HTML + sibling js/css) into the exact location each
// runtime resolves `src` against. Without it, `<WebView src="chart.html">`
// emits correctly and typechecks, but the file:// load 404s because
// nothing ever staged `chart.html` into the app. This closes that gap.
//
// Where each target's files land (chosen to match the runtime's `src`
// resolution — see above):
//   - iOS:     `<out>/WebContent/<file>`. The scaffold's XcodeGen
//              `project.yml` includes `WebContent` as a `type: group`
//              source, which FLATTENS its files into the app bundle's
//              resource root, so `Bundle.main.url(forResource:)` finds
//              each file by bare name.
//   - Android: `<out>/assets/<file>` (the caller passes
//              `android/app/src/main` as `<out>`, matching the image
//              pipeline). `assets/` is Gradle's default asset dir, served
//              at `file:///android_asset/`.
//
// v1 is FLAT-ONLY by design. The Swift runtime resolves `src` via
// `forResource: src, withExtension: nil` with NO `subdirectory:`, so a
// nested web dir can't be reached on iOS without a runtime change (a
// documented follow-up). A nested subdirectory is therefore SKIPPED with
// a surfaced warning — never silently dropped. Dotfiles (`.DS_Store`) are
// ignored so build noise never ships inside the app bundle.
//
// Mirrors the shape of `assets.ts`'s `materialize*` functions.

import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type WebBundleTarget = 'ios' | 'android'

export interface StageWebBundleResult {
  /** Number of files copied into the platform asset location. */
  files: number
  /**
   * Top-level subdirectories skipped (flat-only v1) — surfaced so the
   * CLI can warn rather than silently dropping nested content.
   */
  skippedDirs: string[]
}

/**
 * The per-target subdirectory (relative to `outDir`) a web bundle is
 * staged into. iOS: `WebContent` (an XcodeGen `type: group` folder that
 * flattens to bundle resources). Android: `assets` (Gradle's default
 * asset dir → `file:///android_asset/`).
 */
export function webBundleOutSubdir(target: WebBundleTarget): string {
  return target === 'ios' ? 'WebContent' : 'assets'
}

/**
 * Copy a flat web bundle from `sourceDir` into the platform location the
 * PyreonWebView runtime resolves `src` against. Returns the file count +
 * any skipped nested directories. A missing `sourceDir` stages nothing
 * (the caller gates on directory existence; this is defensive).
 */
export function stageWebBundle(
  sourceDir: string,
  target: WebBundleTarget,
  outDir: string,
): StageWebBundleResult {
  const destDir = join(outDir, webBundleOutSubdir(target))
  const skippedDirs: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(sourceDir)
  } catch {
    return { files: 0, skippedDirs }
  }
  let files = 0
  let madeDest = false
  for (const entry of [...entries].sort()) {
    // Skip build noise (`.DS_Store`, editor temp files) — it must never
    // ship inside the app bundle / android assets.
    if (entry.startsWith('.')) continue
    const path = join(sourceDir, entry)
    if (statSync(path).isDirectory()) {
      skippedDirs.push(entry)
      continue
    }
    // Create the dest lazily so an empty (or all-skipped) source doesn't
    // leave an orphan directory behind.
    if (!madeDest) {
      mkdirSync(destDir, { recursive: true })
      madeDest = true
    }
    copyFileSync(path, join(destDir, entry))
    files += 1
  }
  return { files, skippedDirs }
}
