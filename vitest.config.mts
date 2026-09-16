import { defineConfig } from 'vitest/config'

/**
 * Root vitest config — a ROUTER, not a config.
 *
 * Every package owns its `vitest.config.ts` (built on `@pyreon/vitest-config`:
 * bun-condition aliases, the shared setup file, a 20s default timeout, and
 * per-package overrides such as `@pyreon/native-compiler`'s 180s budget +
 * serial files for its swiftc/kotlinc subprocesses). Those configs apply only
 * when vitest is started INSIDE the package. Started from the repo root —
 * `bunx vitest run packages/native/compiler/src/tests/x.test.ts`, the natural
 * way to run a hand-picked matrix of files across packages — vitest found no
 * config here and ran every file on its DEFAULTS: a 5,000ms test timeout and
 * full file parallelism. Every kotlinc-spawning spec then failed with
 * `Test timed out in 5000ms` while passing in isolation, and the parallel JVM
 * stampede made it worse under load.
 *
 * `test.projects` makes a root invocation resolve each test file to the
 * package that owns it and run it under THAT package's config. Nothing else
 * changes: `bun run test` still runs each package from its own directory, and
 * a package's config is still the single source of truth for that package.
 *
 * Node configs only. A `vitest.browser.config.ts` needs the Playwright
 * provider and is run by each package's `test:browser` script; browser specs
 * are excluded from the node configs, so a root run simply reports "no test
 * files found" for one rather than running it in the wrong environment.
 */
export default defineConfig({
  test: {
    projects: ['packages/*/*/vitest.config.ts', 'examples/*/vitest.config.ts'],
  },
})
