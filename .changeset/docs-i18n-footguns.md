---
"@pyreon/i18n": patch
"@pyreon/mcp": patch
---

docs(i18n): source-verified `mistakes[]` foot-gun catalogs + two previously-undocumented
public exports. Added `resolvePluralCategory` and `parseRichText` to the manifest api[]
(both are exported from index.ts/core.ts but were absent). Enriched mistakes[]
(5 → 10 blocks) on createI18n (plural key naming / CLDR-category-not-count===1 /
reserved `count` key), interpolate (missing value stays literal / bare call ignores
format specs / `\w+`-only placeholders — signature also corrected to include the
`options.format` param), I18nProvider (`value` prop / JSX-only entry), useI18n
(throws without provider / `locale` is a signal). Every fact verified against source
(pluralization.ts Intl.PluralRules, interpolation.ts literal-passthrough,
trans.tsx flat-tag regex, context.ts throw). Regenerates the MCP api-reference
i18n region. Docs/manifest only — no runtime behavior change.
