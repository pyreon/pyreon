import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// --------------------------------------------------------
// Shipped-entry contract for the `/matchers` + `/vitest` subpaths
// --------------------------------------------------------
//
// "Test the shipped ENTRY, not the export" (.claude/rules/testing.md): every
// in-repo suite resolves this package via the bun condition (src/), so the
// BUILT lib/ was never executed by any test — and it shipped broken in every
// release up to the 2026-07 upstream report:
//
//   1. `lib/matchers.js` was an EMPTY module — the build's
//      `treeshake.moduleSideEffects: false` dropped the bare side-effect
//      `import '@testing-library/jest-dom/vitest'`, so `/matchers` registered
//      nothing.
//   2. `lib/vitest.js` registered cleanup via `globalThis.afterEach`, which
//      silently no-ops for every project without `globals: true` (the vitest
//      default) — containers leaked across tests.
//   3. Both `lib/*.d.ts` were bare `export {}` — the jest-dom `Assertion`
//      augmentation never reached published consumers.
//
// These specs pin the built artifact's load-bearing shape. They are
// bisect-verified: reverting the sources to the bare-import/globalThis form
// and rebuilding fails every group below.

const PKG_ROOT = resolve(__dirname, '..', '..')

const read = (file: string): string => {
  // Loud failure, never a skip: a missing lib/ here means the environment is
  // broken (bootstrap didn't run), not that the contract holds.
  return readFileSync(resolve(PKG_ROOT, 'lib', file), 'utf8')
}

describe('shipped lib/matchers.js', () => {
  it('actually registers the jest-dom matchers (was an empty module)', () => {
    const js = read('matchers.js')
    expect(js).toContain('expect.extend(')
    expect(js).toContain('@testing-library/jest-dom/matchers')
    expect(js).toContain('from "vitest"')
  })
})

describe('shipped lib/vitest.js', () => {
  it('imports afterEach from vitest instead of reading it off globalThis', () => {
    const js = read('vitest.js')
    // The bound import — the form that works without `globals: true`.
    expect(js).toMatch(/import\s*\{[^}]*\bafterEach\b[^}]*\}\s*from\s*"vitest"/)
    // The old shape read `afterEach` off a globalThis alias. Assert against
    // CODE only — the entry's doc comment describes the old shape by name.
    const codeOnly = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(codeOnly).not.toMatch(/\bg\.afterEach\b|globalThis\.afterEach|typeof\s+g\.afterEach/)
  })

  it('registers the jest-dom matchers too', () => {
    const js = read('vitest.js')
    expect(js).toContain('expect.extend(')
    expect(js).toContain('@testing-library/jest-dom/matchers')
  })
})

describe('shipped type augmentation', () => {
  it.each(['matchers.d.ts', 'vitest.d.ts'])(
    '%s carries the vitest Assertion augmentation (was a bare `export {}`)',
    (file) => {
      const dts = read(file)
      expect(dts).toContain("declare module 'vitest'")
      expect(dts).toContain('TestingLibraryMatchers')
    },
  )
})

describe('package.json sideEffects', () => {
  it('declares the registration entries as side-effectful so consumer bundlers keep them', () => {
    const pkg = JSON.parse(readFileSync(resolve(PKG_ROOT, 'package.json'), 'utf8')) as {
      sideEffects: unknown
    }
    expect(pkg.sideEffects).toEqual(
      expect.arrayContaining(['./lib/matchers.js', './lib/vitest.js']),
    )
  })
})
