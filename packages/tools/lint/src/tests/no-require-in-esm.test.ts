import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * `require()` in a `"type": "module"` package.
 *
 * This rule exists because the failure is invisible to the test suite that
 * would otherwise catch it: **Bun defines `require` in ESM**, so a bun-run
 * vitest suite executes the line and reports green while Node throws
 * `require is not defined`. The catalog records two shipped instances and
 * concludes the lock has to be static; this is that lock.
 *
 * The rule found a THIRD instance on its first run, in the linter itself —
 * `@pyreon/lint`'s own LSP and its `require-browser-smoke-test` rule both
 * used `require('node:fs')`. Both were inside try/catch, so under Node they
 * did not crash: they silently returned the fallback. For the browser-smoke
 * rule the fallback is an EMPTY package set, which made the rule match
 * nothing at all — a structurally-dead rule, under Node only. Measured on the
 * built lib with identical input: bun 1 diagnostic, node 0.
 */

const RULE = 'pyreon/no-require-in-esm'
const rules = allRules.filter((r) => r.meta.id === RULE)
const cfg = { rules: { [RULE]: 'error' } } as never

const at = (path: string, src: string) => lintFile(path, src, rules, cfg).diagnostics

describe('pyreon/no-require-in-esm', () => {
  it('is registered as an error — this is a runtime crash, not a preference', () => {
    expect(rules).toHaveLength(1)
    expect(rules[0]?.meta.severity).toBe('error')
  })

  describe('what decides whether the file is ESM', () => {
    it('fires on .mts / .mjs, which are ESM by EXTENSION whatever the manifest says', () => {
      expect(at('/x/src/a.mts', `const fs = require('node:fs')`)).toHaveLength(1)
      expect(at('/x/src/a.mjs', `const fs = require('node:fs')`)).toHaveLength(1)
    })

    it('stays QUIET on .cjs / .cts, where require is simply correct', () => {
      expect(at('/x/src/a.cjs', `const fs = require('node:fs')`)).toHaveLength(0)
      expect(at('/x/src/a.cts', `const fs = require('node:fs')`)).toHaveLength(0)
    })

    it('stays QUIET when no manifest can be found — it cannot prove ESM', () => {
      // Conservative by design: Node treats a missing `type` as CommonJS, so
      // an unprovable file must not be flagged. A false positive here would
      // send someone to "fix" code that already works.
      expect(at('/nonexistent-root-xyz/src/a.ts', `const fs = require('node:fs')`)).toHaveLength(0)
    })
  })

  describe('what it will not mistake for the bug', () => {
    it('stays QUIET on `typeof require` — that is environment DETECTION, not a call', () => {
      // The UMD idiom written specifically to be safe in both module systems.
      // Flagging it would break the one shape that is deliberately portable.
      const src = `export const isCjs = typeof require === 'function'`
      expect(at('/x/src/a.mts', src)).toHaveLength(0)
    })

    it('stays QUIET on a locally BOUND require — somebody else s function', () => {
      expect(at('/x/src/a.mts', `export function f(require) { return require('x') }`)).toHaveLength(0)
      expect(
        at('/x/src/a.mts', `import { require } from './shim'\nexport const x = require('y')`),
      ).toHaveLength(0)
    })

    it('resumes firing after the shadowing scope closes', () => {
      // The shadow tracker has to POP. If it did not, one shadowed call would
      // silence the whole rest of the file — the failure mode that makes a
      // rule quietly stop protecting anything.
      const src = `export function f(require) { return require('x') }\nexport const bad = require('node:fs')`
      expect(at('/x/src/a.mts', src)).toHaveLength(1)
    })

    it('stays QUIET on `await import()`, the correct lazy form', () => {
      const src = `export async function f() { return await import('node:fs') }`
      expect(at('/x/src/a.mts', src)).toHaveLength(0)
    })
  })

  describe('the two shipped shapes', () => {
    it('catches the browser CRASH shape (@pyreon/code foldAll)', () => {
      const src = `export function foldAll(v) {
  if (!v) return
  const { foldAll } = require('@codemirror/language')
  foldAll(v)
}`
      const found = at('/x/src/a.mts', src)
      expect(found).toHaveLength(1)
      expect(found[0]?.message).toContain('@codemirror/language')
    })

    it('catches the SILENT shape — a require swallowed by its own catch', () => {
      // The worse of the two: @pyreon/zero read a certificate expiry this way
      // inside `try { … } catch { return null }`, so every dev cert silently
      // took the caller's 24-hour fallback instead of its real 825 days.
      const src = `export function expiry(pem) {
  try {
    const { X509Certificate } = require('node:crypto')
    return new X509Certificate(pem).validTo
  } catch {
    return null
  }
}`
      expect(at('/x/src/a.mts', src)).toHaveLength(1)
    })

    it('names the module and points at the two correct spellings', () => {
      const found = at('/x/src/a.mts', `const p = require('node:path')`)
      expect(found[0]?.message).toContain("'node:path'")
      expect(found[0]?.message).toContain('await import')
      // The line that stops the next person trusting a green suite.
      expect(found[0]?.message).toContain('Bun defines')
    })
  })

  it('flags every call site, not just the first', () => {
    const src = `const a = require('x')\nconst b = require('y')\nconst c = require('z')`
    expect(at('/x/src/a.mts', src)).toHaveLength(3)
  })

  it('does not crash on a bare `require` reference or a dynamic specifier', () => {
    expect(() => at('/x/src/a.mts', `export const r = require`)).not.toThrow()
    const dynamic = at('/x/src/a.mts', `const n = 'fs'\nconst m = require(n)`)
    expect(dynamic).toHaveLength(1)
    expect(dynamic[0]?.message).toContain('the module')
  })
})
