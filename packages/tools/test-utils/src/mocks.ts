import { config } from '@pyreon/ui-core'

/** No-op CSS tagged template for testing. */
export const mockCss = (_strings: any, ..._args: any[]) => ''

/** Pass-through styled tagged template — returns the component unchanged. */
export const mockStyled = (component: any) => {
  const taggedTemplate = (_strings: any, ..._args: any[]) => component
  return taggedTemplate
}

/**
 * Initialize @pyreon/ui-core config with test mocks.
 * Returns a cleanup function to restore original config.
 *
 * @example
 * ```ts
 * let cleanup: () => void
 * beforeAll(() => { cleanup = initTestConfig() })
 * afterAll(() => cleanup())
 * ```
 */
export function initTestConfig(
  overrides?: Partial<{
    css: typeof config.css
    styled: typeof config.styled
    component: string
    textComponent: string
  }>,
): () => void {
  const originalStyled = config.styled
  const originalCss = config.css

  config.init({
    css: (overrides?.css ?? mockCss) as any,
    styled: (overrides?.styled ?? mockStyled) as any,
    component: overrides?.component ?? 'div',
    textComponent: overrides?.textComponent ?? 'span',
  })

  return () => {
    config.styled = originalStyled
    config.css = originalCss
  }
}
