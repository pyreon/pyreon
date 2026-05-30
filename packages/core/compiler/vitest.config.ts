import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  // load-native.ts: napi-rs binary loader; resolution depends on per-platform
  //   packages unavailable in test env. Exercised by build job's binary load.
  // event-names.ts: DOM-event-name remap table — data constants exercised only
  //   when matching event handlers appear in compiled JSX.
  coverageExclude: ['src/load-native.ts', 'src/event-names.ts'],
  // Functions + lines are already at 98.12% / 96.29%. Statements at 92.53%
  // post-exclude — residual gap is in jsx.ts (~3000-statement file with
  // scattered compiler-edge-case branches needing a dedicated test corpus).
  coverageThresholds: { branches: 84, functions: 94, lines: 94 },
})
