import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '../../../vitest.browser'

// NOTE: ECharts ships CommonJS that Vite's pre-bundler can't transform
// inside @vitest/browser — tslib's `__extends` helper destructure
// fails ("Cannot destructure property '__extends' of '__toESM(...).default'").
// Tried: `optimizeDeps.include` for echarts subpaths + tslib + zrender,
// `resolve.alias` to tslib's ESM entry, `resolve.mainFields` reorder.
// None resolved it — the failure happens deep inside echarts's
// optimized bundle, not at the user-facing import boundary.
//
// The bridge tests below cover the @pyreon/charts contract that's
// independent of ECharts loading. Adding canvas-rendering coverage
// requires a vite/echarts upstream fix or a different harness. Logged
// as a follow-up.
export default defineBrowserConfig(playwright())
