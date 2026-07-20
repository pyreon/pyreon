import { describe, expect, it } from 'vitest'
import { useThemeValue } from '../useThemeValue'

// Without a ThemeProvider, useTheme returns the default (empty object {}).
// So get(theme, path) returns undefined for any path.

describe('useThemeValue', () => {
  it('returns undefined when no theme values exist', () => {
    const result = useThemeValue('colors.primary')
    expect(result).toBeUndefined()
  })
})
