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
 *
 * The blog posts and the docs share-image alt text quote the count too. A
 * post's source is the marketing pack's `05-blog/B*.md`; the alt text comes
 * from the pack's `09-site/assets` manifest through
 * `docs/scripts/sync-site-assets.ts` into `_docs-og.json` and `_assets.json`.
 * The share image itself prints the same sentence, so re-render it whenever
 * this alt text changes.
 */
const SITE = 'docs/src/site/content'
const BLOG = 'docs/src/content/blog'

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
  { file: `${SITE}/_docs-og.json`, pattern: /next to (\d+) lint rules/, all: true },
  { file: `${SITE}/_assets.json`, pattern: /next to (\d+) lint rules/, all: true },
  { file: `${BLOG}/introducing-pyreon.md`, pattern: /`@pyreon\/lint` has (\d+) rules/ },
  { file: `${BLOG}/a-framework-your-ai-assistant-cant-misuse.md`, pattern: /broader rule set: (\d+) rules in \d+ categories/ },
  { file: `${BLOG}/seven-rules-of-fine-grained-reactivity.md`, pattern: /`@pyreon\/lint`\*\*: (\d+) rules/ },
]

export const SITE_LINT_CATEGORY_CLAIMS: ClaimSpec[] = [
  { file: `${SITE}/products/tooling.json`, pattern: /"value": "\d+ rules · (\d+) categories/ },
  { file: `${SITE}/products/tooling.json`, pattern: /"label": "lint rules in (\d+) categories/ },
  { file: `${SITE}/products/tooling.json`, pattern: /"claim": "\d+ rules, (\d+) categories/ },
  { file: `${SITE}/_home.json`, pattern: /"name": "\d+ lint rules",\s*"text": "In (\d+) categories/ },
  { file: `${SITE}/pages/why/ai-ready.json`, pattern: /"label": "lint rules in (\d+) categories/ },
  { file: `${SITE}/pages/why/ai-ready.json`, pattern: /"text": "\d+ rules in (\d+) categories/ },
  { file: `${SITE}/pages/why/ai-ready.json`, pattern: /"claim": "\d+ lint rules, (\d+) categories/ },
  { file: `${BLOG}/a-framework-your-ai-assistant-cant-misuse.md`, pattern: /broader rule set: \d+ rules in (\d+) categories/ },
]

/**
 * Product count on the marketing site. The list of record is
 * `products/_index.json` (`order`): one id per product page. Every sentence
 * that says how many products there are comes from the staging content set
 * (`09-site/content`), so a new product page changes the number in many files at
 * once: the homepage section, the products index title, the nav's two "All N
 * products" links, the docs home, the sitemap purposes, and the share image's
 * alt text (the share image prints the same sentence, so re-render it when this
 * moves: `render-og.mjs og/products.png`). Forty was stated in six files when
 * the forty-first page was added; none of them was a claim surface.
 */
export const SITE_PRODUCT_COUNT_CLAIMS: ClaimSpec[] = [
  { file: `${SITE}/_home.json`, pattern: /"title": "(\d+) products\. One version\."/ },
  { file: `${SITE}/_home.json`, pattern: /"label": "See all (\d+) products"/ },
  { file: `${SITE}/_products.json`, pattern: /"title": "(\d+) products\. One reactive core\."/ },
  { file: `${SITE}/_docs-home.json`, pattern: /with (\d+) products in the box/ },
  { file: `${SITE}/_docs-home.json`, pattern: /"label": "All (\d+) products"/ },
  { file: `${SITE}/_nav.json`, pattern: /"label": "All (\d+) products"/, all: true },
  { file: `${SITE}/_sitemap.json`, pattern: /Show the whole box: (\d+) products/ },
  { file: `${SITE}/pages/_sitemap.json`, pattern: /Show the whole box: (\d+) products/ },
  { file: `${SITE}/_assets.json`, pattern: /"alt": "(\d+) products\. One reactive core\./ },
  { file: `${SITE}/_assets.json`, pattern: /The glyphs of all (\d+) Pyreon products/ },
]

/**
 * The anti-pattern total on the AI product page. The catalog is
 * `.agents/rules/anti-patterns.md`: one `- **Name**` bullet at column 0 per
 * entry, which is what the MCP `get_anti_patterns` index counts ("N total").
 * The page said 522 for a week while the catalog passed 560, because the
 * number was typed into the staging content set from a run of the tool.
 */
export const SITE_ANTI_PATTERN_CLAIMS: ClaimSpec[] = [
  { file: `${SITE}/products/ai.json`, pattern: /catalog \((\d+) entries on main\)/ },
  { file: `${SITE}/products/ai.json`, pattern: /"stat": "(\d+)",\s*"label": "known mistakes in the anti-pattern catalog/ },
  { file: `${SITE}/products/ai.json`, pattern: /header \\"(\d+) total, page/ },
  { file: `${SITE}/products/ai.json`, pattern: /"claim": "Anti-pattern catalog (\d+) entries/ },
]

/**
 * The package count the marketing site states. Maintainer decision, 2026-11-18:
 * the site and the marketing say 80, deliberately ahead of npm ("count with
 * all packages already": 76 published, plus auth, format, time and ambient).
 * So this is NOT checked against the published count: it is checked against
 * the one constant, `${SITE}/_counts.json` (`packages`), which the staging
 * content set owns, so every statement of the number comes from one place and
 * changing the decision is one edit plus the files below.
 */
export const SITE_PACKAGE_COUNT_FILE = `${SITE}/_counts.json`

export const SITE_PACKAGE_COUNT_CLAIMS: ClaimSpec[] = [
  { file: `${SITE}/_home.json`, pattern: /"text": "(\d+) packages, one version"/ },
  { file: `${SITE}/pages/compare/react.json`, pattern: /(\d+) first-party packages/ },
  { file: `${SITE}/pages/compare/react.json`, pattern: /AGENTS\.md \((\d+) packages\)/ },
  { file: `${SITE}/_products.json`, pattern: /rest of the (\d+) published packages/ },
]
