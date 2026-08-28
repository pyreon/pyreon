/**
 * Compile an emit against the REAL iOS SDK and the REAL runtime sources.
 *
 * Every other Swift gate substitutes stubs for `PyreonRuntime` / `PyreonRouter`,
 * which is what lets them run on Linux — and is also the one place where
 * declaring something can hide its absence. `<Audio>` emitted
 * `AVFoundationAudioEngine()`; that type existed only in `swift-stubs.ts`, so
 * the primitive passed every gate and could not have compiled anywhere. Its
 * Kotlin counterparts were stub-only too. It was found by doing exactly this by
 * hand, and the point of this file is that nobody has to think to do it again.
 *
 * `emitted-runtime-types-exist.test.ts` is the cheap always-on version and
 * catches a MISSING type. This catches the rest: a type that exists with the
 * wrong signature, a modifier the real SwiftUI does not accept, an availability
 * annotation that does not hold — none of which a name check can see.
 *
 * macOS + Xcode only, so it runs on the macOS CI job and locally, and skips
 * elsewhere rather than failing. ~8s for 60-odd runtime sources.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftUIAvailable } from '../validate'

const REPO = resolve(import.meta.dirname, '../../../../..')

/** Every Swift file the runtime actually ships. */
const runtimeSwiftSources = (): string[] => {
  const roots = [
    join(REPO, 'packages/fundamentals'),
    join(REPO, 'packages/core'),
    join(REPO, 'packages/native/runtime-swift'),
    join(REPO, 'packages/native/router-swift'),
  ]
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const e of entries) {
      // `Package.swift` is an SPM MANIFEST, not runtime source — two of them
      // collide on filename and swiftc refuses the whole compile.
      //
      // Test sources are excluded because they are not shipped, and because a
      // fixture type is free to take an ordinary name: `PyreonTableStateTests`
      // declares `Row`, which collides with the `Row` an app's own table code
      // declares and fails the whole compile with `invalid redeclaration`. The
      // first cut excluded only a directory literally named `Tests`, and the
      // real one is lowercase `tests` — so the corpus quietly contained test
      // fixtures and this gate was one name collision away from false-failing.
      // Matched case-insensitively, plus the `*Tests.swift` file convention.
      if (e === 'node_modules' || e === 'lib' || e === '.build') continue
      if (e === 'Package.swift') continue
      if (e.toLowerCase() === 'tests' || /Tests?\.swift$/.test(e)) continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.swift')) out.push(p)
    }
  }
  roots.forEach(walk)
  return out
}

const sdkPath = (): string =>
  execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], {
    encoding: 'utf8',
  }).trim()

describe.runIf(isSwiftUIAvailable())('emit compiles against the real SDK + real runtime', () => {
  const sources = runtimeSwiftSources()

  it('finds the runtime sources', () => {
    // An empty list would make the compile below vacuously succeed, which is
    // the failure mode this whole file exists to close.
    expect(sources.length).toBeGreaterThan(40)
  })

  it('every primitive, every newly-lowered prop, typechecks with no stubs', () => {
    const fixture = readFileSync(
      join(import.meta.dirname, '../fixtures/every-primitive.tsx'),
      'utf8',
    )
    const { code, warnings } = transform(fixture, { target: 'swift' })
    // A warning here would mean the fixture drifted out of the supported
    // subset, which makes the compile prove less than it appears to.
    expect(warnings).toEqual([])

    const dir = mkdtempSync(join(tmpdir(), 'pyreon-real-runtime-'))
    try {
      const appPath = join(dir, 'ProbeApp.swift')
      // The CLI adds these; the raw emit carries no imports.
      writeFileSync(appPath, `import SwiftUI\nimport Foundation\n${code}`, 'utf8')
      execFileSync(
        'xcrun',
        [
          '--sdk',
          'iphonesimulator',
          'swiftc',
          '-typecheck',
          '-target',
          'arm64-apple-ios17.0-simulator',
          '-sdk',
          sdkPath(),
          appPath,
          ...sources,
        ],
        { encoding: 'utf8', stdio: 'pipe' },
      )
    } catch (err) {
      const e = err as { stderr?: string | Buffer; stdout?: string | Buffer }
      const out = [e.stderr, e.stdout]
        .map((x) => (typeof x === 'string' ? x : x?.toString('utf8')) ?? '')
        .join('\n')
      const errors = out
        .split('\n')
        .filter((l) => l.includes('error:'))
        .slice(0, 12)
        .join('\n')
      expect.fail(`swiftc -typecheck failed against the real runtime:\n${errors}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 180_000)
})

/**
 * The same question at PACKAGE level.
 *
 * `check-native-coverage`'s REGISTRY carries a correct-usage snippet per
 * crossing package — `defineStore`, `useQuery<T>`, `useForm`, `PyreonTableState`
 * and the rest. Those snippets are transformed and checked for warnings, and
 * (elsewhere) typechecked against STUBS. Neither answers whether the runtime
 * types they name actually exist with the signatures the emit uses, which is
 * exactly how `<Audio>` shipped referencing three types that lived only in
 * stubs.
 *
 * One compile, all 37 snippets, against the real SDK with the real runtime
 * linked in.
 */
describe.runIf(isSwiftUIAvailable())('every package snippet compiles against the real runtime', () => {
  const sources = runtimeSwiftSources()

  /**
   * Top-level declarations in an emitted snippet. Used ONLY to find names two
   * snippets both declare, so the batch below can rename them apart.
   *
   * The keyword list must stay COMPLETE: the first cut matched only
   * `struct|enum|class|func` and missed a top-level `let`, so two schema
   * snippets both declared `Signup` and the whole batch died on `invalid
   * redeclaration` — a failure that looks like a product bug and isn't.
   */
  const declaredNames = (code: string): string[] =>
    [
      ...code.matchAll(
        /^(?:public\s+|private\s+|internal\s+)?(?:struct|enum|class|func|protocol|typealias|actor|let|var)\s+(\w+)/gm,
      ),
    ].map((m) => m[1]!)

  const compile = (files: string[]): string | null => {
    try {
      execFileSync(
        'xcrun',
        [
          '--sdk', 'iphonesimulator', 'swiftc', '-typecheck',
          '-target', 'arm64-apple-ios17.0-simulator',
          '-sdk', sdkPath(), ...files, ...sources,
        ],
        { encoding: 'utf8', stdio: 'pipe' },
      )
      return null
    } catch (err) {
      const e = err as { stderr?: string | Buffer; stdout?: string | Buffer }
      return [e.stderr, e.stdout]
        .map((x) => (typeof x === 'string' ? x : x?.toString('utf8')) ?? '')
        .join('\n')
    }
  }

  it('all of them', async () => {
    const { REGISTRY } = (await import(
      resolve(REPO, 'scripts/check-native-coverage.ts')
    )) as { REGISTRY: { name: string; snippet?: string }[] }
    const withSnippet = REGISTRY.filter((e) => typeof e.snippet === 'string')
    // A registry that stopped carrying snippets would make this vacuous.
    expect(withSnippet.length).toBeGreaterThan(20)

    const emits = withSnippet.map((e) => ({
      name: e.name,
      code: transform(e.snippet!, { target: 'swift' }).code,
    }))

    // Names declared by MORE THAN ONE snippet. Every snippet's root component
    // is `C`, so this is never empty.
    const seen = new Map<string, number>()
    for (const e of emits) {
      for (const n of new Set(declaredNames(e.code))) seen.set(n, (seen.get(n) ?? 0) + 1)
    }
    const shared = new Set([...seen].filter(([, v]) => v > 1).map(([k]) => k))

    const dir = mkdtempSync(join(tmpdir(), 'pyreon-pkg-runtime-'))
    try {
      // ONE compile for all of them. The per-snippet marginal cost is ~0.1s;
      // the ~9s of SDK + 63 runtime files is FIXED, and compiling each snippet
      // separately paid that fixed cost 37 times. Measured 350s serial vs 14s
      // batched — the serial form is what pushed the macOS real-SDK job past
      // its 60-minute cap and got it CANCELLED (which reads as a failure).
      //
      // Snippets share a module here, matching how a real app consumes these
      // sources (xcodegen adds them as `sources:` paths, i.e. same module, so
      // internal visibility applies). That is why this is a batch and not a
      // prebuilt .swiftmodule: a module boundary would hide every non-public
      // type and report false failures.
      const files = emits.map((e, i) => {
        let code = e.code
        for (const n of shared) code = code.replace(new RegExp(`\\b${n}\\b`, 'g'), `${n}_s${i}`)
        const p = join(dir, `Snippet${i}.swift`)
        writeFileSync(p, `import SwiftUI\nimport Foundation\n${code}`, 'utf8')
        return p
      })

      const batch = compile(files)
      if (batch === null) return

      // Something is genuinely broken. Re-compile snippet-by-snippet so the
      // failure names the PACKAGE — a batch error cites `Snippet12.swift`,
      // which tells nobody which package to fix. Slow, but only ever reached
      // on a red run.
      const failures: string[] = []
      for (const [i, e] of emits.entries()) {
        const one = join(dir, `Only${i}.swift`)
        writeFileSync(one, `import SwiftUI\nimport Foundation\n${e.code}`, 'utf8')
        const out = compile([one])
        if (out === null) continue
        const first = out.split('\n').filter((l) => l.includes('error:'))[0] ?? '?'
        failures.push(`${e.name}: ${first.replace(/^.*error: /, '')}`)
      }
      // A batch that fails while every snippet passes alone means the batch
      // itself is at fault (a rename that missed a collision), not a package.
      // Say so rather than reporting a green list.
      if (failures.length === 0) {
        const first = batch.split('\n').filter((l) => l.includes('error:'))[0] ?? '?'
        failures.push(`batch-only failure (every snippet passes alone): ${first}`)
      }
      expect(failures).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 900_000)
})
