// Every Swift toolchain spawn outside test code goes through
// `packages/native/compiler/src/swift-tool.ts`.
//
// The Swift driver leaves a `TemporaryDirectory.XXXXXX` in `$TMPDIR` on every
// invocation (even `swiftc --version`) and never removes it. The helper gives
// each spawn a private `TMPDIR` and deletes it afterwards; a raw
// `execFileSync('swiftc', …)` puts the driver's directory back in the shared
// temp dir, where about 7,000 had piled up on one machine.
//
// Test code is exempt: Vitest's global setup (`tmp-sandbox.ts` in
// `@pyreon/vitest-config`) already points `TMPDIR` at a per-run directory that
// it deletes, and every process a test spawns inherits it.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isTestPath } from '../../../../../scripts/test-paths'

const ROOT = resolve(import.meta.dirname, '../../../../..')
const HELPER = 'packages/native/compiler/src/swift-tool.ts'

/** A direct child_process call whose program is `swiftc` or `swift` (the call may span lines). */
const RAW_SWIFT_SPAWN =
  /\b(?:execFileSync|execFile|spawnSync|spawn|execSync|exec)\(\s*['"`](?:swiftc|swift|xcrun\s+swiftc)['"`\s]/g

/** 1-based line numbers of the raw spawns in `source`. */
function rawSwiftSpawns(source: string): number[] {
  return [...source.matchAll(RAW_SWIFT_SPAWN)].map(
    (m) => source.slice(0, m.index).split('\n').length,
  )
}

describe('rawSwiftSpawns', () => {
  it('flags a direct swiftc / swift spawn', () => {
    expect(rawSwiftSpawns(`execFileSync('swiftc', ['-parse', f])`)).toEqual([1])
    expect(rawSwiftSpawns(`x\nconst r = spawnSync("swift", ['package'])`)).toEqual([2])
    expect(rawSwiftSpawns('execSync(`swiftc -typecheck ${f}`)')).toEqual([1])
    expect(rawSwiftSpawns(`a\nb\nexecFileSync(\n  'swiftc',\n  ['-parse', f],\n)`)).toEqual([3])
  })

  it('allows the helper, other programs, and the word in prose', () => {
    expect(rawSwiftSpawns(`spawnSwiftToolSync('swiftc', ['-parse', f])`)).toEqual([])
    expect(rawSwiftSpawns(`execFileSync('xcrun', ['simctl', 'boot', id])`)).toEqual([])
    expect(rawSwiftSpawns(`spawnSync('swift-format', [])`)).toEqual([])
    expect(rawSwiftSpawns(`// swiftc -parse runs here`)).toEqual([])
  })
})

/**
 * A package.json script command that runs `swift` / `swiftc` (or
 * `xcrun swiftc`) itself, as a command word: at the start, or after a shell
 * separator or `then` / `else` / `do`. `bun …/swift-package.ts build` and a
 * word inside an `echo '…'` string are not matched.
 */
const RAW_SWIFT_SCRIPT =
  /(?:^|[;&|(]|\b(?:then|else|do)\b)\s*(?:(?:env\s+)?[A-Z_][A-Z0-9_]*=\S*\s+)*(?:xcrun\s+)?(?:swiftc|swift)(?=\s|$|[;&|)])/

/** `package.json` scripts (name → command) that run a Swift tool directly. */
function rawSwiftScripts(scripts: Record<string, string>): string[] {
  return Object.entries(scripts)
    .filter(([, cmd]) => RAW_SWIFT_SCRIPT.test(cmd))
    .map(([name]) => name)
}

describe('rawSwiftScripts', () => {
  it('flags a script that runs swift / swiftc directly', () => {
    expect(rawSwiftScripts({ build: 'swift build' })).toEqual(['build'])
    expect(rawSwiftScripts({ t: 'swiftc -typecheck a.swift' })).toEqual(['t'])
    expect(rawSwiftScripts({ t: 'xcrun swiftc -parse a.swift' })).toEqual(['t'])
    expect(rawSwiftScripts({ t: 'cd x && swift test' })).toEqual(['t'])
    expect(rawSwiftScripts({ t: 'FOO=1 swift build -c release' })).toEqual(['t'])
    expect(
      rawSwiftScripts({
        build:
          "if [ \"$(uname -s)\" = Darwin ] && command -v swift >/dev/null 2>&1; then swift build; else echo 'skip'; fi",
      }),
    ).toEqual(['build'])
  })

  it('allows the wrapper, other programs, and the word in prose', () => {
    expect(rawSwiftScripts({ build: 'bun ../../../scripts/swift-package.ts build' })).toEqual([])
    expect(rawSwiftScripts({ lint: 'swift-format lint -r Sources' })).toEqual([])
    expect(rawSwiftScripts({ lint: "echo '[x] swift lint not yet integrated'" })).toEqual([])
    expect(rawSwiftScripts({ build: 'vl_rolldown_build' })).toEqual([])
  })
})

describe('swift tool spawn policy', () => {
  it('no package.json script runs swift / swiftc except through scripts/swift-package.ts', () => {
    const manifests = execFileSync('git', ['ls-files', '-z', '--', '*package.json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\0')
      .filter((f) => f === 'package.json' || f.endsWith('/package.json'))
    expect(manifests.length).toBeGreaterThan(100)
    // The two SwiftPM packages must stay covered by the wrapper.
    expect(manifests).toContain('packages/native/runtime-swift/package.json')
    expect(manifests).toContain('packages/native/router-swift/package.json')
    const offenders = manifests.flatMap((f) => {
      const pkg: { scripts?: Record<string, string> } = JSON.parse(
        readFileSync(join(ROOT, f), 'utf8'),
      )

      return rawSwiftScripts(pkg.scripts ?? {}).map((name) => `${f} scripts.${name}`)
    })
    expect(
      offenders,
      'run SwiftPM through `bun <root>/scripts/swift-package.ts build|test|typecheck` (private TMPDIR, removed afterwards)',
    ).toEqual([])
  })


  it('no non-test source spawns swiftc / swift except through swift-tool.ts', () => {
    const files = execFileSync(
      'git',
      ['ls-files', '-z', '--', '*.ts', '*.tsx', '*.mts', '*.mjs', '*.js', '*.cjs'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      },
    )
      .split('\0')
      .filter((f) => f !== '' && f !== HELPER && !isTestPath(f) && !f.includes('/tests/'))
    expect(files.length).toBeGreaterThan(1000)
    const offenders = files.flatMap((f) =>
      rawSwiftSpawns(readFileSync(join(ROOT, f), 'utf8')).map((line) => `${f}:${line}`),
    )
    expect(
      offenders,
      `route these through ${HELPER} (execSwiftToolSync / spawnSwiftToolSync)`,
    ).toEqual([])
  })
})
