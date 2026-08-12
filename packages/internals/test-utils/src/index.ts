// Components
export { BaseComponent, ThemeCapture } from './components'
// Context helpers
export type { TestThemeOptions } from './context'
export { buildThemeContextMap, withThemeContext } from './context'
// DOM query helpers (typed replacement for `querySelector(...) as HTMLXxxElement`)
export { query, queryAll, queryOptional } from './dom-query'
// happy-dom spec-parity guard: swallow the non-spec deferred `hashchange`
// echoes happy-dom queues for history.pushState/replaceState — install from
// any package's setupFiles whose happy-dom tests drive a real router.
// setupFiles MUST import the SUBPATH `@pyreon/test-utils/happy-dom-hashchange-guard`
// (zero framework imports), NOT this barrel — the barrel pulls @pyreon/core +
// @pyreon/reactivity (src instances) into every test file's setup context,
// which trips the duplicate-instance singleton sentinel in any test that
// bundles + evaluates built lib/ output (router's treeshake specs).
export type { ComplexityOptions, ComplexityResult } from './complexity'
export { expectSubQuadratic, measureComplexity } from './complexity'

export { installHappyDomHashchangeEchoGuard } from './happy-dom-hashchange-guard'
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
