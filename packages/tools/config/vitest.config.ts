import { defineNodeConfig } from '@pyreon/vitest-config'

// `includeIndexInCoverage` because this package's implementation IS
// `src/index.ts` — `defineConfig`, `CONFIG_FILENAMES`, `sectionFrom` are all
// there, and there is no other source file. The shared config excludes
// `src/**/index.ts` by default (a re-export barrel carries no logic worth
// measuring), so without this the coverage run measures ZERO files and reports
// `0%` while nine tests pass. Same trap `@pyreon/store` hit in #2167 and
// `@pyreon/runtime-server` before it.
export default defineNodeConfig({ category: 'tools', includeIndexInCoverage: true })
