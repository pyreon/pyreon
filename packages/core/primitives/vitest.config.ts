import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // Branch threshold at 85% (default 90%) due to structurally-
  // unreachable defensive `?? '0'` fallbacks in
  // `web/tokens.ts:resolveSpace`/`resolveRadius` — the type system
  // constrains inputs to the canonical Space / Radius sets so the
  // fallback branches never fire at runtime. Coverage counts the
  // branch sides but no test can reach them without an `as any` cast.
  //
  // Statements / functions / lines stay at the 90% default.
  // Same pattern as @pyreon/runtime-dom (see its vitest.config.ts
  // for the precedent + structurally-uncoverable branch enumeration).
  coverageThresholds: { statements: 95, lines: 94, branches: 85 },
})
