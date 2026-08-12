// Native-source resolution — the toolchain half of per-package native
// co-location (the keystone of "the ecosystem works on all platforms").
//
// ## The problem this solves
//
// The scaffold hard-codes the native runtime location into the app build:
// iOS `project.yml` `packages:` and Android Gradle `srcDir` both point at a
// FIXED relative path — `../node_modules/@pyreon/native-runtime-swift`,
// `../../node_modules/@pyreon/native-runtime-kotlin/...`. That assumes a flat
// per-app `node_modules`, which npm/yarn HOISTING and pnpm's symlinked store
// both break: in a monorepo the runtime is usually installed at the WORKSPACE
// ROOT, not the app's local `node_modules`, so the fixed path dangles and the
// build cannot find the runtime sources at all (Gap 1).
//
// It also hard-codes the SET of native-bearing packages to exactly the two
// runtime packages, so a feature package (`@pyreon/query`) or a THIRD-PARTY
// package can never ship its own native sources.
//
// ## The fix — resolve + scan
//
// Given the app directory, walk its declared dependencies, RESOLVE each one's
// install location by walking `node_modules` upward (hoisting- and
// pnpm-symlink-safe, the same algorithm Node's own resolver uses), and SCAN
// each resolved package for co-located native sources. A package declares them
// via a `pyreon.native` field in its `package.json`, or by the zero-config
// default directories `native/swift/` and `native/kotlin/`.
//
// The base runtime + router packages declare the field pointing at their
// existing `Sources/PyreonRuntime` / `Sources/PyreonRouter` /
// `src/main/kotlin` layout, so they resolve through the SAME path as a
// co-located feature package — no name-based special-casing.
//
// ## Swift modules vs Kotlin source sets
//
// Swift: a MODULE is one compilation target with no per-file namespace, so
// every `native/swift/` file a feature ships compiles into ONE target
// (default `PyreonRuntime`) and references bare types directly — matching the
// emit, which `import PyreonRuntime` and uses bare names. The base router is
// its own module (`PyreonRouter`). So the Swift result groups dirs BY MODULE.
//
// Kotlin: a source set aggregates any number of `srcDir`s into one compile;
// the `package com.pyreon.runtime` / `com.pyreon.router` declaration inside
// each file determines its namespace. So the Kotlin result is a flat list of
// source dirs.
//
// Node fs only — no runtime deps.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** A native platform the resolver targets. */
export type NativeTarget = 'swift' | 'kotlin'

/** One Swift source directory, tagged with the module it compiles into. */
export interface SwiftNativeSource {
  /** The `@pyreon/*` (or third-party) package that shipped it. */
  package: string
  /** The Swift module/target these sources compile into (`import <module>`). */
  module: string
  /** Absolute path to the directory of `.swift` files. */
  dir: string
}

/** One Kotlin source directory (a Gradle `srcDir`). */
export interface KotlinNativeSource {
  /** The `@pyreon/*` (or third-party) package that shipped it. */
  package: string
  /** Absolute path to the `src`-root directory of `.kt` files. */
  dir: string
}

export interface NativeSourceResolution {
  /** Swift source dirs, in dependency-declaration order, module-tagged. */
  swift: SwiftNativeSource[]
  /** Kotlin source dirs, in dependency-declaration order. */
  kotlin: KotlinNativeSource[]
  /**
   * Packages that DECLARED native sources (via the `pyreon.native` field) but
   * whose declared directory does not exist on disk — a real misconfiguration
   * worth surfacing, distinct from a package that simply has no native half.
   */
  brokenDeclarations: { package: string; target: NativeTarget; dir: string }[]
}

/** The default Swift module a co-located `native/swift/` dir compiles into. */
export const DEFAULT_SWIFT_MODULE = 'PyreonRuntime'
/** Zero-config co-location directories, relative to a package root. */
const DEFAULT_SWIFT_DIR = 'native/swift'
const DEFAULT_KOTLIN_DIR = 'native/kotlin'

interface PyreonNativeSwiftDecl {
  module?: string
  dir: string
}
interface PyreonNativeField {
  swift?: PyreonNativeSwiftDecl | PyreonNativeSwiftDecl[] | string
  kotlin?: { dir: string } | { dir: string }[] | string
}
interface PackageManifest {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  pyreon?: { native?: PyreonNativeField }
}

/**
 * Resolve a package's install directory from `fromDir` by walking
 * `node_modules` upward — the algorithm Node's resolver uses, which is exactly
 * what makes it hoisting- and pnpm-symlink-safe: the app's
 * `node_modules/<name>` may be a symlink into pnpm's store, or absent because
 * the dep hoisted to the workspace root; the upward walk finds it either way.
 *
 * `existsSync` follows symlinks, so a pnpm-linked package resolves through its
 * link transparently. Returns the resolved directory, or null if not found.
 */
export function findPackageDir(name: string, fromDir: string): string | null {
  let dir = resolve(fromDir)
  // Guard against an unbounded loop on exotic filesystems.
  for (let i = 0; i < 64; i++) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function readManifest(pkgDir: string): PackageManifest | null {
  try {
    return JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as PackageManifest
  } catch {
    return null
  }
}

/** Normalize a `pyreon.native.swift` declaration to an array of decls. */
function swiftDecls(field: PyreonNativeField | undefined): PyreonNativeSwiftDecl[] | null {
  if (!field || field.swift === undefined) return null
  const raw = field.swift
  if (typeof raw === 'string') return [{ dir: raw }]
  return Array.isArray(raw) ? raw : [raw]
}

/** Normalize a `pyreon.native.kotlin` declaration to an array of dirs. */
function kotlinDecls(field: PyreonNativeField | undefined): { dir: string }[] | null {
  if (!field || field.kotlin === undefined) return null
  const raw = field.kotlin
  if (typeof raw === 'string') return [{ dir: raw }]
  return Array.isArray(raw) ? raw : [raw]
}

/** Absolute-ize a package-relative dir. */
function abs(pkgDir: string, dir: string): string {
  return isAbsolute(dir) ? dir : join(pkgDir, dir)
}

/**
 * Collect a single package's native source directories. A package contributes
 * a dir when either (a) it declares one via `pyreon.native`, or (b) the
 * zero-config default directory exists. A DECLARED dir that is missing on disk
 * is reported as a broken declaration; a missing DEFAULT dir is silently
 * skipped (most packages have no native half).
 */
function collectPackage(
  name: string,
  pkgDir: string,
  manifest: PackageManifest,
  out: NativeSourceResolution,
): void {
  const native = manifest.pyreon?.native

  // --- Swift ---
  const declaredSwift = swiftDecls(native)
  if (declaredSwift) {
    for (const d of declaredSwift) {
      const full = abs(pkgDir, d.dir)
      if (existsSync(full)) {
        out.swift.push({ package: name, module: d.module ?? DEFAULT_SWIFT_MODULE, dir: full })
      } else {
        out.brokenDeclarations.push({ package: name, target: 'swift', dir: full })
      }
    }
  } else {
    const full = join(pkgDir, DEFAULT_SWIFT_DIR)
    if (existsSync(full)) {
      out.swift.push({ package: name, module: DEFAULT_SWIFT_MODULE, dir: full })
    }
  }

  // --- Kotlin ---
  const declaredKotlin = kotlinDecls(native)
  if (declaredKotlin) {
    for (const d of declaredKotlin) {
      const full = abs(pkgDir, d.dir)
      if (existsSync(full)) {
        out.kotlin.push({ package: name, dir: full })
      } else {
        out.brokenDeclarations.push({ package: name, target: 'kotlin', dir: full })
      }
    }
  } else {
    const full = join(pkgDir, DEFAULT_KOTLIN_DIR)
    if (existsSync(full)) {
      out.kotlin.push({ package: name, dir: full })
    }
  }
}

export interface ResolveOptions {
  /**
   * Also follow first-party (`@pyreon/*`) TRANSITIVE dependencies. Off by
   * default (v1 scans the app's DIRECT deps — the shape `npm install
   * @pyreon/query` produces). A workspace app that re-exports a native-bearing
   * package through an intermediate first-party package can turn this on.
   */
  transitiveScope?: 'direct' | 'first-party'
  /**
   * Restrict scanning to packages whose name matches this predicate. Defaults
   * to `@pyreon/*` plus any package that declares a `pyreon.native` field
   * (so a third-party package opts in by declaring the field).
   */
  include?: (name: string) => boolean
}

/**
 * Resolve every native source directory reachable from an app directory.
 *
 * Reads the app's `package.json` dependencies + devDependencies, resolves each
 * one's install location (hoisting/pnpm-safe), and scans it for native
 * sources. Deterministic order: dependency-declaration order, deduped by
 * resolved directory so a package resolved through two dep edges contributes
 * once.
 */
export function resolveNativeSources(appDir: string, options: ResolveOptions = {}): NativeSourceResolution {
  const out: NativeSourceResolution = { swift: [], kotlin: [], brokenDeclarations: [] }
  const appManifest = readManifest(appDir)
  if (!appManifest) return out

  const include = options.include ?? ((name: string) => name.startsWith('@pyreon/'))
  const seenDirs = new Set<string>()
  const visited = new Set<string>()

  const depNames = (m: PackageManifest): string[] => [
    ...Object.keys(m.dependencies ?? {}),
    ...Object.keys(m.devDependencies ?? {}),
  ]

  const queue: { name: string; fromDir: string }[] = depNames(appManifest).map((name) => ({
    name,
    fromDir: appDir,
  }))

  while (queue.length > 0) {
    const { name, fromDir } = queue.shift()!
    if (visited.has(name)) continue
    visited.add(name)

    const pkgDir = findPackageDir(name, fromDir)
    if (!pkgDir) continue
    if (seenDirs.has(pkgDir)) continue

    const manifest = readManifest(pkgDir)
    if (!manifest) continue

    // Opt-in gate: @pyreon/* by default, or any package declaring the field.
    const isCandidate = include(name) || manifest.pyreon?.native !== undefined
    if (isCandidate) {
      seenDirs.add(pkgDir)
      collectPackage(name, pkgDir, manifest, out)
    }

    // Transitive first-party scan (opt-in): follow @pyreon/* deps of a
    // resolved @pyreon/* package so a re-export chain still aggregates.
    if (options.transitiveScope === 'first-party' && name.startsWith('@pyreon/')) {
      for (const dep of depNames(manifest)) {
        if (dep.startsWith('@pyreon/') && !visited.has(dep)) {
          queue.push({ name: dep, fromDir: pkgDir })
        }
      }
    }
  }

  return out
}

/** The distinct Swift modules present in a resolution, in first-seen order. */
export function swiftModules(res: NativeSourceResolution): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (const s of res.swift) {
    if (!seen.has(s.module)) {
      seen.add(s.module)
      order.push(s.module)
    }
  }
  return order
}

/** All Swift source dirs for a given module, in resolution order. */
export function swiftDirsForModule(res: NativeSourceResolution, module: string): string[] {
  return res.swift.filter((s) => s.module === module).map((s) => s.dir)
}
