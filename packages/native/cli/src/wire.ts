// Native build-wiring generation — turn a resolved native-source set into the
// concrete inputs each platform's build system needs, RESOLVED at build time
// so a monorepo (hoisting / pnpm) works where the scaffold's fixed
// `../node_modules/...` paths dangle (Gap 1).
//
// ## Android — Gradle source sets
//
// Kotlin aggregates any number of `srcDir`s into one compile, so this is the
// complete story for Android: every resolved Kotlin source dir (base runtime +
// router + every co-located feature `native/kotlin/`) is a `srcDir`. The
// generated file is a newline-separated list of ABSOLUTE dirs; the scaffold's
// `build.gradle.kts` reads it and falls back to the legacy fixed paths when
// the file is absent (so an app that never ran `wire` still builds flat).
//
// ## iOS — SwiftPM packages + a co-location target
//
// Two shapes, because SwiftPM and co-located sources differ:
//   - A base package that ships a `Package.swift` (native-runtime-swift,
//     native-router-swift) is referenced as an SPM local package at its
//     RESOLVED absolute path — the Gap-1 fix for the existing wiring.
//   - A co-located feature `native/swift/` dir (no `Package.swift`) cannot be
//     an SPM package; its sources compile directly into the module's target.
//     These are surfaced as `targetSources` grouped by module, for the
//     XcodeGen `sources:` list a single aggregating target consumes (the
//     Phase-B iOS co-location step).
//
// Node fs only.

import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  type NativeSourceResolution,
  findPackageDir,
  resolveNativeSources,
  swiftModules,
} from './native-sources'

/** One SwiftPM local-package reference for the iOS `project.yml` `packages:`. */
export interface IosSpmPackage {
  /** The SwiftPM module name (`import <module>`). */
  module: string
  /** Absolute path to the package root (the dir containing `Package.swift`). */
  path: string
}

/** Co-located Swift sources for a module, compiled directly into its target. */
export interface IosTargetSources {
  module: string
  /** Absolute dirs of `.swift` files (no `Package.swift`). */
  dirs: string[]
}

export interface NativeWiring {
  /** Absolute Gradle `srcDir`s, dependency order, deduped. */
  androidSrcDirs: string[]
  /** SwiftPM local packages (base runtime/router), resolved absolute paths. */
  iosSpmPackages: IosSpmPackage[]
  /** Co-located Swift source dirs grouped by module (feature packages). */
  iosTargetSources: IosTargetSources[]
  /** Packages that declared native sources whose dir is missing on disk. */
  brokenDeclarations: NativeSourceResolution['brokenDeclarations']
}

/**
 * Walk up from a resolved source dir to the package root — the nearest
 * ancestor containing a `package.json`. Used to turn a Swift `Sources/X` dir
 * into the SwiftPM package root (which also holds `Package.swift`).
 */
function packageRootOf(sourceDir: string): string | null {
  let dir = sourceDir
  for (let i = 0; i < 64; i++) {
    if (existsSync(`${dir}/package.json`)) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** Compute the concrete build wiring from a resolved native-source set. */
export function computeWiring(res: NativeSourceResolution): NativeWiring {
  // Android: every kotlin dir is a srcDir. Dedupe preserving order.
  const seenKotlin = new Set<string>()
  const androidSrcDirs: string[] = []
  for (const k of res.kotlin) {
    if (!seenKotlin.has(k.dir)) {
      seenKotlin.add(k.dir)
      androidSrcDirs.push(k.dir)
    }
  }

  // iOS: split each swift source into SPM-package (has Package.swift) vs
  // co-located target sources (does not). Group target sources by module.
  const iosSpmPackages: IosSpmPackage[] = []
  const spmSeen = new Set<string>()
  const targetByModule = new Map<string, string[]>()
  for (const module of swiftModules(res)) {
    targetByModule.set(module, [])
  }

  for (const s of res.swift) {
    const root = packageRootOf(s.dir)
    const isSpm = root ? existsSync(`${root}/Package.swift`) : false
    if (isSpm && root) {
      if (!spmSeen.has(root)) {
        spmSeen.add(root)
        iosSpmPackages.push({ module: s.module, path: root })
      }
    } else {
      targetByModule.get(s.module)!.push(s.dir)
    }
  }

  const iosTargetSources: IosTargetSources[] = []
  for (const [module, dirs] of targetByModule) {
    if (dirs.length > 0) iosTargetSources.push({ module, dirs })
  }

  return {
    androidSrcDirs,
    iosSpmPackages,
    iosTargetSources,
    brokenDeclarations: res.brokenDeclarations,
  }
}

/** Resolve + compute wiring for an app directory in one call. */
export function wireApp(appDir: string): NativeWiring {
  return computeWiring(resolveNativeSources(appDir))
}

/**
 * Render the Android srcDirs file — one absolute dir per line. The scaffold's
 * `build.gradle.kts` reads this; a leading comment documents its provenance
 * (Gradle ignores `#` lines, and the reader filters blanks/comments).
 */
export function renderAndroidSrcDirsFile(wiring: NativeWiring): string {
  const lines = [
    '# Generated by `pyreon-native wire` — resolved Pyreon native Kotlin',
    '# source roots (base runtime/router + co-located feature packages).',
    '# Hoisting/pnpm-safe absolute paths. Do not edit by hand.',
    ...wiring.androidSrcDirs,
  ]
  return lines.join('\n') + '\n'
}

// Re-export so the CLI + tests import the resolver family through one module.
export { findPackageDir, resolveNativeSources }
