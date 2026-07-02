/**
 * Drift lock for `themeScriptCspHash`.
 *
 * The constant is a PRECOMPUTED literal (theme.tsx is client-safe — no
 * runtime crypto), so nothing at runtime keeps it in sync with the script
 * it hashes. This test recomputes sha256(themeScript) with node:crypto and
 * fails the moment an edit to `themeScript` makes the published hash stale —
 * a stale hash would silently BREAK the theme script under strict CSP
 * (browsers refuse to execute the mismatched inline script → FOUC returns).
 *
 * Bisect contract: change one character of `themeScript` without updating
 * the constant → the equality spec fails with the freshly-computed hash in
 * the diff (copy it into the constant to fix).
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { cspHashForInlineScript } from '../csp'
import { themeScript, themeScriptCspHash } from '../theme'

describe('themeScriptCspHash — drift lock', () => {
  it('matches sha256(themeScript) exactly', () => {
    const expected = `'sha256-${createHash('sha256').update(themeScript, 'utf8').digest('base64')}'`
    expect(themeScriptCspHash).toBe(expected)
  })

  it('is a well-formed CSP source expression (quoted sha256-base64)', () => {
    expect(themeScriptCspHash).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/)
  })

  it('cspHashForInlineScript (Web Crypto path) agrees with node:crypto', async () => {
    // The async helper is the same primitive users apply to parametrized
    // scripts (cssVariablesPrePaintScript). Cross-check the two
    // implementations against each other on the real themeScript.
    await expect(cspHashForInlineScript(themeScript)).resolves.toBe(themeScriptCspHash)
  })

  it('cspHashForInlineScript differs for different content', async () => {
    const other = await cspHashForInlineScript(`${themeScript};`)
    expect(other).not.toBe(themeScriptCspHash)
    expect(other).toMatch(/^'sha256-/)
  })
})
