import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  // The split mirrors @pyreon/atlas's (same rationale, same enforcement):
  //
  // MEASURED here (node): the whole core engine (workspace/graph/detect/
  // imports/report), the CLI, and the UI's pure state layer (ui/model.ts,
  // ui/theme.ts) — that is where every contract with logic lives.
  //
  // EXCLUDED: the rocketstyle styled-declaration modules and the views that
  // compose them (running them in node measures "did the module evaluate",
  // not "does the observatory work" — the real-Chromium e2e suite is what
  // proves them), and the vite-booting dev server (proven by the same e2e,
  // which boots the REAL `loom dev`).
  coverageExclude: [
    // gen-docs data, no logic (scaffold-recipe convention).
    'src/manifest.ts',
    // The validate-fast gate entry: a top-level-await script ending in
    // `process.exit`, so importing it under vitest would kill the run. It is
    // NOT unexercised — `bun run validate-fast` executes it against this repo
    // on every invocation (gate name: `loom-scan`), which is stronger coverage
    // than a unit test of the same three lines.
    'src/cli/run-scan-gate.ts',
    'src/ui/bases.tsx',
    'src/ui/chrome.ts',
    'src/ui/kit.ts',
    'src/ui/index.ts',
    'src/ui/Observatory.tsx',
    'src/ui/views/**',
    'src/dev/server.ts',
    'src/tests/fixture.ts',
  ],
})
