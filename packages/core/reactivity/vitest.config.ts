import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  // `reactive-devtools.ts` + `lpih.ts` are DEV-ONLY instrumentation bridges:
  // the entire capture path tree-shakes under NODE_ENV=production (locked by
  // `reactive-devtools-treeshake.test.ts`), so NONE of it runs in a shipped
  // app. They keep dedicated suites (`reactive-devtools.test.ts`, `lpih.test.ts`
  // — ~86-91% branch) but their residual tail is cross-engine stack parsing
  // (JSC/SpiderMonkey forms V8 never emits; `Number.isFinite`-false arms behind
  // a `\d+` regex that can't produce a non-finite) + Node-absent globals
  // (`process.pid` / `performance` undefined). Those are un-exercisable under
  // V8/Node without mocking the runtime (which tests the mock). They're
  // excluded from the PRODUCTION coverage gate — same precedent as the
  // devtools panel — so the gate measures the code that actually ships.
  coverageExclude: ['src/reactive-devtools.ts', 'src/lpih.ts'],
  coverageThresholds: { statements: 98, lines: 99, branches: 98 },
})
