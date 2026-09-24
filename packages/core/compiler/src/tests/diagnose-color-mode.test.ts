// The chart colour mode moved to the framework-wide `useColorMode` /
// `<ColorModeProvider>` (@pyreon/core). The two errors an app on the old API
// hits must teach that, whichever tool reported them.
import { describe, expect, it } from 'vitest'
import { diagnoseError } from '../diagnose'

describe('diagnose: the chart colour mode moved to @pyreon/core', () => {
  it.each([
    ["the type checker's missing member", "Module '\"@pyreon/charts\"' has no exported member 'systemChartMode'."],
    ["the ESM loader's missing export", "SyntaxError: The requested module '@pyreon/charts' does not provide an export named 'systemChartMode'"],
    ['a `mode` prop on the provider', "Property 'mode' does not exist on type 'IntrinsicAttributes & ChartThemeProviderProps'."],
  ])('%s', (_name, message) => {
    const d = diagnoseError(message)
    expect(d?.fix).toContain('ColorModeProvider')
    expect(d?.fix).toContain('systemColorMode')
  })
})
