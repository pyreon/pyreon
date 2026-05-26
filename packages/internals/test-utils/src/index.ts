// Components
export { BaseComponent, ThemeCapture } from './components'
// Context helpers
export type { TestThemeOptions } from './context'
export { buildThemeContextMap, withThemeContext } from './context'
// DOM query helpers (typed replacement for `querySelector(...) as HTMLXxxElement`)
export { query, queryAll, queryOptional } from './dom-query'
// Framework-internal accessors (typed escape hatch for white-box tests)
export { accessInternal, callInternal } from './internals'
// vi.mock adapter helpers (typed wrappers for external lib callback shapes)
export { mockAdapter, mockAdapters } from './mock-adapter'
// Mock factories
export type { TestConfigOverrides } from './mocks'
export { initTestConfig, mockCss, mockStyled } from './mocks'
// Mount-and-mutate helpers (require happy-dom)
export type { MountAndExpectOnceResult, MountReactiveResult } from './mount-reactive'
export { mountAndExpectOnce, mountReactive } from './mount-reactive'
// Render helpers
export { getComputedTheme, renderProps, resolveRocketstyle } from './render'
