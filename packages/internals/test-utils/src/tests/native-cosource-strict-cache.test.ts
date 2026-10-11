/** @vitest-environment node */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../../../../..')
const bun = execFileSync('bun', ['-p', 'process.execPath'], { encoding: 'utf8' }).trim()

// Execute the REAL gate and verdict cache in a tiny independent package tree.
// Tool shims only model a compiler present with no runnable JVM; the child
// verifier emits the same documented skip marker as the production verifier.
// This is a runner/cache contract test, not evidence of native compilation.
function fixture(grouped: boolean, hasTest = true) {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-cosource-strict-'))
  const write = (path: string, text: string, mode?: number): void => {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, text, mode === undefined ? undefined : { mode })
  }
  const copy = (path: string): void => {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(ROOT, path), target)
  }
  copy('scripts/check-native-cosource.ts')
  copy('scripts/swift-cosource-smoke.ts')
  const harness = 'packages/native/runtime-kotlin/scripts'
  copy(`${harness}/verdict-cache.ts`)
  copy(`${harness}/smoke-marker.ts`)
  write(
    `${harness}/verify-kotlin.ts`,
    `
import { appendFileSync } from 'node:fs'
import { SMOKE_SKIPPED_MARKER } from './smoke-marker'
appendFileSync(process.env.FIXTURE_CALLS!, 'verified\\n')
console.log(process.argv.includes('--typecheck-only') ? 'typecheck only' : SMOKE_SKIPPED_MARKER)
`,
  )
  const pkg = 'packages/fundamentals/fixture'
  write(
    `${pkg}/package.json`,
    JSON.stringify({
      name: '@fixture/runtime',
      pyreon: {
        native: {
          kotlin: 'native/kotlin',
          ...(grouped ? { kotlinServices: { PyreonFixture: ['PyreonFixture.kt'] } } : {}),
        },
      },
    }),
  )
  write(`${pkg}/native/kotlin/com/pyreon/runtime/PyreonFixture.kt`, 'class PyreonFixture')
  if (hasTest) write(`${pkg}/native/tests/PyreonFixtureTest.kt`, 'fun main() {}')
  write('bin/kotlinc', '#!/bin/sh\nprintf "fixture kotlinc\\n"\n', 0o755)
  write('bin/java', '#!/bin/sh\nexit 1\n', 0o755)
  symlinkSync(bun, join(root, 'bin/bun'))
  const cache = join(root, 'cache')
  const calls = join(root, 'calls')
  const run = (strict: boolean) =>
    spawnSync(bun, [join(root, 'scripts/check-native-cosource.ts')], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: join(root, 'bin'),
        PYREON_REQUIRE_NATIVE_VALIDATE: strict ? '1' : '0',
        PYREON_VALIDATE_CACHE_DIR: cache,
        PYREON_VALIDATE_NO_CACHE: '0',
        FIXTURE_CALLS: calls,
      },
      timeout: 10_000,
    })
  return { root, cache, run, calls: () => (existsSync(calls) ? readFileSync(calls, 'utf8') : '') }
}

for (const grouped of [false, true]) {
  describe(grouped ? 'per-service Kotlin cache' : 'whole-directory Kotlin cache', () => {
    it('rejects a warm compile-only success in strict mode before accepting the cache', () => {
      const f = fixture(grouped)
      try {
        const first = f.run(false)
        expect(first.status, first.stderr).toBe(0)
        expect(first.stdout).toContain('smoke SKIPPED')
        expect(f.calls()).toBe('verified\n')
        expect(readdirSync(join(f.cache, 'kotlin-runtime'))).toHaveLength(1)
        const warm = f.run(false)
        expect(warm.status, warm.stderr).toBe(0)
        expect(warm.stdout).toContain('cached verdict')
        expect(f.calls()).toBe('verified\n')
        const strict = f.run(true)
        expect(strict.status).toBe(1)
        expect(strict.stderr).toContain('no working JDK')
        expect(strict.stderr).toContain('PYREON_REQUIRE_NATIVE_VALIDATE=1')
        expect(strict.stdout).not.toContain('cached verdict')
        expect(warm.stdout).toContain('smoke SKIPPED')
        expect(f.calls()).toBe('verified\n')
      } finally {
        rmSync(f.root, { recursive: true, force: true })
      }
    })

    it('still permits declared typecheck-only tasks without a JVM', () => {
      const f = fixture(grouped, false)
      try {
        expect(f.run(true).status).toBe(0)
        const warm = f.run(true)
        expect(warm.status, warm.stderr).toBe(0)
        expect(warm.stdout).toContain('cached verdict')
        expect(f.calls()).toBe('verified\n')
      } finally {
        rmSync(f.root, { recursive: true, force: true })
      }
    })
  })
}

it('missing kotlinc is an explicit non-strict skip and a strict failure, even with a warm cache', () => {
  const f = fixture(false)
  try {
    expect(f.run(false).status).toBe(0)
    unlinkSync(join(f.root, 'bin/kotlinc'))
    const loose = f.run(false)
    expect(loose.status, loose.stderr).toBe(0)
    expect(loose.stdout).toContain('kotlinc absent — skipped')
    const strict = f.run(true)
    expect(strict.status).toBe(1)
    expect(strict.stderr).toContain('kotlinc absent')
    expect(strict.stdout).not.toContain('cached verdict')
    expect(f.calls()).toBe('verified\n')
  } finally {
    rmSync(f.root, { recursive: true, force: true })
  }
})
