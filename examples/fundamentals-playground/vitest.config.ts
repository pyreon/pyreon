import { defineNodeConfig } from '@pyreon/vitest-config'

// The reactive-matcher showcase imports StoreDemo.tsx (JSX), so route the
// transform to the @pyreon/core runtime — even though the test only touches
// the store logic, not the rendered component.
export default defineNodeConfig({
  environment: 'happy-dom',
  overrides: {
    // @ts-expect-error vitest UserConfig doesn't expose the oxc plugin opts
    oxc: {
      jsx: {
        runtime: 'automatic',
        importSource: '@pyreon/core',
      },
    },
  },
})
