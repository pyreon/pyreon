import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'

/**
 * RUNTIME BENCH config — runs ONLY the wrapper bench (bench/runtime-bench),
 * kept out of the regular `test:browser` suite (which excludes bench/**):
 * the bench takes minutes and prints a report, it is not a pass/fail gate
 * beyond its correctness assertions.
 *
 *   bun run --filter='@pyreon/code' bench:runtime
 */
export default defineBrowserConfig(playwright(), {
  test: {
    // mergeConfig CONCATENATES include globs with the shared base's
    // **/*.browser.test — exclude src/ so only the bench file runs.
    include: ['bench/runtime-bench.browser.test.tsx'],
    exclude: ['src/**', '**/node_modules/**'],
  },
})
