// Can a scaffolded app actually `npm install`?
//
// It can, and this file is the ratchet that keeps it that way.
// `@pyreon/create-multiplatform` is what `pyreon new --native` npx-runs, and
// the app it emits declares the full native toolchain — `@pyreon/native-cli`,
// the Swift/Kotlin runtimes and routers. Those five were `"private": true`
// for the stack's whole pre-publish life, so `npm install` 404'd at step one
// for anyone outside this repo, and NOTHING caught it: #2529 proved the
// template COMPILES (by driving the workspace compiler directly) and the unit
// tests assert the emitted file list; neither asks whether the emitted
// package.json describes an installable app — the first thing a user finds
// out. This file was added to record that debt (KNOWN_UNPUBLISHED), force it
// to only ever shrink, and fire the moment publishing flipped the truth.
// It fired; the list is empty; the guards below keep it empty.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildScaffold } from '../scaffold'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '../../../../..')

/**
 * Workspace packages the scaffold depends on that are `private: true`, and so
 * cannot be installed from npm.
 *
 * Every entry makes a scaffolded app non-installable. This list may only
 * shrink — by publishing the package, or by removing the dependency.
 */
// EMPTY, and that is the point.
//
// This list held the five scaffold dependencies that were `private: true`, so
// `npm install` failed for anyone outside this repo — the first step a new user
// takes. The ratchet's job was to make that debt visible and only ever shrink.
//
// Making the native stack publishable emptied it. Both of this file's guards
// fired the moment those packages went public ("no longer unpublishable —
// remove them" and "is not a private workspace package"), which is the ratchet
// working exactly as designed: it tracked a real blocker and told us when the
// blocker was gone rather than quietly passing.
//
// Anything added back here is a REGRESSION — a scaffolded app that cannot be
// installed. Publish the package instead.
const KNOWN_UNPUBLISHED: readonly string[] = []

/** Every `@pyreon/*` dependency the scaffolded package.json declares. */
export function scaffoldedPyreonDeps(packageJson: string): string[] {
  const pkg = JSON.parse(packageJson) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]
    .filter((d) => d.startsWith('@pyreon/'))
    .sort()
}

/** Is this workspace package marked private (⇒ never published)? */
function isPrivateInWorkspace(name: string): boolean | null {
  const dirs = [
    'packages/native/cli',
    'packages/native/runtime-swift',
    'packages/native/router-swift',
    'packages/native/runtime-kotlin',
    'packages/native/router-kotlin',
    'packages/core/primitives',
    'packages/core/core',
    'packages/core/reactivity',
    'packages/core/runtime-dom',
    'packages/tools/vite-plugin',
  ]
  for (const d of dirs) {
    try {
      const pkg = JSON.parse(readFileSync(join(REPO, d, 'package.json'), 'utf8')) as {
        name: string
        private?: boolean
      }
      if (pkg.name === name) return pkg.private === true
    } catch {
      // Not this directory.
    }
  }
  return null // not a workspace package we track — treat as out of scope
}

const files = buildScaffold({ name: 'depcheck' })
const packageJson = files.find((f) => f.path === 'package.json')?.content ?? ''

describe('a scaffolded app can be installed', () => {
  it('emits a package.json with @pyreon dependencies at all', () => {
    // Guards against the scan silently matching nothing, which would make
    // every assertion below vacuous.
    expect(packageJson).not.toBe('')
    expect(scaffoldedPyreonDeps(packageJson).length).toBeGreaterThan(4)
  })

  it('declares no UNPUBLISHABLE dependency beyond the known ones', () => {
    const offenders = scaffoldedPyreonDeps(packageJson).filter(
      (d) => isPrivateInWorkspace(d) === true && !KNOWN_UNPUBLISHED.includes(d),
    )
    expect(
      offenders,
      'A scaffolded app depends on a workspace package marked `private: true`, so ' +
        '`npm install` fails for anyone outside this repo — the first step the ' +
        'scaffolder itself prints. Publish the package, drop the dependency, or add it ' +
        'to KNOWN_UNPUBLISHED with the understanding that scaffolded apps stay broken.',
    ).toEqual([])
  })

  it('the KNOWN_UNPUBLISHED list only shrinks — no stale entries', () => {
    // A package that has since been published, or dropped from the scaffold,
    // must leave the list, or it stops describing reality.
    const stale = KNOWN_UNPUBLISHED.filter((d) => {
      const stillDeclared = scaffoldedPyreonDeps(packageJson).includes(d)
      return !stillDeclared || isPrivateInWorkspace(d) === false
    })
    expect(
      stale,
      'These are no longer unpublishable scaffold dependencies — remove them from ' +
        'KNOWN_UNPUBLISHED.',
    ).toEqual([])
  })

  it('every KNOWN_UNPUBLISHED entry is really private in this workspace', () => {
    // Stops the list absorbing a typo, which would exempt nothing while
    // looking like acknowledged debt.
    for (const d of KNOWN_UNPUBLISHED) {
      expect(isPrivateInWorkspace(d), `${d} is not a private workspace package`).toBe(true)
    }
  })

  it('the PUBLISHED web dependencies are not accidentally private', () => {
    // The other half of the contract: the deps that DO resolve must stay
    // resolvable. A published package flipped to private would break the
    // scaffold in exactly the same way and is the likelier future accident.
    for (const d of ['@pyreon/core', '@pyreon/primitives', '@pyreon/reactivity']) {
      expect(scaffoldedPyreonDeps(packageJson)).toContain(d)
      expect(isPrivateInWorkspace(d), `${d} must stay publishable`).toBe(false)
    }
  })

  it('the scaffolded README no longer claims the native toolchain is unpublished', () => {
    // The inverse of the pre-publish assertion that used to live here. While
    // the native packages were private, the README HAD to warn that
    // `npm install` would 404 — a scaffolder printing instructions it knows
    // cannot succeed is worse than one that says nothing. Publishing the stack
    // flipped the truth, so the warning must be GONE (a stale "will fail"
    // banner on a working install is the same lie in the other direction) and
    // the README must state the working contract instead.
    const readme = files.find((f) => f.path === 'README.md')?.content ?? ''
    expect(readme).not.toMatch(/not\s+published to npm/i)
    expect(readme).not.toMatch(/npm install.+will fail/is)
    // The working contract: one fetch step, plus local platform SDKs.
    expect(readme).toMatch(/installs from\s+npm/)
    expect(readme).toMatch(/Xcode/)
    expect(readme).toMatch(/Android SDK/)
  })
})
