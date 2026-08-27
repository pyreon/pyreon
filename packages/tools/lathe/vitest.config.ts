import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  coverageExclude: [
    // gen-docs data, no logic (scaffold-recipe convention).
    'src/manifest.ts',
    // The bin entry is EXERCISED by `cli-bin.test.ts`, which spawns the real
    // bin — stronger than line coverage, but it runs in a child process where
    // v8's instrumenter cannot see it.
    'src/cli/main.ts',
  ],
})
