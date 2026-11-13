import type { ClaimSpec } from './doc-claims'

/**
 * Lint counts on the marketing site (`docs/src/site/content`). Each of these
 * files is a sync target of the staging content set (`09-site/content`, via
 * `docs/scripts/sync-site-content.ts`), except `extra-sections.more.ts`, the
 * typed copy of a product page's extra sections. JSON strings escape their
 * quotes, so a pattern spans `\\"` where the reader sees `"`.
 */
const SITE = 'docs/src/site/content'

export const SITE_LINT_RULE_CLAIMS: ClaimSpec[] = [
  { file: `${SITE}/products/tooling.json`, pattern: /(\d+) lint rules that know/ },
  { file: `${SITE}/products/tooling.json`, pattern: /"value": "(\d+) rules · \d+ categories/ },
  { file: `${SITE}/products/tooling.json`, pattern: /"stat": "(\d+)",\s*"label": "lint rules in/ },
  { file: `${SITE}/products/tooling.json`, pattern: /\\"(\d+) rules in \d+ groups\\"/, all: true },
  { file: `${SITE}/products/tooling.json`, pattern: /<h3>(\d+) rules that know the framework<\/h3>/ },
  { file: `${SITE}/products/tooling.json`, pattern: /turns on \d+ of the (\d+) rules/ },
  { file: `${SITE}/products/tooling.json`, pattern: /"claim": "(\d+) rules, \d+ categories/ },
  { file: `${SITE}/_home.json`, pattern: /"name": "(\d+) lint rules"/ },
  { file: `${SITE}/_home.json`, pattern: /MCP \d+ tools, (\d+) lint rules/ },
  { file: `${SITE}/_products.json`, pattern: /next to (\d+) lint rules/ },
  { file: `${SITE}/pages/why/ai-ready.json`, pattern: /"stat": "(\d+)",\s*"label": "lint rules in/ },
  { file: `${SITE}/pages/why/ai-ready.json`, pattern: /"text": "(\d+) rules in \d+ categories/ },
  { file: `${SITE}/pages/why/ai-ready.json`, pattern: /"claim": "(\d+) lint rules, \d+ categories/ },
  { file: `${SITE}/extra-sections.more.ts`, pattern: /title: '(\d+) rules that know the framework'/ },
]

export const SITE_LINT_CATEGORY_CLAIMS: ClaimSpec[] = [
  { file: `${SITE}/products/tooling.json`, pattern: /"value": "\d+ rules · (\d+) categories/ },
  { file: `${SITE}/products/tooling.json`, pattern: /"label": "lint rules in (\d+) categories/ },
  { file: `${SITE}/products/tooling.json`, pattern: /"claim": "\d+ rules, (\d+) categories/ },
  { file: `${SITE}/_home.json`, pattern: /"name": "\d+ lint rules",\s*"text": "In (\d+) categories/ },
  { file: `${SITE}/pages/why/ai-ready.json`, pattern: /"label": "lint rules in (\d+) categories/ },
  { file: `${SITE}/pages/why/ai-ready.json`, pattern: /"text": "\d+ rules in (\d+) categories/ },
  { file: `${SITE}/pages/why/ai-ready.json`, pattern: /"claim": "\d+ lint rules, (\d+) categories/ },
]
