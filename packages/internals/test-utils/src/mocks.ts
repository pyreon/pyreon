import { config } from '@pyreon/ui-core'

/**
 * No-op CSS tagged template for testing. Returns an empty string — used
 * to bypass real CSS resolution in tests that only need a stable styled
 * component identity, not the rendered output.
 */
export const mockCss = (_strings: TemplateStringsArray, ..._args: unknown[]): string => ''

/**
 * Pass-through styled tagged template — returns the component unchanged.
 * Used to bypass real styled-component wrapping in tests that exercise
 * upstream HOCs (rocketstyle, attrs) without depending on styler's runtime.
 */
export const mockStyled = <TComponent>(component: TComponent) => {
  const taggedTemplate = (_strings: TemplateStringsArray, ..._args: unknown[]): TComponent =>
    component
  return taggedTemplate
}

export interface TestConfigOverrides {
  css: typeof config.css
  styled: typeof config.styled
  component: string
  textComponent: string
}

/**
 * Initialize @pyreon/ui-core config with test mocks.
 * Returns a cleanup function to restore original config.
 *
 * The `as never` cast on css/styled is load-bearing — `config.init`'s
 * shape requires the real `styler.css` and `styler.styled` types
 * (`CSSResult`-returning, `StyledFunction`), and our mocks are no-ops
 * that don't match those exact shapes. The cast tells TS we know the
 * mock won't honor the contract, which is exactly the point.
 *
 * @example
 * ```ts
 * let cleanup: () => void
 * beforeAll(() => { cleanup = initTestConfig() })
 * afterAll(() => cleanup())
 * ```
 */
export function initTestConfig(overrides?: Partial<TestConfigOverrides>): () => void {
  const originalStyled = config.styled
  const originalCss = config.css

  config.init({
    css: (overrides?.css ?? (mockCss as unknown)) as typeof config.css,
    styled: (overrides?.styled ?? (mockStyled as unknown)) as typeof config.styled,
    component: overrides?.component ?? 'div',
    textComponent: overrides?.textComponent ?? 'span',
  })

  return () => {
    config.styled = originalStyled
    config.css = originalCss
  }
}
