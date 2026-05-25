# @pyreon/vitest-config

Internal vitest config helpers. Single canonical shape for every Pyreon package's `vitest.config.ts` / `vitest.browser.config.ts`.

Private — not published. Replaces 3 chaotic merge-order patterns (87 configs total) with one helper per surface.

## Usage

### Node / happy-dom tests

```ts
// packages/<category>/<package>/vitest.config.ts
import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  excludeBrowserTests: true, // package also has a vitest.browser.config.ts
})
```

Per-package overrides:

```ts
export default defineNodeConfig({
  category: 'core',
  environment: 'happy-dom',
  coverageThresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
  coverageExclude: ['src/legacy-shim.ts'],
})
```

Escape hatch for one-off needs (plugins, extra aliases, etc.):

```ts
export default defineNodeConfig({
  category: 'tools',
  overrides: {
    plugins: [myPlugin()],
    resolve: { alias: { 'extra-pkg': '/absolute/path' } },
  },
})
```

### Browser tests (real Chromium via Playwright)

```ts
// packages/<category>/<package>/vitest.browser.config.ts
import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'

export default defineBrowserConfig(playwright())
```

For packages with transitive `tslib` consumers (echarts, zrender):

```ts
import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig, tslibBrowserAlias } from '@pyreon/vitest-config'

export default defineBrowserConfig(playwright(), {
  resolve: { alias: { ...tslibBrowserAlias(import.meta.url) } },
})
```

## Coverage thresholds

Per-category defaults (one source of truth — `src/thresholds.ts`):

| Category | statements | branches | functions | lines |
|----------|------------|----------|-----------|-------|
| core | 90 | 90 | 90 | 90 |
| fundamentals | 85 | 80 | 85 | 85 |
| ui | 80 | 75 | 80 | 80 |
| tools | 80 | 75 | 80 | 80 |
| zero | 80 | 75 | 80 | 80 |
| internals | 90 | 90 | 90 | 90 |

Partial overrides keep other metrics at the category default — `{ branches: 70 }` only relaxes the branches floor.

## Merge order

The helper executes ONE canonical merge order, immune to per-package drift:

```
mergeConfig(
  sharedConfig,                     // aliases + bun condition + retry + timeout
  createVitestConfig({              // category coverage + globals + environment
    environment, setupFiles, coverageExclude, coverageThresholds,
  }),
)
  // then mergeConfig(above, nodeExcludeBrowserTests) if excludeBrowserTests=true
  // then mergeConfig(above, overrides) if overrides supplied
```

Documented + locked by [src/tests/equivalence.test.ts](src/tests/equivalence.test.ts).
