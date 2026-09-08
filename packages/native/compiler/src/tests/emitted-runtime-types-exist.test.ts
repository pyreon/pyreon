/**
 * A type the emit NAMES must exist in the real runtime, not only in a stub.
 *
 * The validation stubs exist so an emit can be typechecked with no Apple/Android
 * SDK. That makes them the one place where declaring something can hide its
 * absence: `<Audio>` emitted `PyreonAudioPlayer(url: …, engine:
 * AVFoundationAudioEngine())` on iOS and
 * `PyreonAudioPlayer(url = …, engine = Media3AudioEngine(…))` on Android, and
 * ALL THREE of those names existed only in the stubs. The primitive had never
 * built on either platform, and both gates were green the whole time. No
 * example uses `<Audio>`, so the device gates — the only configuration without
 * stubs — never had occasion to disagree.
 *
 * Found by typechecking a probe app against the real iOS SDK with the runtime
 * sources compiled in. This test is the cheap, always-on version of that: for
 * every Pyreon-owned type the stubs declare AND an emitter emits, assert the
 * real co-located runtime defines it too.
 *
 * Scoped to Pyreon-owned names (`Pyreon*`, plus the two engine types the emit
 * names by hand). Framework mirrors — `VStack`, `Column`, `AsyncImage` — are
 * SUPPOSED to exist only in the stubs; they are the SDK, not our runtime.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '..')
const REPO = resolve(SRC, '../../../..')

/** Pyreon-owned runtime types. Anything else in a stub is an SDK mirror. */
const OWNED = /^(Pyreon[A-Za-z0-9]*|Media3AudioEngine|AVFoundationAudioEngine)$/

const declaredIn = (file: string): Set<string> => {
  const text = readFileSync(join(SRC, file), 'utf8')
  const names = new Set<string>()
  for (const m of text.matchAll(
    /\b(?:public\s+)?(?:final\s+)?(?:class|struct|object|enum class|enum|interface|protocol|fun)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
  )) {
    if (OWNED.test(m[1]!)) names.add(m[1]!)
  }
  return names
}

/** Every native source file the runtime actually ships, both languages. */
const runtimeSources = (): string[] => {
  const roots = [
    join(REPO, 'packages/fundamentals'),
    join(REPO, 'packages/core'),
    join(REPO, 'packages/native/runtime-swift'),
    join(REPO, 'packages/native/runtime-kotlin'),
    join(REPO, 'packages/native/router-swift'),
    join(REPO, 'packages/native/router-kotlin'),
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
      if (e === 'node_modules' || e === 'lib' || e === 'build') continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.swift') || p.endsWith('.kt')) out.push(p)
    }
  }
  roots.forEach(walk)
  return out
}

describe('every Pyreon type the emit names exists in the real runtime', () => {
  const sources = runtimeSources()
  // Paired BY LANGUAGE. A combined corpus is not good enough: the first
  // version of this test searched both, so the Kotlin check found Swift's
  // `struct PyreonAudioPlayer` and passed while the Compose one genuinely did
  // not exist — the gate reproducing, at one remove, the cross-language
  // confusion it was written to catch.
  const corpusFor = (ext: '.swift' | '.kt'): string =>
    sources
      .filter((f) => f.endsWith(ext))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')

  it('finds the runtime sources at all', () => {
    // An empty corpus would make every assertion below vacuously pass — the
    // failure mode this whole file is about.
    expect(sources.length).toBeGreaterThan(50)
  })

  it('finds sources in BOTH languages', () => {
    expect(corpusFor('.swift').length).toBeGreaterThan(1000)
    expect(corpusFor('.kt').length).toBeGreaterThan(1000)
  })

  // Every source file that can WRITE a Pyreon-owned type name into generated
  // code — not just the two main emitters. The scan read `emit-swift.ts` /
  // `emit-kotlin.ts` alone, so a name emitted only from a host lowering
  // (`chart-hosts.ts`), a style/token emitter (`emit-style.ts`,
  // `emit-tokens.ts`, `emit-rocketstyle.ts`), the primitive tables
  // (`canonical-primitives.ts`), the chart struct table
  // (`chart-engine-structs.ts`) or the flow lowering (`flow-lowering.ts`) was
  // never checked against the runtime at all.
  //
  // Nothing is currently missed through the added files — every name they
  // carry also appears in one of the two main emitters today, which is
  // exactly what makes this a latent hole rather than a live bug: move one
  // name into a host callback and the check goes silent with no test failing.
  // Both language rows read the SAME list because most of these files are
  // target-agnostic; the by-language pairing that matters is the `ext`-keyed
  // runtime CORPUS, which is unchanged (see the corpusFor rationale above).
  const EMITTERS = [
    'emit-swift.ts',
    'emit-kotlin.ts',
    'canonical-primitives.ts',
    'chart-hosts.ts',
    'chart-engine-structs.ts',
    'flow-lowering.ts',
    'emit-style.ts',
    'emit-tokens.ts',
    'emit-rocketstyle.ts',
  ] as const

  it('every scanned emitter file exists (an unreadable path would silently narrow the scan)', () => {
    for (const f of EMITTERS) expect(existsSync(join(SRC, f)), f).toBe(true)
  })

  it.each([
    ['swift-stubs.ts', '.swift'],
    ['kotlin-stubs.ts', '.kt'],
  ] as const)(
    '%s declares nothing Pyreon-owned that any emitter writes and the runtime lacks',
    (stubFile, ext) => {
    const corpus = corpusFor(ext)
    const emit = EMITTERS.map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n')
    const missing: string[] = []
    for (const name of declaredIn(stubFile)) {
      // Only the ones an emitter actually writes into generated code. A stub
      // may legitimately declare a helper no emit names.
      if (!emit.includes(name)) continue
      // The runtime must DECLARE it, not merely mention it.
      const declares = new RegExp(
        `\\b(?:class|struct|object|enum class|enum|interface|protocol|fun)\\s+${name}\\b`,
      )
      if (!declares.test(corpus)) missing.push(name)
    }
    expect(missing.sort()).toEqual([])
    },
  )
})
