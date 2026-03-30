import { computed } from '@pyreon/reactivity'
import { useMediaQuery } from './useMediaQuery'

/**
 * Returns the OS color scheme preference as 'light' or 'dark'.
 */
export function useColorScheme(): () => 'light' | 'dark' {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  return computed(() => (prefersDark() ? 'dark' : 'light'))
}
