import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // Node-suite coverage is 100% statements/functions/lines and ~99% branch
  // after the coverage-gaps sweep + the Fragment/array-return silent-drop
  // fix (extractDocumentTree meta/Path-C/Path-B arms, the Fragment +
  // bare-array flatten arms, the flattenChildren array/getter arms, the
  // non-VNode/null defensive arms, resolveStyles' string-dimension
  // fall-throughs + resolveVar non-string passthrough, and the
  // cssValueParser shorthand/line-height edge values). The one uncovered
  // branch is the Fragment arm's `children ?? []` defensive fallback —
  // unreachable via real `h()` (which always emits a children array),
  // matching the string-element branch's style. No v8-ignore needed. Floor
  // held at 98 to absorb this + minor future drift.
  coverageThresholds: { statements: 98, branches: 98, functions: 98, lines: 98 },
})
