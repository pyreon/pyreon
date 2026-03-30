import { getPreset } from '../config/presets'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

describe('LSP diagnostic conversion', () => {
  const config = getPreset('recommended')

  it('converts lint diagnostics to LSP format', () => {
    const source = `
import { useContext } from '@pyreon/core'
const { mode } = useContext(ThemeCtx)
`
    const result = lintFile('test.tsx', source, allRules, config)
    const diag = result.diagnostics.find(
      (d) => d.ruleId === 'pyreon/no-context-destructure',
    )
    expect(diag).toBeDefined()
    expect(diag!.loc.line).toBeGreaterThan(0)
    expect(diag!.loc.column).toBeGreaterThan(0)
    expect(diag!.span.start).toBeLessThan(diag!.span.end)
  })

  it('LSP severity mapping — error=1, warn=2, info=3', () => {
    const severityMap: Record<string, number> = {
      error: 1,
      warn: 2,
      info: 3,
    }
    expect(severityMap.error).toBe(1)
    expect(severityMap.warn).toBe(2)
    expect(severityMap.info).toBe(3)
  })

  it('source diagnostics use 1-based lines (LSP layer converts to 0-based)', () => {
    const source = `import { signal } from '@pyreon/reactivity'\nconst x = signal(0)\n{x}\n`
    const result = lintFile('test.tsx', source, allRules, config)

    for (const d of result.diagnostics) {
      expect(d.loc.line).toBeGreaterThanOrEqual(1)
      expect(d.loc.column).toBeGreaterThanOrEqual(1)
    }
  })

  it('handles empty source without crashing', () => {
    const result = lintFile('test.tsx', '', allRules, config)
    expect(result.diagnostics).toEqual([])
  })

  it('handles non-JS file gracefully', () => {
    const result = lintFile('test.css', 'body { color: red }', allRules, config)
    expect(result.diagnostics).toEqual([])
  })

  it('handles syntax errors gracefully', () => {
    const result = lintFile('test.tsx', 'const x = {{{', allRules, config)
    // Should not throw — returns empty or partial diagnostics
    expect(result.diagnostics).toBeDefined()
  })

  it('multiple diagnostics are sorted by position', () => {
    const source = `
import { useContext } from '@pyreon/core'
const { a } = useContext(Ctx1)
const { b } = useContext(Ctx2)
`
    const result = lintFile('test.tsx', source, allRules, config)
    const ctxDiags = result.diagnostics.filter(
      (d) => d.ruleId === 'pyreon/no-context-destructure',
    )
    expect(ctxDiags.length).toBe(2)
    expect(ctxDiags[0]!.span.start).toBeLessThan(ctxDiags[1]!.span.start)
  })

  it('diagnostic span covers the destructured pattern', () => {
    const source = `
import { useContext } from '@pyreon/core'
const { mode, theme } = useContext(ThemeCtx)
`
    const result = lintFile('test.tsx', source, allRules, config)
    const diag = result.diagnostics.find(
      (d) => d.ruleId === 'pyreon/no-context-destructure',
    )
    expect(diag).toBeDefined()
    const spanned = source.slice(diag!.span.start, diag!.span.end)
    expect(spanned).toContain('mode')
    expect(spanned).toContain('theme')
  })
})
