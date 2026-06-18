import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // Node-suite coverage sits at 100% on all four metrics after the
  // coverage-gaps sweep (extractDocumentTree meta/Path-C/Path-B arms, the
  // flattenChildren array/getter arms, the non-VNode/null/`?? []` defensive
  // arms, resolveStyles' string-dimension fall-throughs + resolveVar
  // non-string passthrough, and the cssValueParser shorthand/line-height
  // edge values). No v8-ignore needed — the one previously-uncountable
  // `parseCssDimension` number-guard branch was resolved by dropping the
  // redundant `value == null` early-return (typeof !== 'string' already
  // covers null/undefined). Floor held at 98 to absorb minor future drift.
  coverageThresholds: { statements: 98, branches: 98, functions: 98, lines: 98 },
})
