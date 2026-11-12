import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRE_PAINT_SCRIPT, resolveInitialMode } from '../color-mode'

/** Run the inline script against a fake document/storage/matchMedia. */
function runScript(stored: Record<string, string>, prefersLight: boolean | 'throws') {
  const attrs: Record<string, string> = {}
  const doc = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v), style: {} as Record<string, string> } }
  const ls = { getItem: (k: string) => stored[k] ?? null }
  const mm = (q: string) => {
    if (prefersLight === 'throws') throw new Error('no matchMedia')
    return { matches: q.includes('light') ? prefersLight : !prefersLight }
  }
  new Function('document', 'localStorage', 'window', PRE_PAINT_SCRIPT)(doc, ls, { matchMedia: mm })
  return attrs['data-theme']
}

describe('colour mode', () => {
  const cases: [Record<string, string>, boolean][] = [
    [{}, true],
    [{}, false],
    [{ 'pyreon-theme': 'dark' }, true],
    [{ 'pyreon-theme': 'light' }, false],
    [{ 'vitepress-theme-appearance': 'light' }, false],
    [{ 'vitepress-theme-appearance': 'auto' }, true],
    [{ 'pyreon-theme': 'nonsense' }, false],
  ]
  it.each(cases)('pre-paint script and resolveInitialMode agree (%o, prefersLight=%s)', (stored, prefersLight) => {
    const expected = resolveInitialMode({
      stored: stored['pyreon-theme'] ?? null,
      legacy: stored['vitepress-theme-appearance'] ?? null,
      prefersLight,
    })
    expect(runScript(stored, prefersLight)).toBe(expected)
  })

  it('falls back to dark when storage or matchMedia throws', () => {
    expect(runScript({}, 'throws')).toBe('dark')
  })

  it('index.html inlines exactly PRE_PAINT_SCRIPT', () => {
    const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8')
    expect(html).toContain(`<script>${PRE_PAINT_SCRIPT}</script>`)
  })
})
