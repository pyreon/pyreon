/** One place a document states a count, and how to read the number out of it. */
export interface ClaimSpec {
  /** Doc file relative to repo root */
  file: string
  /** Capture group 1 must contain the number */
  pattern: RegExp
  /** Optional pattern variant for "X+" hedged claims (also wrong) */
  rejectHedged?: RegExp
  /**
   * Assert EVERY occurrence of the pattern in the file agrees (not just
   * the first). Required for files that repeat the same count string —
   * e.g. `lint/src/manifest.ts` carries the rule count 5× (3 prose + 2
   * `--list` help comments); bumping 4 of 5 would otherwise pass silent.
   */
  all?: boolean
}

/**
 * Lint counts on the marketing site (`docs/src/site/content`). Each of these
 * files is a sync target of the staging content set (`09-site/content`, via
 * `docs/scripts/sync-site-content.ts`), except `extra-sections.more.ts`, the
 * typed copy of a product page's extra sections. JSON strings escape their
 * quotes, so a pattern spans `\\"` where the reader sees `"`.
 *
 * Fix a drift in the staging set first, then re-sync, or the next sync
 * restores the old number. The site said "133" through two rule additions
 * because none of these files was a claim surface.
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
