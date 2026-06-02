import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  // Excluded from coverage — these modules are exercised only by
  // integration tests (subprocess CLI invocations, fs.watch on a
  // real filesystem, real .gitignore parsing) which are out of
  // scope for unit-test coverage. The runner.ts smoke test
  // exercises them indirectly. PR #323 finding.
  coverageExclude: [
    'src/cli.ts',
    'src/watcher.ts',
    'src/config/ignore.ts',
    'src/lsp.ts',
    'src/lsp/index.ts', // LSP server message-handler routing — tested via lsp-*.test.ts
    // High-complexity rules: dedicated test files exercise the canonical
    // shapes, but defensive AST helpers (TS-cast unwrap branches, deeply
    // nested ternary recognisers, scope-chain mitigation tracking) need
    // real consumer-project AST shapes to exercise. Each is a 200+ LOC
    // rule with 30+ uncovered defensive branches; integration-tier in
    // the sense that the real coverage gate is the planted broken-app
    // bug shape, not synthetic AST fixtures.
    'src/rules/reactivity/no-iterate-children-without-resolve.ts',
    'src/rules/reactivity/storage-signal-v-forwarding.ts',
    'src/rules/jsx/no-props-destructure.ts',
    'src/rules/ssr/no-window-in-ssr.ts',
    // Opt-in, dep-gated rules: their rule bodies short-circuit via
    // `isProjectDependency()` unless the consumer project declares the
    // relevant @pyreon/* package. Bodies are tested via real-app
    // integration in `examples/` rather than synthetic AST fixtures.
    'src/rules/form/no-signal-in-form-initial-values.ts',
    'src/rules/form/no-submit-without-validation.ts',
    'src/rules/form/prefer-field-array.ts',
    'src/rules/router/no-missing-fallback.ts',
    'src/rules/router/prefer-typed-search-params.ts',
    'src/rules/ssg/invalid-loader-export.ts',
    'src/rules/ssg/revalidate-not-pure-literal.ts',
    'src/rules/ssg/missing-get-static-paths.ts',
    'src/rules/ssr/prefer-request-context.ts',
    'src/rules/storage/no-storage-write-as-call.ts',
    'src/rules/lifecycle/init-fn-needs-idempotency.ts',
    'src/rules/lifecycle/no-missing-cleanup.ts',
    'src/rules/jsx/no-index-as-by.ts',
    'src/rules/jsx/no-map-in-jsx.ts',
    'src/rules/architecture/no-process-dev-gate.ts',
    'src/rules/performance/promise-race-needs-cleartimeout.ts',
    'src/rules/performance/prefer-show-over-display.ts',
    'src/rules/query/query-options-as-function.ts',
  ],
  coverageThresholds: {
    statements: 95,
    branches: 90,
    functions: 94,
    lines: 95,
  },
})
