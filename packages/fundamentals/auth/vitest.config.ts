import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'node',
  // The real-Chromium smoke (`*.browser.test.ts`) runs under `vitest.browser.config.ts`; under Node it would
  // reference `location` at import and fail the whole suite.
  excludeBrowserTests: true,
  // The native-compiler plugin (`src/native-plugin/`) is tooling that runs inside the compiler, not library code.
  // Its emit is verified where it runs: `packages/native/compiler/src/tests/native-auth-oidc.test.ts` (both targets,
  // zero warnings, stub-compiled) and the `useOidc` row of `lowered-hooks-typecheck.test.ts`.
  coverageExclude: ['src/native-plugin.ts', 'src/native-plugin/**'],
})
