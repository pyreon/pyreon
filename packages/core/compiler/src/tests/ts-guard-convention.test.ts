/**
 * Enforces the `assertClassicTs()` convention structurally: EVERY
 * `ts.createSourceFile(` call site in this package's src must be immediately
 * preceded by an `assertClassicTs()` line.
 *
 * Why: TypeScript 7 removed the classic Compiler API; `assertClassicTs()`
 * converts the cryptic `Cannot read properties of undefined (reading
 * 'ESNext')` into an actionable `[Pyreon]` message (see ts.ts + the 0.43.1
 * cap). Guard-before-parse was a comment-level convention with no enforcement
 * — a future parse site could silently omit it and regress the diagnosis.
 * This test IS the enforcement (release-audit follow-up, low tier).
 *
 * Bisect: delete the `assertClassicTs()` line above any `ts.createSourceFile(`
 * → this test fails naming the exact file:line; restore → passes.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '..')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'tests' || e.name === '__tests__' || e.name === 'node_modules') continue
      out.push(...walk(p))
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) {
      out.push(p)
    }
  }
  return out
}

describe('assertClassicTs convention — guard precedes every classic-API parse', () => {
  it('every ts.createSourceFile( in src/ is immediately preceded by assertClassicTs()', () => {
    const violations: string[] = []
    let sites = 0
    for (const file of walk(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        // Real call sites only — skip comments/strings mentioning the API.
        const trimmed = line.trimStart()
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
        if (!/\bts\.createSourceFile\(/.test(line)) continue
        sites++
        // Look back past blank lines + comment lines for the guard.
        let j = i - 1
        while (
          j >= 0 &&
          (lines[j]!.trim() === '' ||
            lines[j]!.trimStart().startsWith('//') ||
            lines[j]!.trimStart().startsWith('*') ||
            lines[j]!.trimStart().startsWith('/*'))
        ) {
          j--
        }
        if (j < 0 || !lines[j]!.includes('assertClassicTs()')) {
          violations.push(`${file}:${i + 1} — ts.createSourceFile without a preceding assertClassicTs()`)
        }
      }
    }
    // Sanity: the convention has real coverage (13 sites at time of writing —
    // a collapse to 0 means the scan broke, not that the code got clean).
    expect(sites).toBeGreaterThanOrEqual(10)
    expect(violations).toEqual([])
  })
})
