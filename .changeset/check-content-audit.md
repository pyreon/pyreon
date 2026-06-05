---
'@pyreon/compiler': minor
'@pyreon/cli': minor
---

`pyreon doctor --check-content` audit — defensive gate for `@pyreon/zero-content`-shaped apps. Mirrors the existing `--check-islands` / `--check-ssg` audits: project-wide cross-file detectors with file:line:column pointers and actionable fix messages, surfaced through the unified doctor pipeline.

Three detector codes ship:

- **`missing-frontmatter-title`** (error) — a `.md` file under a `pages` collection has no `title:` field in its YAML frontmatter. Every documented collection schema requires it for sidebar / SEO / route naming. The content() plugin catches this at build time; the audit catches it at edit time so authors don't ship a silently broken page.
- **`broken-internal-link`** (error) — a markdown `[text](/path)` link where `/path` matches a collection's URL pattern but no entry with that slug exists. Users hit 404 at runtime; the audit catches it before commit so the link can be fixed alongside the referenced page's rename / removal.
- **`orphaned-md-file`** (warning) — a `.md` file under `src/content/` (or `content/`) that isn't under any declared collection's `path`. The runtime ignores it silently; the user thinks the page is published but the build skips it. Severity is `warning` because it might be intentional WIP.

Same pure-syntactic style as the existing `island-audit.ts` / `ssg-audit.ts` — TypeScript compiler API for parsing `content.config.{ts,mts,js,mjs}`, naive line-by-line walker for frontmatter + internal-link extraction. No type-check pass, no module resolution. False negatives acceptable; false positives must be rare.

CLI:

```bash
pyreon doctor --check-content          # legacy single-purpose flag (equivalent to --only content-audit)
pyreon doctor --only content-audit     # canonical
pyreon doctor                          # included in the default fast-gate set
pyreon doctor --json                   # machine-readable
pyreon doctor --gha                    # GitHub Actions annotations
```

New exports from `@pyreon/compiler`: `auditContent`, `formatContentFindings`, `parseContentConfig`, `findContentConfigs`, `readFrontmatter`, `readTitleFromFrontmatter`, `deriveSlug`, `extractInternalLinks` (+ corresponding types `ContentAuditResult`, `ContentFinding`, `ContentFindingCode`, `ContentLocation`, `CollectionDecl`, `AuditContentOptions`).

35 per-detector specs in `packages/core/compiler/src/tests/content-audit.test.ts` (bisect-verified: reverting the missing-title condition → 3 specs fail with `expect(codes).toContain('missing-frontmatter-title')`; restored → 35/35 pass).
