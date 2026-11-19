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
  /**
   * The site content derives this number: the sentence carries `{{@<derived>}}` (docs/src/site/derived.ts) instead of
   * digits, so a count in these files is an error, whatever its value. See `markDerived`.
   */
  derived?: string
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
  { file: `${SITE}/products/ai.json`, pattern: /\((\d+) entries in the catalog\)/ },
  { file: `${SITE}/products/ai.json`, pattern: /"stat": "(\d+)",\s*"label": "known mistakes in the anti-pattern catalog/ },
  { file: `${SITE}/products/ai.json`, pattern: /index header \\"(\d+) total\\"/ },
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
  // The blog is Markdown and cannot read the constant, so its copies of the number are checked against it. The marketing
  // pack's sources (05-blog/B03, B06) say the same number.
  { file: `${BLOG}/introducing-pyreon.md`, pattern: /(\d+) published packages, all versioned together/ },
  { file: `${BLOG}/2026-in-review.md`, pattern: /3,881 commits, (\d+) packages and one/ },
  { file: `${BLOG}/2026-in-review.md`, pattern: /empty repository in March to (\d+) packages/ },
  { file: `${BLOG}/2026-in-review.md`, pattern: /merged pull requests, (\d+) published packages/ },
  { file: `${BLOG}/2026-in-review.md`, pattern: /\| published packages \| (\d+) \|/ },
]

/** MCP tools and hooks: facts about the repository the site states in its JSON content (placeholders, like the rest). */
export const SITE_MCP_TOOL_CLAIMS: ClaimSpec[] = [
  { file: `${SITE}/_home.json`, pattern: /"text": "(\d+) tools\./ },
  { file: `${SITE}/_home.json`, pattern: /"claim": "MCP (\d+) tools,/ },
  { file: `${SITE}/_nav.json`, pattern: /"sub": "MCP server, (\d+) tools"/ },
  { file: `${SITE}/_products.json`, pattern: /An MCP server with (\d+) tools:/ },
  { file: `${SITE}/pages/why/ai-ready.json`, pattern: /an MCP server with (\d+) tools, the compiler/ },
  { file: `${SITE}/pages/why/ai-ready.json`, pattern: /"ogSub": "An MCP server with (\d+) tools,/ },
  { file: `${SITE}/pages/why/ai-ready.json`, pattern: /"claim": "(\d+) MCP tools;/ },
  { file: `${SITE}/products/ai.json`, pattern: /any MCP client (\d+) tools:/ },
  { file: `${SITE}/products/ai.json`, pattern: /all (\d+) tools<\/div>/ },
  { file: `${SITE}/products/ai.json`, pattern: /"title": "(\d+) tools, and the pieces around them\."/ },
  { file: `${SITE}/products/ai.json`, pattern: /"claim": "(\d+) tools, names as listed"/ },
  { file: `${SITE}/extra-sections.more.ts`, pattern: /label: 'all (\d+) tools'/ },
]
export const SITE_HOOK_CLAIMS: ClaimSpec[] = [
  { file: `${SITE}/_nav.json`, pattern: /"sub": "(\d+) hooks"/ },
  { file: `${SITE}/products/hooks.json`, pattern: /"title": "(\d+) hooks\. Zero cleanup code to write\."/ },
  { file: `${SITE}/products/hooks.json`, pattern: /"title": "(\d+) hooks\."/ },
  { file: `${SITE}/products/hooks.json`, pattern: /"claim": "(\d+) hooks, 7 categories"/ },
]

/** Content files the build resolves placeholders in: the content JSON and typed sections that are not generated from the asset set. */
const RESOLVED = /\/content\/(?!_assets|_docs-og|visuals\/).+(?<!\.check)\.(json|ts)$/

/** Marks the specs of `list` that sit in a resolved file as derived from `key`. */
export function markDerived(list: ClaimSpec[], key: string): ClaimSpec[] {
  for (const spec of list) {
    if (!RESOLVED.test(`/${spec.file}`)) continue
    spec.derived = key
    // A sentence can name two counts (rules and categories): where the pattern skips one with a plain `\d+`, accept its placeholder too.
    spec.pattern = new RegExp(spec.pattern.source.replace(/(?<!\()\\d\+/g, '(?:\\d+|\\{\\{@[A-Za-z]+\\}\\})'), spec.pattern.flags)
  }

  return list
}
markDerived(SITE_LINT_RULE_CLAIMS, 'lintRuleCount')
markDerived(SITE_LINT_CATEGORY_CLAIMS, 'lintCategoryCount')
markDerived(SITE_PRODUCT_COUNT_CLAIMS, 'productCount')
markDerived(SITE_ANTI_PATTERN_CLAIMS, 'antiPatternCount')
markDerived(SITE_PACKAGE_COUNT_CLAIMS, 'packageCount')
markDerived(SITE_MCP_TOOL_CLAIMS, 'mcpToolCount')
markDerived(SITE_HOOK_CLAIMS, 'hookCount')
