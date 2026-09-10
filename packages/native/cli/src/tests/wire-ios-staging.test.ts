/**
 * The iOS half of `wire` — staging co-located Swift and linking SwiftPM
 * packages into an Xcode project.
 *
 * `wire`'s tests cover RESOLUTION (which dirs a dependency graph implies)
 * and stop there; the three functions that act on the answer had none. They
 * are pure filesystem work, so they are testable anywhere, and each carries
 * a failure mode its docstring names explicitly:
 *
 *   * **Staging rebuilds from scratch** so a removed dependency's sources
 *     cannot linger and keep compiling. A stale `.swift` in a compile path
 *     does not error — it BUILDS, and the app ships code from a package
 *     that is no longer a dependency.
 *   * **Filenames are module-prefixed** because the staging dir is flat and
 *     has no other namespace. Two packages shipping `Types.swift` would
 *     otherwise silently overwrite one another; the build then fails with a
 *     missing symbol from whichever lost, pointing nowhere useful.
 *   * **Packages are SYMLINKED, not copied**, because a SwiftPM package is
 *     a build input Xcode resolves in place — copying duplicates a whole
 *     package per app and breaks incremental builds.
 *
 * And the pair is one operation: a project with sources staged but runtimes
 * unlinked compiles the features and cannot resolve what they import.
 */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { linkIosPackages, stageIosSources, stageIosWiring } from '../wire'
import type { NativeWiring } from '../wire'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-wire-ios-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** A source dir holding the given files. */
const sourceDir = (name: string, files: Record<string, string>): string => {
  const dir = join(root, 'src', name)
  mkdirSync(dir, { recursive: true })
  for (const [f, content] of Object.entries(files)) writeFileSync(join(dir, f), content, 'utf8')
  return dir
}

const wiring = (over: Partial<NativeWiring> = {}): NativeWiring => ({
  androidSrcDirs: [],
  iosSpmPackages: [],
  iosTargetSources: [],
  brokenDeclarations: [],
  ...over,
})

describe('stageIosSources copies the Swift a project must compile', () => {
  it('stages .swift files, prefixed with their module', () => {
    // The control, and the prefix contract in one.
    const dir = sourceDir('feat', { 'View.swift': 'x', 'Model.swift': 'y' })
    const out = join(root, 'PyreonNative')
    const count = stageIosSources(wiring({ iosTargetSources: [{ module: 'Feat', dirs: [dir] }] }), out)

    expect(count).toBe(2)
    expect(readdirSync(out).sort()).toEqual(['Feat-Model.swift', 'Feat-View.swift'])
  })

  it('two modules shipping the SAME filename both survive', () => {
    // Without the prefix one silently overwrites the other and the build
    // fails on a missing symbol that names neither package.
    const a = sourceDir('a', { 'Types.swift': 'A' })
    const b = sourceDir('b', { 'Types.swift': 'B' })
    const out = join(root, 'PyreonNative')
    const count = stageIosSources(
      wiring({
        iosTargetSources: [
          { module: 'Alpha', dirs: [a] },
          { module: 'Beta', dirs: [b] },
        ],
      }),
      out,
    )

    expect(count, 'both files must be staged').toBe(2)
    expect(readdirSync(out).sort()).toEqual(['Alpha-Types.swift', 'Beta-Types.swift'])
  })

  it('REMOVES a stale file from a previous run', () => {
    // The reason the directory is rebuilt rather than merged. A source
    // whose package was removed does not error if it lingers — it
    // compiles, and the app ships code from a dependency it no longer has.
    const out = join(root, 'PyreonNative')
    const first = sourceDir('old', { 'Gone.swift': 'x' })
    stageIosSources(wiring({ iosTargetSources: [{ module: 'Old', dirs: [first] }] }), out)
    expect(existsSync(join(out, 'Old-Gone.swift'))).toBe(true)

    const second = sourceDir('new', { 'Kept.swift': 'y' })
    stageIosSources(wiring({ iosTargetSources: [{ module: 'New', dirs: [second] }] }), out)

    expect(existsSync(join(out, 'Old-Gone.swift')), 'the removed dep must not linger').toBe(false)
    expect(readdirSync(out)).toEqual(['New-Kept.swift'])
  })

  it('ignores non-Swift files and subdirectories', () => {
    // A README or a nested fixture dir copied into a compile path is at
    // best noise and at worst a build error.
    const dir = sourceDir('mixed', { 'View.swift': 'x', 'README.md': 'no', 'notes.txt': 'no' })
    mkdirSync(join(dir, 'nested'), { recursive: true })
    writeFileSync(join(dir, 'nested', 'Deep.swift'), 'z', 'utf8')

    const out = join(root, 'PyreonNative')
    const count = stageIosSources(wiring({ iosTargetSources: [{ module: 'M', dirs: [dir] }] }), out)

    expect(count).toBe(1)
    expect(readdirSync(out)).toEqual(['M-View.swift'])
  })

  it('stages every dir a module declares', () => {
    const d1 = sourceDir('m1', { 'A.swift': 'a' })
    const d2 = sourceDir('m2', { 'B.swift': 'b' })
    const out = join(root, 'PyreonNative')
    const count = stageIosSources(wiring({ iosTargetSources: [{ module: 'M', dirs: [d1, d2] }] }), out)
    expect(count).toBe(2)
    expect(readdirSync(out).sort()).toEqual(['M-A.swift', 'M-B.swift'])
  })

  it('creates the output dir and returns 0 when there is nothing to stage', () => {
    // An app with only SwiftPM runtimes and no co-located features. The
    // dir must still exist — the Xcode spec references it either way.
    const out = join(root, 'PyreonNative')
    expect(stageIosSources(wiring(), out)).toBe(0)
    expect(existsSync(out), 'the spec references this path unconditionally').toBe(true)
  })
})

describe('linkIosPackages points Xcode at the real install layout', () => {
  const pkg = (name: string): string => {
    const dir = join(root, 'node_modules', '@pyreon', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'Package.swift'), '// spm', 'utf8')
    return dir
  }

  it('creates a SYMLINK, not a copy', () => {
    // A SwiftPM package is a build input Xcode resolves in place; copying
    // duplicates a package per app and breaks incremental builds.
    const p = pkg('native-runtime-swift')
    const out = join(root, 'PyreonPackages')
    const linked = linkIosPackages(
      wiring({ iosSpmPackages: [{ name: 'PyreonRuntime', path: p }] as never }),
      out,
    )

    expect(linked).toBe(1)
    const link = join(out, 'native-runtime-swift')
    expect(lstatSync(link).isSymbolicLink(), 'must be a link').toBe(true)
    expect(readlinkSync(link), 'pointing at the resolved location').toBe(p)
  })

  it('names the link after the package DIRECTORY, not the Swift module', () => {
    // The spec's `packages:` key already carries the module name, and one
    // package root can ship more than one module — so the directory is the
    // only name guaranteed unique here.
    const p = pkg('native-router-swift')
    const out = join(root, 'PyreonPackages')
    linkIosPackages(wiring({ iosSpmPackages: [{ name: 'PyreonRouter', path: p }] as never }), out)
    expect(readdirSync(out)).toEqual(['native-router-swift'])
  })

  it('rebuilds the directory, so a link to a MOVED package cannot go stale', () => {
    // Under a re-install the package can land somewhere else. A stale link
    // dangles, and `xcodegen generate` fails the spec outright.
    const out = join(root, 'PyreonPackages')
    const before = pkg('native-runtime-swift')
    linkIosPackages(wiring({ iosSpmPackages: [{ name: 'R', path: before }] as never }), out)

    const after = join(root, 'hoisted', 'native-runtime-swift')
    mkdirSync(after, { recursive: true })
    linkIosPackages(wiring({ iosSpmPackages: [{ name: 'R', path: after }] as never }), out)

    expect(readlinkSync(join(out, 'native-runtime-swift')), 'relinked to the new path').toBe(after)
  })

  it('returns 0 and still creates the dir when there are no packages', () => {
    const out = join(root, 'PyreonPackages')
    expect(linkIosPackages(wiring(), out)).toBe(0)
    expect(existsSync(out)).toBe(true)
  })
})

describe('stageIosWiring does BOTH halves', () => {
  it('stages sources AND links packages under the conventional paths', () => {
    // A caller that ran only one half gets a project that compiles the
    // feature sources and cannot resolve the runtime they import — or the
    // reverse. That is why this is one call.
    const src = sourceDir('feat', { 'View.swift': 'x' })
    const p = join(root, 'node_modules', '@pyreon', 'native-runtime-swift')
    mkdirSync(p, { recursive: true })
    const iosDir = join(root, 'ios')

    const res = stageIosWiring(
      wiring({
        iosTargetSources: [{ module: 'Feat', dirs: [src] }],
        iosSpmPackages: [{ name: 'PyreonRuntime', path: p }] as never,
      }),
      iosDir,
    )

    expect(res).toEqual({ staged: 1, linked: 1 })
    expect(readdirSync(join(iosDir, 'PyreonNative'))).toEqual(['Feat-View.swift'])
    expect(readdirSync(join(iosDir, 'PyreonPackages'))).toEqual(['native-runtime-swift'])
  })
})
