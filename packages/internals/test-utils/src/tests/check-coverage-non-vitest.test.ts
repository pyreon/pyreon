// Packages whose `test` script does not run vitest.
//
// The four `@pyreon/native-{runtime,router}-{swift,kotlin}` packages ship
// Swift/Kotlin SOURCE consumed by SPM and Gradle. Their `test` script runs
// `swift test` / `verify-kotlin.ts`, and they hold ZERO TypeScript — so a JS
// coverage pass over them measures 0/0 files. The gate rightly refuses to call
// 0/0 a pass (that refusal is what caught `@pyreon/config` reporting 0% with
// its logic fully covered), but for these four "measured nothing" is the TRUTH
// rather than a failure: there is no JS to cover.
//
// The classification has to hold in BOTH directions, which is what these specs
// pin:
//
//   * a package with no vitest config and no TypeScript is skipped, and NAMED
//     in the report — a silent skip is the thing the gate exists to prevent;
//   * a package with no vitest config that DOES carry TypeScript is a real
//     hole (someone shipped JS with no suite wired) and must be reported, not
//     skipped. A skip list checked in one direction only is how it rots into a
//     place where packages hide.
//
// The discriminator is deliberately the CONFIG FILE, never a name list: a name
// list needs an edit for every new package, and the edit that gets forgotten is
// the one that hides something.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { classifyNonVitestPackage } from '../../../../../scripts/check-coverage'

let dir = ''

/** Build a package directory: optional vitest config + arbitrary src files. */
function makePkg(opts: { vitestConfig?: boolean; files?: Record<string, string> }): string {
  const pkg = mkdtempSync(join(dir, 'pkg-'))
  if (opts.vitestConfig) writeFileSync(join(pkg, 'vitest.config.ts'), 'export default {}')
  for (const [rel, body] of Object.entries(opts.files ?? {})) {
    const full = join(pkg, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return pkg
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-nonvitest-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('classifyNonVitestPackage', () => {
  it('calls a package WITH a vitest config a vitest package, whatever it contains', () => {
    const pkg = makePkg({ vitestConfig: true, files: { 'src/index.ts': 'export const a = 1' } })
    expect(classifyNonVitestPackage(pkg)).toEqual({ kind: 'vitest' })
  })

  it('still calls it a vitest package when it has a config but no source yet', () => {
    // A brand-new package mid-scaffold must not be mistaken for a Swift one.
    expect(classifyNonVitestPackage(makePkg({ vitestConfig: true }))).toEqual({ kind: 'vitest' })
  })

  it('classifies no-config + no-TypeScript as no-js (the Swift/Kotlin shape)', () => {
    const pkg = makePkg({
      files: {
        'Sources/PyreonRuntime/PyreonDatabase.swift': '// swift',
        'Package.swift': '// spm',
      },
    })
    expect(classifyNonVitestPackage(pkg)).toEqual({ kind: 'no-js', sources: 0 })
  })

  it('classifies a package with no src/ directory at all as no-js', () => {
    expect(classifyNonVitestPackage(makePkg({}))).toEqual({ kind: 'no-js', sources: 0 })
  })

  // ── the load-bearing direction ──────────────────────────────────────────
  //
  // Without this, the skip is unfalsifiable: any package could drop its vitest
  // config and silently leave the gate.
  it('reports no-config + real TypeScript as UNWIRED rather than skipping it', () => {
    const pkg = makePkg({
      files: { 'src/index.ts': 'export const a = 1', 'src/util.ts': 'export const b = 2' },
    })
    expect(classifyNonVitestPackage(pkg)).toEqual({ kind: 'unwired', sources: 2 })
  })

  it('does not count TEST files as source when deciding UNWIRED', () => {
    // A package holding only tests and no implementation is not shipping
    // unmeasured JS — and `isTestPath` is the repo's single definition of a
    // test path, shared with check-changeset-required, so this cannot drift
    // into disagreeing with the other gates.
    const pkg = makePkg({
      files: {
        'src/index.test.ts': 'it("x", () => {})',
        'src/tests/setup.ts': 'export const s = 1',
      },
    })
    expect(classifyNonVitestPackage(pkg)).toEqual({ kind: 'no-js', sources: 0 })
  })

  it('counts .tsx as source too', () => {
    const pkg = makePkg({ files: { 'src/Comp.tsx': 'export const C = () => null' } })
    expect(classifyNonVitestPackage(pkg)).toEqual({ kind: 'unwired', sources: 1 })
  })

  it('finds source nested arbitrarily deep', () => {
    const pkg = makePkg({ files: { 'src/a/b/c/deep.ts': 'export const d = 1' } })
    expect(classifyNonVitestPackage(pkg)).toEqual({ kind: 'unwired', sources: 1 })
  })

  it('ignores a nested node_modules', () => {
    const pkg = makePkg({
      files: { 'src/node_modules/dep/index.ts': 'export const x = 1' },
    })
    expect(classifyNonVitestPackage(pkg)).toEqual({ kind: 'no-js', sources: 0 })
  })
})

describe('the real workspace', () => {
  const REPO_ROOT = join(import.meta.dirname, '../../../../..')

  it('classifies the four Swift/Kotlin source packages as no-js', () => {
    for (const p of [
      'packages/native/runtime-swift',
      'packages/native/runtime-kotlin',
      'packages/native/router-swift',
      'packages/native/router-kotlin',
    ]) {
      expect(classifyNonVitestPackage(join(REPO_ROOT, p)), p).toEqual({ kind: 'no-js', sources: 0 })
    }
  })

  it('classifies ordinary framework packages as vitest packages', () => {
    for (const p of ['packages/core/core', 'packages/core/reactivity', 'packages/zero/zero']) {
      expect(classifyNonVitestPackage(join(REPO_ROOT, p)), p).toEqual({ kind: 'vitest' })
    }
  })

  /**
   * Packages that ship TypeScript with no vitest config, and the reason.
   *
   * This is a VISIBLE-DEBT list, not a filter. The sweep below would otherwise
   * be a one-directional check — it can only fail when a NEW package appears,
   * and the honest thing is to also name the ones already in that state.
   */
  const UNWIRED_KNOWN: Record<string, string> = {
    'internals/playwright-config': [
      '147 LOC behind the root playwright.config.ts and every e2e-configs/*.config.ts,',
      'with no `test` script at all. It is verified INDIRECTLY and quite strongly —',
      'a broken `definePlaywrightConfig` fails to boot every e2e suite in the repo —',
      'but it is measured by nothing, and its exact sibling @pyreon/vitest-config',
      '(same role for the other runner) carries a suite and is gated at 95/95.',
      'Tracked as a real gap, not a design decision.',
    ].join(' '),
  }

  it('finds no NEW unwired package, and the known ones are still unwired', () => {
    // The sweep that catches a package shipping JS with no suite wired. A
    // failure here names a real hole rather than a stale expectation.
    const unwired: string[] = []
    for (const cat of readdirSync(join(REPO_ROOT, 'packages'))) {
      const catDir = join(REPO_ROOT, 'packages', cat)
      if (!statSync(catDir).isDirectory()) continue
      for (const p of readdirSync(catDir)) {
        const pkgDir = join(catDir, p)
        if (!existsSync(join(pkgDir, 'package.json'))) continue
        if (classifyNonVitestPackage(pkgDir).kind === 'unwired') unwired.push(`${cat}/${p}`)
      }
    }
    const known = Object.keys(UNWIRED_KNOWN).sort()
    const unexpected = unwired.filter((p) => !(p in UNWIRED_KNOWN))
    expect(
      unexpected,
      `packages shipping TypeScript with no vitest.config.ts: ${unexpected.join(', ')}`,
    ).toEqual([])

    // The other direction: an entry that has since been wired up must be
    // REMOVED, or this list rots into a place where a tested package hides.
    expect(unwired.sort(), 'a UNWIRED_KNOWN entry is stale — remove it').toEqual(known)
  })
})
