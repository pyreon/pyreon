/**
 * `setRootVariables` — the sheet's ONE owned, replaceable root-variables slot
 * (the cssVariables `:root { --px-… }` block). It replaced an append-only,
 * text-keyed `injectRules` call that kept one rule per distinct theme and,
 * because the last inserted rule wins, showed the wrong theme after A -> B -> A.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet } from '../sheet'

afterEach(() => {
  vi.restoreAllMocks()
})

const rootTexts = (s: StyleSheet): string[] => {
  const out: string[] = []
  const sheet = (s as unknown as { sheet: CSSStyleSheet | null }).sheet
  if (!sheet) return out
  for (const r of Array.from(sheet.cssRules)) if (r.cssText.includes('--v')) out.push(r.cssText)

  return out
}

function makeSSRSheet(): StyleSheet {
  const originalDoc = globalThis.document
  Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true, writable: true })
  const sheet = new StyleSheet()
  Object.defineProperty(globalThis, 'document', { value: originalDoc, configurable: true, writable: true })

  return sheet
}

// Instances in one document share the `<style data-pyreon-styler>` element:
// start each client test from an empty live sheet.
const fresh = (): StyleSheet => {
  const s = new StyleSheet()
  s.clearAll()

  return s
}

describe('StyleSheet.setRootVariables — client', () => {
  it('replaces the block in place: one rule, latest content wins, A -> B -> A shows A', () => {
    const s = fresh()
    s.setRootVariables(':root{--v:1px}')
    expect(rootTexts(s)).toHaveLength(1)
    expect(rootTexts(s)[0]).toContain('1px')
    s.setRootVariables(':root{--v:2px}')
    expect(rootTexts(s)).toHaveLength(1)
    expect(rootTexts(s)[0]).toContain('2px')
    s.setRootVariables(':root{--v:1px}')
    expect(rootTexts(s)).toHaveLength(1)
    expect(rootTexts(s)[0]).toContain('1px')
  })

  it('the same text is a no-op, and an empty string removes the block', () => {
    const s = fresh()
    s.setRootVariables(':root{--v:1px}')
    const count = s.ruleCountForTest()
    s.setRootVariables(':root{--v:1px}')
    expect(s.ruleCountForTest()).toBe(count)
    s.setRootVariables('')
    expect(rootTexts(s)).toHaveLength(0)
    expect(s.ruleCountForTest()).toBe(count - 1)
  })

  it('keeps its cascade position when replaced', () => {
    const s = fresh()
    s.setRootVariables(':root{--v:1px}')
    s.injectRules(['.after{color:red}'], 'after')
    s.setRootVariables(':root{--v:2px}')
    const sheet = (s as unknown as { sheet: CSSStyleSheet }).sheet
    const texts = Array.from(sheet.cssRules).map((r) => r.cssText)
    expect(texts.findIndex((t) => t.includes('--v'))).toBeLessThan(
      texts.findIndex((t) => t.includes('.after')),
    )
  })

  it('clearAll() (HMR purge) re-applies the current block', () => {
    const s = fresh()
    s.setRootVariables(':root{--v:3px}')
    s.clearAll()
    expect(rootTexts(s)).toHaveLength(1)
    expect(rootTexts(s)[0]).toContain('3px')
  })

  it('replaces cleanly when the previous rule was already removed from the live sheet', () => {
    const s = fresh()
    s.setRootVariables(':root{--v:1px}')
    const sheet = (s as unknown as { sheet: CSSStyleSheet }).sheet
    while (sheet.cssRules.length > 0) sheet.deleteRule(0)
    s.setRootVariables(':root{--v:2px}')
    expect(rootTexts(s)).toHaveLength(1)
    expect(rootTexts(s)[0]).toContain('2px')
  })

  it('warns (dev) and skips a rule the browser rejects', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = fresh()
    const sheet = (s as unknown as { sheet: CSSStyleSheet }).sheet
    vi.spyOn(sheet, 'insertRule').mockImplementation(() => {
      throw new Error('bad rule')
    })
    s.setRootVariables(':root{--v:1px}')
    expect(warn).toHaveBeenCalled()
  })

  it('is a no-op without a live sheet', () => {
    const s = fresh()
    ;(s as unknown as { sheet: CSSStyleSheet | null }).sheet = null
    expect(() => s.setRootVariables(':root{--v:1px}')).not.toThrow()
  })
})

describe('StyleSheet.setRootVariables — SSR', () => {
  it('holds ONE block, emitted ahead of every other rule; reset() clears it', () => {
    const s = makeSSRSheet()
    s.injectRules(['.pyr-x{color:red}'], 'x')
    s.setRootVariables(':root{--v:1px}')
    s.setRootVariables(':root{--v:2px}')
    expect(s.getStyleRules()).toEqual([':root{--v:2px}', '.pyr-x{color:red}'])
    expect(s.getStyles()).toBe(':root{--v:2px}.pyr-x{color:red}')
    s.reset()
    expect(s.getStyleRules()).toEqual([])
  })

  it('streaming: emitted on the first flush and again only when it changes', () => {
    const s = makeSSRSheet()
    s.setRootVariables(':root{--v:1px}')
    expect(s.flushSSRPending()).toBe(':root{--v:1px}')
    expect(s.flushSSRPending()).toBe('')
    s.setRootVariables(':root{--v:2px}')
    s.injectRules(['.pyr-y{color:blue}'], 'y')
    expect(s.flushSSRPending()).toBe(':root{--v:2px}.pyr-y{color:blue}')
  })
})
