// The real-SDK + real-runtime typecheck helper goes through the verdict cache.
// What that must never do is replay a verdict for a DIFFERENT input, so the
// key contract is locked here without a toolchain, and the replay itself is
// proven against a real `swiftc` where the SwiftUI SDK exists.

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isSwiftUIAvailable } from '../validate'
import { _resetValidateCache } from '../validate-cache'
import {
  realRuntimeKeyParts,
  runtimeSwiftSources,
  swiftErrorLines,
  typecheckAgainstRealRuntime,
} from './real-runtime-swift'

let repo: string
const put = (rel: string, text: string): string => {
  const p = join(repo, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, text, 'utf8')
  return p
}

/** A stand-in runtime: more than 40 files, each declaring one type. */
const fakeRuntime = (): string[] => {
  for (let i = 0; i < 41; i++)
    put(
      `packages/native/runtime-swift/Sources/PyreonRuntime/R${i}.swift`,
      `struct R${i} { let v = ${i} }\n`,
    )
  return runtimeSwiftSources(repo)
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'pyreon-real-runtime-helper-'))
})
afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('runtimeSwiftSources', () => {
  it('collects shipped sources from every root, sorted, and nothing else', () => {
    put('packages/native/runtime-swift/Sources/PyreonRuntime/B.swift', '')
    put('packages/native/router-swift/Sources/PyreonRouter/A.swift', '')
    put('packages/fundamentals/flow/native/swift/Flow.swift', '')
    put('packages/core/primitives/native/swift/P.swift', '')
    // Not runtime source: manifests, tests (either spelling), build output, deps.
    put('packages/native/runtime-swift/Package.swift', '')
    put('packages/native/runtime-swift/Tests/PyreonRuntimeTests/T.swift', '')
    put('packages/fundamentals/table/native/swift/tests/Fixture.swift', '')
    put('packages/fundamentals/table/native/swift/PyreonTableStateTests.swift', '')
    put('packages/fundamentals/flow/node_modules/x/X.swift', '')
    put('packages/fundamentals/flow/lib/L.swift', '')
    put('packages/native/runtime-swift/.build/B.swift', '')
    put('packages/zero/zero/native/swift/Outside.swift', '')

    expect(runtimeSwiftSources(repo).map((p) => p.slice(repo.length + 1))).toEqual([
      'packages/core/primitives/native/swift/P.swift',
      'packages/fundamentals/flow/native/swift/Flow.swift',
      'packages/native/router-swift/Sources/PyreonRouter/A.swift',
      'packages/native/runtime-swift/Sources/PyreonRuntime/B.swift',
    ])
  })
})

describe('the verdict key', () => {
  const app = [{ name: 'App.swift', code: 'struct App {}' }]

  it('is stable for identical inputs and independent of where the repo is checked out', () => {
    const a = realRuntimeKeyParts(app, fakeRuntime(), repo, false)
    expect(realRuntimeKeyParts(app, runtimeSwiftSources(repo), repo, false)).toEqual(a)

    const first = repo
    repo = mkdtempSync(join(tmpdir(), 'pyreon-real-runtime-helper-'))
    try {
      expect(realRuntimeKeyParts(app, fakeRuntime(), repo, false)).toEqual(a)
    } finally {
      rmSync(first, { recursive: true, force: true })
    }
  })

  it('moves when a runtime source changes content, is renamed, or is added', () => {
    const sources = fakeRuntime()
    const base = realRuntimeKeyParts(app, sources, repo, false).stubs

    writeFileSync(sources[0]!, 'struct R0 { let v = 999 }\n', 'utf8')
    const edited = realRuntimeKeyParts(app, sources, repo, false).stubs
    expect(edited).not.toBe(base)

    const added = put('packages/native/runtime-swift/Sources/PyreonRuntime/Zz.swift', '')
    expect(realRuntimeKeyParts(app, [...sources, added], repo, false).stubs).not.toBe(edited)
    // Same bytes under another path: a moved file can change what collides.
    const moved = put('packages/native/runtime-swift/Sources/PyreonRuntime/Zy.swift', '')
    expect(realRuntimeKeyParts(app, [...sources, moved], repo, false).stubs).not.toBe(
      realRuntimeKeyParts(app, [...sources, added], repo, false).stubs,
    )
  })

  it('moves when an emitted file changes content or name, or the module cache mode changes', () => {
    const sources = fakeRuntime()
    const base = realRuntimeKeyParts(app, sources, repo, false)
    const of = (files: { name: string; code: string }[], isolated = false) =>
      realRuntimeKeyParts(files, sources, repo, isolated)

    expect(of([{ name: 'App.swift', code: 'struct App { }' }]).source).not.toBe(base.source)
    expect(of([{ name: 'Other.swift', code: 'struct App {}' }]).source).not.toBe(base.source)
    expect(of(app, true).source).not.toBe(base.source)
    // The runtime slot is untouched by the emit.
    expect(of([{ name: 'Other.swift', code: 'x' }]).stubs).toBe(base.stubs)
    // Two files are not the same input as their concatenation.
    expect(
      of([
        { name: 'A.swift', code: 'a' },
        { name: 'B.swift', code: 'b' },
      ]).source,
    ).not.toBe(of([{ name: 'A.swift', code: 'a\0B.swift\0b' }]).source)
  })
})

describe('typecheckAgainstRealRuntime', () => {
  it('refuses a runtime corpus too small to prove anything, before any compile', () => {
    put('packages/native/runtime-swift/Sources/PyreonRuntime/Only.swift', '')
    const out = typecheckAgainstRealRuntime([{ name: 'App.swift', code: '' }], { repo })
    expect(out).toContain('[Pyreon] only 1 runtime Swift sources found')
  })

  it('swiftErrorLines keeps the compiler error lines, capped', () => {
    const text = [
      'a.swift:1:1: error: one',
      'note: n',
      'b.swift:2:2: error: two',
      'c: error: three',
    ].join('\n')
    expect(swiftErrorLines(text, 2)).toBe('a.swift:1:1: error: one\nb.swift:2:2: error: two')
  })
})

describe.runIf(isSwiftUIAvailable())('verdict replay against a real swiftc', () => {
  const env = { ...process.env }
  let cache: string
  beforeEach(() => {
    cache = mkdtempSync(join(tmpdir(), 'pyreon-real-runtime-cache-'))
    process.env.PYREON_VALIDATE_CACHE_DIR = cache
    delete process.env.PYREON_VALIDATE_NO_CACHE
    _resetValidateCache()
  })
  afterEach(() => {
    process.env = { ...env }
    _resetValidateCache()
    rmSync(cache, { recursive: true, force: true })
  })

  const verdicts = (): string[] => readdirSync(cache).filter((f) => /^[a-f0-9]{64}\.json$/.test(f))
  /** Run with no PATH: `xcrun` cannot start, so only a cached verdict can answer. */
  const withoutToolchain = <T>(fn: () => T): T => {
    const path = process.env.PATH
    process.env.PATH = ''
    try {
      return fn()
    } finally {
      process.env.PATH = path
    }
  }

  it('compiles the emit WITH the runtime, and replays acceptance and rejection alike', () => {
    const sources = fakeRuntime()
    // Reads a runtime type: accepted only if the runtime is in the module.
    const good = [
      {
        name: 'App.swift',
        code: 'struct App: View { var body: some View { Text("\\(R7().v)") } }',
      },
    ]
    const bad = [{ name: 'App.swift', code: 'struct App { let n: Int = R7().missing }' }]

    expect(typecheckAgainstRealRuntime(good, { sources, repo })).toBeNull()
    const rejected = typecheckAgainstRealRuntime(bad, { sources, repo })
    expect(rejected).toContain("error: value of type 'R7' has no member 'missing'")
    expect(verdicts()).toHaveLength(2)

    _resetValidateCache() // drop the in-process memo: the disk store must answer
    process.env.PYREON_VALIDATE_CACHE_DIR = cache
    withoutToolchain(() => {
      expect(typecheckAgainstRealRuntime(good, { sources, repo })).toBeNull()
      expect(typecheckAgainstRealRuntime(bad, { sources, repo })).toBe(rejected)
    })
  }, 300_000)

  it('a runtime edit misses the cache, and a compiler that never ran is not stored', () => {
    const sources = fakeRuntime()
    const app = [{ name: 'App.swift', code: 'struct App { let n: Int = R7().v }' }]
    expect(typecheckAgainstRealRuntime(app, { sources, repo })).toBeNull()
    expect(verdicts()).toHaveLength(1)

    // The runtime no longer has what the emit reads. A stale replay would say ok.
    writeFileSync(
      sources.find((p) => p.endsWith('/R7.swift'))!,
      'struct R7 {}\n',
      'utf8',
    )
    const unanswered = withoutToolchain(() => typecheckAgainstRealRuntime(app, { sources, repo }))
    expect(unanswered).not.toBeNull()
    expect(unanswered).not.toContain('error:')
    expect(verdicts()).toHaveLength(1)

    expect(typecheckAgainstRealRuntime(app, { sources, repo })).toContain("has no member 'v'")
    expect(verdicts()).toHaveLength(2)
  }, 300_000)

  it('PYREON_VALIDATE_NO_CACHE=1 (the nightly) compiles every time and stores nothing', () => {
    process.env.PYREON_VALIDATE_NO_CACHE = '1'
    const sources = fakeRuntime()
    const app = [{ name: 'App.swift', code: 'struct App {}' }]
    expect(typecheckAgainstRealRuntime(app, { sources, repo })).toBeNull()
    expect(verdicts()).toHaveLength(0)
    expect(
      withoutToolchain(() => typecheckAgainstRealRuntime(app, { sources, repo })),
    ).not.toBeNull()
  }, 300_000)
})
