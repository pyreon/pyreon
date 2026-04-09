/**
 * Backend import regression tests.
 *
 * These tests spawn a REAL `bun` subprocess in a temporary
 * directory whose `tsconfig.json` has NO `jsxImportSource` set —
 * mimicking exactly what a Node.js / Bun backend looks like when
 * a developer adds `@pyreon/i18n` to their dependencies. The
 * subprocess attempts to import from `@pyreon/i18n` and asserts
 * the resolution succeeds without crashing.
 *
 * Why this exists: backends consuming `@pyreon/i18n` via the
 * `bun` export condition resolve to the package's source files
 * (`./src/index.ts`), which re-exports JSX components from
 * `trans.tsx`. Bun's on-the-fly TypeScript compiler reads the
 * **consuming project's** tsconfig — NOT this package's — to
 * decide which JSX runtime to use. Without a `jsxImportSource`
 * in the consumer's tsconfig, bun falls back to React's JSX
 * runtime, which doesn't exist on backends, and the import
 * crashes with `Cannot find module 'react/jsx-dev-runtime'`.
 *
 * Two defenses guard against this:
 *
 * 1. The framework-agnostic `@pyreon/i18n/core` subpath entry —
 *    no JSX, transitively only depends on `@pyreon/reactivity`.
 *    This is the recommended backend path.
 *
 * 2. A `/** @jsxImportSource @pyreon/core *​/` pragma at the top
 *    of `trans.tsx`. This per-file directive overrides the
 *    consumer's tsconfig, so bun's on-the-fly compiler picks
 *    the right JSX runtime even when the consumer is a backend.
 *    Defense-in-depth for users who import from the main entry
 *    without realizing the implications.
 *
 * These tests verify BOTH defenses end-to-end. If anyone removes
 * the pragma OR adds a JSX dependency to `/core`, the
 * corresponding test fails immediately at the subprocess level.
 *
 * The temporary fixture sets up a node_modules with workspace
 * symlinks pointing at the real package source, then runs `bun`
 * inside it. The fixture is created and torn down per test so
 * tests don't leak state.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

// The repo root contains all the workspace packages we need to
// link into the fixture's node_modules. Walk up from this test
// file: src/tests → src → i18n → fundamentals → packages → root.
const REPO_ROOT = resolve(__dirname, '../../../../..')
const I18N_PACKAGE = resolve(REPO_ROOT, 'packages/fundamentals/i18n')
const REACTIVITY_PACKAGE = resolve(REPO_ROOT, 'packages/core/reactivity')
const CORE_PACKAGE = resolve(REPO_ROOT, 'packages/core/core')

// Per-test fixture directory. Lives outside the package tree to
// avoid TypeScript include globs picking up the fixture's tsconfig.
let fixtureDir: string

beforeEach(() => {
  // Use a unique fixture per test so parallel runs don't collide.
  fixtureDir = resolve('/tmp', `pyreon-i18n-be-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(fixtureDir, { recursive: true })

  // Minimal package.json — bun needs ONE to recognize the dir.
  writeFileSync(
    resolve(fixtureDir, 'package.json'),
    JSON.stringify({
      name: 'i18n-be-test',
      type: 'module',
      private: true,
    }),
  )

  // tsconfig WITHOUT jsxImportSource — exactly what a fresh
  // Node.js backend project looks like.
  writeFileSync(
    resolve(fixtureDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2024',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['*.ts'],
      },
      null,
      2,
    ),
  )

  // Set up node_modules/@pyreon with symlinks to the real
  // workspace packages. This matches what `bun install` would
  // do for a real consumer with file: deps.
  const nodeModulesPyreon = resolve(fixtureDir, 'node_modules/@pyreon')
  mkdirSync(nodeModulesPyreon, { recursive: true })
  symlinkSync(I18N_PACKAGE, resolve(nodeModulesPyreon, 'i18n'))
  symlinkSync(REACTIVITY_PACKAGE, resolve(nodeModulesPyreon, 'reactivity'))
  symlinkSync(CORE_PACKAGE, resolve(nodeModulesPyreon, 'core'))
})

afterEach(() => {
  if (fixtureDir && existsSync(fixtureDir)) {
    rmSync(fixtureDir, { recursive: true, force: true })
  }
})

/**
 * Write a test script into the fixture and run it via `bun`.
 * Returns the exit code, stdout, and stderr so individual tests
 * can assert on the outcome. Fails the test runner with a clear
 * message if `bun` itself isn't available on the runner.
 */
function runInFixture(scriptName: string, scriptSource: string): {
  status: number | null
  stdout: string
  stderr: string
} {
  writeFileSync(resolve(fixtureDir, scriptName), scriptSource)
  const result = spawnSync('bun', ['run', scriptName], {
    cwd: fixtureDir,
    encoding: 'utf8',
    timeout: 30_000,
  })
  if (result.error) {
    throw new Error(
      `Failed to spawn 'bun' subprocess: ${result.error.message}. ` +
        `Backend import regression tests require bun on PATH.`,
    )
  }
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

describe('@pyreon/i18n — backend import regression', () => {
  it('@pyreon/i18n/core imports cleanly on a backend (no JSX in tsconfig)', () => {
    // The verified backend path. Imports only from /core, which
    // is JSX-free and only depends on @pyreon/reactivity.
    const result = runInFixture(
      'test-core.ts',
      `import { createI18n } from '@pyreon/i18n/core'
const i18n = createI18n({ locale: 'en', messages: { en: { hello: 'Hi {{name}}' } } })
const out = i18n.t('hello', { name: 'BE' })
if (out !== 'Hi BE') { console.error('expected "Hi BE", got:', out); process.exit(1) }
console.log('OK')
`,
    )
    expect(result.status, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
    expect(result.stdout).toContain('OK')
  })

  it('@pyreon/i18n main entry imports cleanly on a backend (pragma in trans.tsx)', () => {
    // The defensive path. The main entry re-exports the Trans
    // JSX component, but the pragma at the top of trans.tsx
    // overrides the consumer's tsconfig so bun picks the
    // Pyreon JSX runtime instead of falling back to React.
    //
    // Without the pragma, this fails with:
    //   "Cannot find module 'react/jsx-dev-runtime' from
    //    '/.../i18n/src/trans.tsx'"
    //
    // The pragma is the LOAD-BEARING fix for backends that
    // import from the main entry without realizing they should
    // use /core.
    const result = runInFixture(
      'test-main.ts',
      `import { createI18n } from '@pyreon/i18n'
const i18n = createI18n({ locale: 'en', messages: { en: { hello: 'Hi {{name}}' } } })
const out = i18n.t('hello', { name: 'BE' })
if (out !== 'Hi BE') { console.error('expected "Hi BE", got:', out); process.exit(1) }
console.log('OK')
`,
    )
    expect(result.status, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
    expect(result.stdout).toContain('OK')
    // Specifically check that the historical error message is
    // NOT present — if the pragma stops working, this is the
    // first thing that resurfaces.
    expect(result.stderr).not.toContain("Cannot find module 'react/jsx")
  })

  it('importing the Trans symbol from a backend does not crash (defensive)', () => {
    // Even importing Trans by name (not just via re-export
    // resolution) should succeed. Trans returns a VNode which
    // is meaningless on a backend, but the import resolution
    // and TypeScript shape-check should both succeed.
    const result = runInFixture(
      'test-trans.ts',
      `import { Trans, createI18n } from '@pyreon/i18n'
if (typeof Trans !== 'function') { console.error('expected Trans to be a function'); process.exit(1) }
const i18n = createI18n({ locale: 'en', messages: { en: { hello: 'Hi' } } })
console.log('OK', i18n.t('hello'))
`,
    )
    expect(result.status, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0)
    expect(result.stdout).toContain('OK Hi')
  })
})
