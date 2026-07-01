import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'zero',
  // The CLI is integration-tier: every command spawns Vite / scans the FS /
  // writes files, exercised by scaffold-smoke + example builds, not Node-side
  // vitest. Only the pure banner formatters (dev-banner.ts) are unit-tested,
  // so every IO command file is excluded from coverage.
  coverageExclude: [
    'src/index.ts',
    'src/commands/build.ts',
    'src/commands/context.ts',
    'src/commands/create.ts',
    'src/commands/dev.ts',
    'src/commands/doctor.ts',
    'src/commands/load-config.ts',
    'src/commands/preview.ts',
  ],
})
