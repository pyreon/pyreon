// Externalize all `echarts` subpath imports.
//
// `vl_rolldown_build` (from `@vitus-labs/tools-rolldown`) auto-externalizes
// packages listed in `dependencies` + `peerDependencies`, but with EXACT
// string matching. The bare `echarts` package is in both lists and gets
// externalized correctly. The dynamic loader at `src/loader.ts` uses
// subpath imports — `import('echarts/charts')`, `import('echarts/components')`,
// `import('echarts/renderers')`, `import('echarts/features')` — and those
// don't match the bare `echarts` external entry, so they end up bundled
// into the published `lib/`.
//
// Before this config: 9 MB compiled lib. The lazy-loading shape was
// correct (consumer apps still tree-shake), but the npm artifact carried
// multi-megabyte ECharts chunks that consumers' bundlers should resolve
// from their own `node_modules` instead.
//
// Listing exact subpaths because rolldown matches strings exactly.
// `echarts` itself stays externalized via package.json (deps + peerDeps).
export default {
  build: {
    external: [
      'echarts/core',
      'echarts/charts',
      'echarts/components',
      'echarts/renderers',
      'echarts/features',
    ],
  },
}
