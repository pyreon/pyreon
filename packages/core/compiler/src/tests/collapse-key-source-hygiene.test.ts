/**
 * Compiler hardening — Round 1.
 *
 * Two locked invariants, one root cause.
 *
 * `rocketstyleCollapseKey` (jsx.ts) and its Vite-plugin twin used to embed
 * RAW C0 control bytes (NUL 0x00 / SOH 0x01) directly inside source string
 * literals as FNV-1a field separators. Three measured consequences:
 *
 *   1. BSD `file(1)` classifies the file as binary `data` (siblings with no
 *      raw C0 are correctly "UTF-8 text").
 *   2. Plain `grep`/`rg` silently skip the file (binary-skip) — the
 *      compiler's primary source became un-greppable.
 *   3. Silent-correctness fragility: a raw NUL/SOH in a `.ts` string literal
 *      is mutable by formatters / editors / copy-paste / git text filters.
 *      If the separator byte is altered, the cache key changes with ZERO
 *      compile error — the "cache key from raw input" anti-pattern family.
 *
 * Fix: escape sequences (`U+0001` SOH / `U+0000` NUL) — byte-identical at runtime
 * (`String.fromCharCode(1)` is identical to the raw byte), so every emitted key is unchanged, but
 * the source is plain UTF-8 text again.
 *
 * Test A pins the ground-truth keys (proves the fix is byte-identical AND
 * locks the algorithm against any future change). Test B is the
 * self-discriminating repo-wide regression gate: before the fix three files
 * carry raw C0 → it fails; after → it passes. Bisect-verified.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rocketstyleCollapseKey } from '../jsx'

describe('rocketstyleCollapseKey — ground-truth key lock (escape fix is byte-identical)', () => {
  // Captured from the ORIGINAL raw-byte implementation before the escape fix.
  // The escape fix MUST reproduce these exactly (proves zero behavior change);
  // any future algorithm change is also caught here.
  it('emits the exact pre-fix keys', () => {
    expect(rocketstyleCollapseKey('Button', { state: 'primary', size: 'lg' }, 'Click')).toBe('zfm01z')
    expect(rocketstyleCollapseKey('Card', {}, '')).toBe('mzrimv')
    expect(rocketstyleCollapseKey('Comp', { a: '1' }, '')).toBe('1l6zbih')
    expect(rocketstyleCollapseKey('Comp', {}, 'a=1')).toBe('zteym7')
    expect(rocketstyleCollapseKey('日本', { 'aria-label': 'café' }, 'arrow ok')).toBe('vnvy01')
  })

  it('is order-independent over props (sort) and shape-distinct (separators do their job)', () => {
    expect(rocketstyleCollapseKey('Button', { state: 'primary', size: 'lg' }, 'Click')).toBe(
      rocketstyleCollapseKey('Button', { size: 'lg', state: 'primary' }, 'Click'),
    )
    // Without NUL field separators, `{a:'1'},''` and `{},'a=1'` would collide.
    expect(rocketstyleCollapseKey('Comp', { a: '1' }, '')).not.toBe(
      rocketstyleCollapseKey('Comp', {}, 'a=1'),
    )
  })
})

function repoRoot(): string {
  let d = resolve(__dirname)
  while (!existsSync(join(d, '.git')) && dirname(d) !== d) d = dirname(d)
  return d
}

describe('source hygiene — no raw C0/DEL control bytes in tracked source', () => {
  it('every tracked .ts/.tsx/.js/.mjs/.rs file is plain text (no raw NUL/SOH/ESC/DEL)', () => {
    const root = repoRoot()
    const files = execFileSync(
      'git',
      ['ls-files', '*.ts', '*.tsx', '*.js', '*.mjs', '*.rs'],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
      .split('\n')
      .filter(Boolean)

    const offenders: string[] = []
    for (const rel of files) {
      const buf = readFileSync(join(root, rel))
      for (let i = 0; i < buf.length; i++) {
        const b = buf[i]!
        // Allow only tab (9), LF (10), CR (13); flag all other C0 + DEL (127).
        if ((b < 32 && b !== 9 && b !== 10 && b !== 13) || b === 127) {
          offenders.push(`${rel} (byte 0x${b.toString(16).padStart(2, '0')} at offset ${i})`)
          break
        }
      }
    }
    expect(offenders, `raw control bytes in source — escape them (\\u00NN):\n${offenders.join('\n')}`).toEqual([])
  })
})
