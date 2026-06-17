/**
 * Coverage-focused tests for vite.ts's "tslib unreachable" fallback path.
 *
 * In the real worktree tslib.es6.js IS reachable (Bun's nested layout via
 * echarts), so vite-helper.test.ts always hits the candidate-FOUND arm. These
 * tests drive `resolveTslibEs6(fromDir)` with a tmp directory that has no
 * reachable tslib AND no reachable echarts, exercising:
 *
 *   - resolveTslibEs6's `if (existsSync(c)) return c` FALSE arm for every
 *     candidate → fall through to `return null` (vite.ts return-null path).
 *   - chartsViteAlias's `target ? { tslib } : {}` FALSE arm — the `{}` no-op
 *     fallback the "apps that don't use charts won't break their config"
 *     contract depends on.
 *
 * This mirrors the proven pattern in @pyreon/vitest-config's
 * browser-helpers.test.ts (`resolveTslibEsmEntry` null-path test) — passing a
 * tslib-free `fromDir` rather than mocking node:fs, which is unreliable for a
 * binding inside a workspace `src` file under bun + vitest.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { chartsViteAlias, resolveTslibEs6 } from '../vite'

describe('resolveTslibEs6 — not-found path', () => {
  it('returns null when no tslib.es6.js exists on any candidate path', () => {
    // A tmp dir whose parent chain has no node_modules/tslib AND from which
    // echarts is not resolvable (no package.json with echarts dep) → every
    // candidate fails existsSync → return null.
    const dir = mkdtempSync(path.join(tmpdir(), 'charts-vite-missing-'))
    try {
      mkdirSync(path.join(dir, 'src'), { recursive: true })
      expect(resolveTslibEs6(path.join(dir, 'src'))).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns null when a partial tslib install lacks tslib.es6.js', () => {
    // node_modules/tslib exists but only package.json (no tslib.es6.js) — the
    // candidate is generated but existsSync('.../tslib.es6.js') is false → the
    // false arm runs for that candidate too, and resolution falls through to
    // return null.
    const dir = mkdtempSync(path.join(tmpdir(), 'charts-vite-partial-'))
    try {
      const tslibDir = path.join(dir, 'node_modules', 'tslib')
      mkdirSync(tslibDir, { recursive: true })
      writeFileSync(path.join(tslibDir, 'package.json'), JSON.stringify({ name: 'tslib' }))
      expect(resolveTslibEs6(dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns the path when tslib.es6.js IS present (found-arm sanity)', () => {
    // Guards the not-found tests against a false pass: with a real
    // tslib.es6.js on a candidate path, existsSync's TRUE arm returns it.
    const dir = mkdtempSync(path.join(tmpdir(), 'charts-vite-found-'))
    try {
      const tslibDir = path.join(dir, 'node_modules', 'tslib')
      mkdirSync(tslibDir, { recursive: true })
      const target = path.join(tslibDir, 'tslib.es6.js')
      writeFileSync(target, 'export function __extends(){}')
      expect(resolveTslibEs6(dir)).toBe(target)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('chartsViteAlias — no-op fallback contract', () => {
  it('returns {} when tslib is unreachable (target ? {...} : {} FALSE arm)', () => {
    // Pass a tslib-free `fromDir` so resolveTslibEs6 returns null →
    // chartsViteAlias takes the `: {}` arm. This is the documented
    // "apps that don't use charts won't break their config" no-op.
    const dir = mkdtempSync(path.join(tmpdir(), 'charts-alias-empty-'))
    try {
      mkdirSync(path.join(dir, 'src'), { recursive: true })
      expect(chartsViteAlias(path.join(dir, 'src'))).toEqual({})
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns { tslib } when tslib IS reachable (target ? {...} : {} TRUE arm)', () => {
    // The default (no-arg) call resolves from this file's own dir, where
    // tslib is reachable via echarts in the worktree → the truthy arm.
    const alias = chartsViteAlias()
    expect(alias).toHaveProperty('tslib')
    expect(alias.tslib).toMatch(/tslib[\\/]tslib\.es6\.js$/)
  })

  it('never throws regardless of resolution root', () => {
    expect(() => chartsViteAlias()).not.toThrow()
    const dir = mkdtempSync(path.join(tmpdir(), 'charts-alias-nothrow-'))
    try {
      expect(() => chartsViteAlias(dir)).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
