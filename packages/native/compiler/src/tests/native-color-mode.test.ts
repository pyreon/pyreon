// `useColorMode()` (@pyreon/core, the framework-wide mode) lowers to the
// platform scheme read, exactly as `useColorScheme()` (@pyreon/hooks) does —
// same `'light' | 'dark'` string, same emit.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const app = (imp: string, hook: string) => `import { Text } from '@pyreon/primitives'
${imp}
export function Badge() {
  const mode = ${hook}()
  return <Text>{mode() === 'dark' ? 'night' : 'day'}</Text>
}`

describe('useColorMode on native', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: emits exactly what useColorScheme emits, with no warning`, () => {
      const mode = transform(app("import { useColorMode } from '@pyreon/core'", 'useColorMode'), { target })
      const scheme = transform(app("import { useColorScheme } from '@pyreon/hooks'", 'useColorScheme'), { target })
      expect(mode.warnings).toEqual([])
      expect(mode.code).toBe(scheme.code)
      expect(mode.code).toContain(target === 'swift' ? 'colorScheme' : 'isSystemInDarkTheme()')
    })
  }
})
