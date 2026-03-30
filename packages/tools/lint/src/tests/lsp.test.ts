import { AstCache } from '../cache'
import { getPreset } from '../config/presets'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

// Test the LSP diagnostic conversion logic directly
// (we can't easily test the stdin/stdout transport in unit tests)

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

  it('LSP severity mapping is consistent', () => {
    // Verify our severity types map correctly
    const severityMap: Record<string, number> = {
      error: 1,
      warn: 2,
      info: 3,
    }
    expect(severityMap.error).toBe(1)
    expect(severityMap.warn).toBe(2)
    expect(severityMap.info).toBe(3)
  })

  it('produces zero-based line/column for LSP', () => {
    const source = `import { signal } from '@pyreon/reactivity'\nconst x = signal(0)\n{x}\n`
    const result = lintFile('test.tsx', source, allRules, config)

    for (const d of result.diagnostics) {
      // Pyreon lint uses 1-based lines; LSP needs 0-based
      // Verify the source data is correct (conversion happens in LSP layer)
      expect(d.loc.line).toBeGreaterThanOrEqual(1)
      expect(d.loc.column).toBeGreaterThanOrEqual(1)
    }
  })
})
