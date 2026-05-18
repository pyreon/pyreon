---
'@pyreon/document': patch
'@pyreon/zero': patch
---

Repo sweep: duplication removal + two SSG correctness/robustness fixes.

**`@pyreon/document` — duplication removal (behaviour-preserving).**
- `getTextContent` (recursive node-tree → text flatten) was copy-pasted **byte-identically into 13 of the 18 renderers** (svg/pdf/pptx/xlsx/docx + every chat target). Consolidated into the package's `nodes.ts` as the single source of truth; the 13 copies replaced with an import. (text/markdown/html deliberately walk the tree differently and were left untouched.)
- The HTML/XML escape function (`& < > "`) was copy-pasted **4×** under three names (`escapeHtml`/`escapeXml`/`esc`) into html/svg/email/telegram. Consolidated into `sanitize.ts` as `escapeXml`; renderers import it (aliased to their local names — zero call-site churn). The intentionally-distinct escapes (csv quoting, runtime-server's 5-char+perf-counter variant, the standalone compiler escapes) were correctly left alone — different algorithm/layer.
- Net: ~80 LOC of true duplication removed, no API/behaviour change. Proven by the full `@pyreon/document` suite (441/441) — the per-renderer text/escape tests exercise the consolidated path; identical-body removal verified by `diff` (0 lines).

**`@pyreon/zero` — sitemap duplicate `<url>` (correctness bug).** `generateSitemap` built `allPaths = [...routeScan, ...additionalPaths]` with **no dedup**. The i18n cluster path dedups via `byUnPrefixed`, but the non-i18n branch is a raw 1:1 map — so a static route present in BOTH the route scan AND `additionalPaths` (routine: SSG-emitted paths merged via `seoPlugin`) emitted a **duplicate `<url>`/`<loc>`**. (The nearby "merge dedups" comment was itself inaccurate — that merge is a plain spread.) Now deduped by path (first-wins, order-preserving) at the single source, covering both branches. Regression test: a path in both inputs → exactly one `<loc>`, `<url>` count correct. Bisect-verified.

**`@pyreon/zero` — SSG path-escape + duplicate-path robustness (edge cases).**
- `expandUrlPattern` substituted `getStaticPaths` param values verbatim into what becomes a `dist/<path>/index.html` write target. An unsanitized CMS slug containing `/` (in a single non-catch-all `:slug`) or `.`/`..` traversal segments would escape the intended structure. Now rejected with a clear error (catch-all `:rest*` still spans segments but still rejects `.`/`..`). Bisect-verified.
- `autoDetectStaticPaths` had no dedup — a `getStaticPaths` returning a duplicate slug (CMS dup, pagination overlap) or i18n fan-out collision rendered the same `dist/<path>/index.html` twice (wasted work + last-write race) and fed a duplicate into the SSG→sitemap merge. Now order-preserving deduped. Bisect-verified.

Validation: lint 0 errors; typecheck clean (document + zero); `bun run coverage` exit 0 (document 94.27 %, zero 89.24 %, all thresholds met); `verify-modes` 16/16 (all SSG cells incl. `cpa-pw-blog × ssg` which exercises `getStaticPaths` dynamic-slug enumeration end-to-end through the changed path); zero suites seo 40/40 + ssg-plugin 111/111; document 441/441.

**Deferred (own focused PRs — analysis preserved):** router `findNotFoundFallback` cache — my earlier "just add a WeakMap" estimate was WRONG; its result depends on `urlPath` (not a pure fn of `routes`), so a correct cache needs an enumerate-candidates / pick-by-urlPath refactor, too risky for a sweep. `react-compat`/`preact-compat` `shallowEqual` + React-attr-mapping duplication → core consolidation (medium-risk cross-package). The #626-documented styler `insertCache`/DOM-rule unbounded growth + `internElementBundle` css-prop. No new memory leak found this round (prior sweeps already fixed signal._d / computed.direct / useSortable / ISR).
