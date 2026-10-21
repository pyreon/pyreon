import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'node',
  // The native-compiler plugin (`src/native-plugin/`) is tooling that runs inside the compiler, not library code.
  // Its emit is verified where it runs: `packages/native/compiler/src/tests/native-auth-oidc.test.ts` (both targets,
  // zero warnings, stub-compiled) and the `useOidc` row of `lowered-hooks-typecheck.test.ts`.
  coverageExclude: ['src/native-plugin.ts', 'src/native-plugin/**'],
})
