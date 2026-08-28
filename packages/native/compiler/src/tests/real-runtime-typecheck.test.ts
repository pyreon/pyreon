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
      // collide on filename and swiftc refuses the whole compile. Test
      // directories are excluded for the same reason they are not shipped.
      if (e === 'node_modules' || e === 'lib' || e === '.build') continue
      if (e === 'Package.swift' || e === 'Tests') continue
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
