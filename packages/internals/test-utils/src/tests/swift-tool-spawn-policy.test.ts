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

describe('swift tool spawn policy', () => {
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
