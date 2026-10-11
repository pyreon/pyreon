/** @vitest-environment node */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verdictKey } from '../../../../native/runtime-kotlin/scripts/verdict-cache'

const ROOT = resolve(import.meta.dirname, '../../../../..')
const bun = execFileSync('bun', ['-p', 'process.execPath'], { encoding: 'utf8' }).trim()

// Both runners and the cache are production code. Only the toolchain is a
// shim: these tests prove execution/cache contracts, not native compilation.
function fixture(service = 'PyreonFixture') {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-verify-all-strict-'))
  const scripts = join(root, 'scripts')
  const bin = join(root, 'bin')
  mkdirSync(scripts)
  mkdirSync(bin)
  for (const file of [
    'verify-all.ts',
    'verify-kotlin.ts',
    'services.ts',
    'verdict-cache.ts',
    'smoke-marker.ts',
  ]) {
    copyFileSync(join(ROOT, 'packages/native/runtime-kotlin/scripts', file), join(scripts, file))
  }
  for (const kind of ['main', 'test'])
    mkdirSync(join(root, `src/${kind}/kotlin/com/pyreon/runtime`), { recursive: true })
  const source = `class ${service}`
  const test = 'fun main() {}'
  writeFileSync(join(root, `src/main/kotlin/com/pyreon/runtime/${service}.kt`), source)
  writeFileSync(join(root, `src/test/kotlin/com/pyreon/runtime/${service}Test.kt`), test)
  writeFileSync(
    join(bin, 'kotlinc'),
    `#!/bin/sh
if [ "$1" = '-version' ]; then
  printf 'fixture kotlin\n'
  exit "\${FIXTURE_COMPILER_EXIT:-0}"
fi
printf 'compiled\n' >> "$FIXTURE_COMPILES"
`,
    { mode: 0o755 },
  )
  writeFileSync(
    join(bin, 'java'),
    `#!/bin/sh
if [ "$1" = '-version' ]; then
  if [ "\${FIXTURE_JAVA_CHILD_SKIP:-0}" = '1' ]; then
    if [ -f "$FIXTURE_PROBED" ]; then exit 1; fi
    printf 'probed\n' > "$FIXTURE_PROBED"
  fi
  exit "\${FIXTURE_JAVA_EXIT:-0}"
fi
printf 'ran\n' >> "$FIXTURE_SMOKES"
exit "\${FIXTURE_SMOKE_EXIT:-0}"
`,
    { mode: 0o755 },
  )
  symlinkSync(bun, join(bin, 'bun'))
  symlinkSync('/bin/sh', join(bin, 'sh'))
  const cache = join(root, 'cache')
  const count = (name: string) => {
    const file = join(root, name)
    return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').length : 0
  }
  const run = (
    strict: boolean,
    java: boolean,
    extra: Record<string, string> = {},
    args: string[] = [],
  ) => {
    const result = spawnSync(bun, [join(scripts, 'verify-all.ts'), '--concurrency=1', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: bin,
        PYREON_REQUIRE_NATIVE_VALIDATE: strict ? '1' : '0',
        PYREON_VALIDATE_CACHE_DIR: cache,
        PYREON_VALIDATE_NO_CACHE: '0',
        FIXTURE_JAVA_EXIT: java ? '0' : '1',
        FIXTURE_COMPILES: join(root, 'compiles'),
        FIXTURE_SMOKES: join(root, 'smokes'),
        FIXTURE_PROBED: join(root, 'probed'),
        ...extra,
      },
      timeout: 10_000,
    })
    if (result.status === null) {
      throw new Error(
        JSON.stringify({
          signal: result.signal,
          error: result.error?.message,
          stdout: result.stdout,
          stderr: result.stderr,
        }),
      )
    }
    return result
  }
  const seedLegacy = () => {
    const key = verdictKey({
      compilerVersion: 'fixture kotlin',
      harness: readFileSync(join(scripts, 'verify-kotlin.ts'), 'utf8'),
      source,
      test,
      typecheckOnly: false,
    })
    mkdirSync(join(cache, 'kotlin-runtime'), { recursive: true })
    writeFileSync(join(cache, 'kotlin-runtime', `${key}.json`), '{"ok":true}')
  }
  return { root, bin, run, count, seedLegacy }
}

describe('Kotlin service runner cache honesty', () => {
  it('rejects strict validation before accepting a warm Java-less compile', () => {
    const f = fixture()
    try {
      const loose = f.run(false, false)
      expect(loose.status, loose.stderr).toBe(0)
      const warm = f.run(false, false)
      expect(warm.status, warm.stderr).toBe(0)
      expect(f.count('compiles')).toBe(1)
      const strict = f.run(true, false)
      expect(strict.status, strict.stdout).toBe(1)
      expect(strict.stderr).toContain('no working JDK')
      expect(strict.stderr).toContain('PYREON_REQUIRE_NATIVE_VALIDATE=1')
      expect(loose.stdout + loose.stderr).toContain('smoke SKIPPED')
      expect(warm.stdout + warm.stderr).toContain('smoke SKIPPED')
      expect(f.count('compiles')).toBe(1)
      expect(f.count('smokes')).toBe(0)
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })

  it('executes the smoke when a JDK becomes available, then reuses the full verdict', () => {
    const f = fixture()
    try {
      expect(f.run(false, false).status).toBe(0)
      const strict = f.run(true, true)
      expect(strict.status, strict.stderr).toBe(0)
      expect(f.count('compiles')).toBe(2)
      expect(f.count('smokes')).toBe(1)
      expect(f.run(true, true).status).toBe(0)
      expect(f.count('compiles')).toBe(2)
      expect(f.count('smokes')).toBe(1)
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })

  it('does not trust legacy full-mode records that never distinguished an unrun smoke', () => {
    const f = fixture()
    try {
      f.seedLegacy()
      const result = f.run(true, true)
      expect(result.status, result.stderr).toBe(0)
      expect(f.count('compiles')).toBe(1)
      expect(f.count('smokes')).toBe(1)
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })

  for (const declared of [false, true]) {
    it(`permits ${declared ? 'declared' : 'explicit'} typechecks without Java in strict mode`, () => {
      const f = fixture(declared ? 'PyreonJson' : 'PyreonFixture')
      try {
        const args = declared ? [] : ['--mode=typecheck']
        expect(f.run(true, false, {}, args).status).toBe(0)
        expect(f.run(true, false, {}, args).status).toBe(0)
        expect(f.count('compiles')).toBe(1)
        expect(f.count('smokes')).toBe(0)
      } finally {
        rmSync(f.root, { recursive: true, force: true })
      }
    })
  }

  it('fails strict validation for an absent compiler even with a cached full verdict', () => {
    const f = fixture()
    try {
      expect(f.run(true, true).status).toBe(0)
      unlinkSync(join(f.bin, 'kotlinc'))
      expect(f.run(false, true).status).toBe(0)
      const strict = f.run(true, true)
      expect(strict.status, strict.stdout).toBe(1)
      expect(strict.stderr).toContain('kotlinc')
      expect(strict.stderr).toContain('PYREON_REQUIRE_NATIVE_VALIDATE=1')
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })

  it('does not accept a cached verdict when the compiler probe fails', () => {
    const f = fixture()
    try {
      expect(f.run(true, true).status).toBe(0)
      const result = f.run(true, true, { FIXTURE_COMPILER_EXIT: '1' })
      expect(result.status, result.stdout).toBe(1)
      expect(result.stderr).toContain('kotlinc -version')
      expect(f.count('compiles')).toBe(1)
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })

  it('does not cache a child skip as a full pass when Java disappears after the probe', () => {
    const f = fixture()
    try {
      const skipped = f.run(false, true, { FIXTURE_JAVA_CHILD_SKIP: '1' })
      expect(skipped.status, skipped.stderr).toBe(0)
      expect(skipped.stdout + skipped.stderr).toContain('smoke SKIPPED')
      expect(f.count('smokes')).toBe(0)
      expect(f.run(true, true).status).toBe(0)
      expect(f.count('compiles')).toBe(2)
      expect(f.count('smokes')).toBe(1)
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })

  it('preserves a real smoke failure and never caches it as success', () => {
    const f = fixture()
    try {
      const failed = f.run(true, true, { FIXTURE_SMOKE_EXIT: '13' })
      expect(failed.status).toBe(1)
      expect(failed.stderr).toContain('smoke main() exited non-zero')
      expect(f.run(true, true).status).toBe(0)
      expect(f.count('compiles')).toBe(2)
      expect(f.count('smokes')).toBe(2)
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })
})
