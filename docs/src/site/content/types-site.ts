/**
 * Shapes of the site-level content files in ./content/_*.json (product pages use ./types.ts).
 * Inline markup in strings follows types.ts: `code` and {dot:ok|warn|#hex} only, rendered with
 * renderInline(); never innerHTML. Code fields hold source text and are escaped by the renderer.
 * `source`/`sources` fields are not rendered: they say where each claim is backed.
 */

// ---------------------------------------------------------------- shared
export type Verdict = 'win' | 'tie' | 'loss' | 'split' | 'info'
export interface SiteLink { label: string; href: string }
/** A big number with its run condition ("one run", "two runs", "bun") and its record line. */
export interface SiteProof { stat: string; label: string; condition: string; source: string }
export interface Source { claim: string; path: string }
export type SourceRef = Source
export type ItemStatus = 'next release'                                  // on main, not on npm yet
export interface Cta { label: string; href?: string; command?: string }   // command → <InstallCommand>
export interface CodeSide { label: string; file: string; code: string }
export interface CtaBlock { title: string; command: string; secondary: { label: string; href: string } }

/**
 * Community channels that may not exist yet. Their addresses live in the app
 * (`docs/src/site-links.ts`, `null` = not open). While a channel is closed the
 * app drops every list item that links to it (`href`/`route` `/discord`,
 * `https://pyreon.dev/discord`, likewise `/newsletter`) and builds no page for
 * it, so write the copy for a site WITHOUT the channel. Where a sentence or a
 * single link would name the channel once it opens, put that version in
 * `withChannel`: the app merges `withChannel[<id>]` over the object while the
 * channel is open, and drops the key either way.
 */
export type ChannelId = 'discord' | 'newsletter'
export interface WithChannel<T> { withChannel?: Partial<Record<ChannelId, Partial<T>>> }

// ---------------------------------------------------------------- _home.json
/** Section order is the array order. `kind` picks the component (see visual-alignment.md §C). */
export type HomeSection =
  | { kind: 'hero'; id: string; variant: 'hook' | 'default'; eyebrow: string; title: string; emberWord: string
      lede: string; install: string; ctas: SiteLink[]
      status: { dot: 'ok' | 'warn'; text: string; href?: string }[]
      alternatives: { title: string; emberWord: string; useWhen: string }[]
      visual: { kind: 'three-targets'; file: string; fileNote: string; code: string; items: string[]
        targets: { label: string; caption: string }[]; note: string } }
  | { kind: 'proof-band'; id: string; title: string
      items: (SiteProof & { detail: string })[]; caveat: string; link: SiteLink }          // ≤ 3 items
  | { kind: 'once'; id: string; eyebrow: string; title: string; lede: string
      counter: { code: string; metrics: { label: string; value: string; live: boolean }[]; spec: string }
      bench: { op: string; rival: string; result: string; verdict: Verdict }[]; caveat: string; link: SiteLink }
  | { kind: 'diff'; id: string; eyebrow: string; title: string; lede: string
      rows: ['-' | '+' | ' ', string][]; caption: string; link: SiteLink }
  | { kind: 'strip'; id: string; eyebrow: string; title: string; lede: string
      items: { stat: string; label: string; rival: string; condition: string; href: string }[]
      caveat: string; link: SiteLink }
  | { kind: 'compare'; id: string; eyebrow: string; title: string; lede: string; columns: string[]
      rows: { topic: string; cells: string[]; pyreonBehind?: boolean }[]   // cells[0] = Pyreon
      note: string; links: SiteLink[]; source: string }
  | { kind: 'platforms'; id: string; eyebrow: string; title: string; lede: string
      mappings: { pyreon: string; ios: string; android: string }[]; points: string[]; install: string
      status: { dot: 'warn'; text: string; href: string }; link: SiteLink }
  | { kind: 'ai'; id: string; eyebrow: string; title: string; lede: string
      items: { name: string; text: string }[]; example: { code: string; finding: string }
      install: string; link: SiteLink }
  | { kind: 'audiences'; id: string; eyebrow: string; title: string; lede: string
      items: { title: string; text: string; tags: string[] }[] }                     // tags = product ids
  | { kind: 'products'; id: string; eyebrow: string; title: string; lede: string
      featured: { id: string; width: 'full' | 'half' | 'third' }[]; pitchesFrom: string; link: SiteLink }
  | { kind: 'migrate'; id: string; eyebrow: string; title: string; lede: string
      layers: { name: string; package: string; href: string }[]; install: string; link: SiteLink }
  | { kind: 'status'; id: string; eyebrow: string; title: string; lede: string
      columns: { dot: 'ok' | 'warn'; label: string; title: string; items: string[] }[]; link: SiteLink }
  | { kind: 'evidence'; id: string; eyebrow: string; title: string; lede: string; command: string
      items: { title: string; text: string }[]; link: SiteLink }
  | { kind: 'cta'; id: string; title: string; lede: string; install: string; secondary: SiteLink
      native: { label: string; command: string }; community: SiteLink[] }

export interface HomePage {
  id: 'home'; route: '/'; reference: string
  meta: { title: string; description: string
    share: { template: 'home'; title: string; sub: string; caveat: string } }
  sections: HomeSection[]
  /** New destinations and where they sit (nav / footer), with their state on main. */
  destinations: { href: string; state: 'live' | 'open PR' | 'redirect pending'; nav: 'main' | 'icon' | 'none'
    footer: string; note: string }[]
  sources: Source[]
}

// ---------------------------------------------------------------- _nav.json
export interface NavMenuItem { label: string; href: string; sub?: string }
export interface MegaItem { id: string; name: string; href: string; sub: string; badge?: 'experimental' | 'next release' }
export interface SiteNav {
  brand: { href: '/'; label: string; logo: string }
  main: (
    | { label: string; kind: 'mega'; panel: 'products' }
    | { label: string; kind: 'menu'; items: NavMenuItem[]; footerOfMenu: { label: string; items: SiteLink[] }[] }
    | { label: string; href: string; showWhen?: string }
  )[]
  actions: { kind: 'github' | 'discord' | 'theme' | 'primary'; label?: string; href?: string; ariaLabel?: string
    command?: string; showWhen?: string }[]
  megaMenu: { id: 'products'; columns: { id: string; title: string; items: MegaItem[] }[]; footer: SiteLink[] }
  contextual: { note: string; primaryByTemplate: Record<string, { label: string; href?: string; copies?: string }> }
  mobile: { breakpoint: number; button: { open: string; close: string }
    sheet: { big: (SiteLink & { showWhen?: string })[]; sections: { title: string; items: string }[]
      install: string; footer: SiteLink[] }
    a11y: string }
  footer: { tagline: string; install: string
    columns: { title: string; links: (SiteLink & { showWhen?: string })[] }[]
    bottom: { left: string; right: string } }
}

// ---------------------------------------------------------------- _sitemap.json
export type TemplateId = 'home' | 'product' | 'products-index' | 'story' | 'compare' | 'migrate' | 'benchmarks'
  | 'showcase' | 'blog-index' | 'blog-post' | 'docs' | 'plain' | '404' | 'redirect'
export interface SitemapPage {
  route: string; title: string
  purpose: string                       // one line
  audience: string                      // 'developer' | 'tech lead' | both
  primaryCta: string
  content: string | null                // the file (and path) that feeds it
  template: TemplateId
  reference: string | null              // canvas page, or null = no canvas design
  decision: 'keep' | 'merge' | 'drop'
  reason?: string
  state: 'live' | 'redesign' | 'new' | 'open PR' | 'redirect pending'
  status?: ItemStatus
  note?: string
}
export interface Sitemap {
  version: string; note: string
  sections: { section: string; nav?: string; decisionNote?: string; pages: SitemapPage[] }[]
  decisions: { route: string; decision: 'drop' | 'merge' | string; reason: string }[]
}

// ---------------------------------------------------------------- _benchmarks.json
export interface BenchmarksPage {
  record: string
  frameworks: string[]
  rowBoard: Record<string, number[]>    // ms, same order as frameworks, run 1
  rowVerdicts: Record<string, [Verdict, string]>
  scenarios: { op: string; pyreon: string; rival: string; verdict: Verdict; label: string }[]
  scaling: {
    sizes: string[]
    select: Record<string, number[]>    // µs per op
    'partial update': Record<string, number[]>
    swap: Record<string, number[]>
  }
  ssr: { rows: string; pyreon: number; vue: number; svelte: number; react: number }[]   // µs per render
  bundle: [name: string, kb: number][]
  reactivity: Record<string, [test: string, pyreon: number, preact: number, solid: number, verdict: Verdict, margin: string][]>
  forms: [op: string, pyreonUs: number, rivals: [name: string, us: number][]][]
  todomvc: [op: string, pyreon: string, react: string, ratio: string][]
  losses: [title: string, text: string][]
  withdrawn: [claim: string, reason: string][]
  competitors: string[]
  method: [title: string, text: string][]
  heroStats: SiteProof[]
  caveat: string
  lossesSection: { title: string; intro: string }
  harnessBugs: { count: number; title: string; intro: string; items: { title: string; text: string; pr: string }[] }
  reproduce: { title: string; intro: string; command: string; allSuites: string; note: string }   // allSuites holds <pkg>-style params: escape
  krausest: string
  template: BenchmarksTemplate
}

/**
 * Page-template copy (`template` in _benchmarks/_why/_compare/_migrate.json): the headings, labels,
 * captions and notes the page templates print around the data. `{name}` is a placeholder the template
 * fills (fill() in the app); every other character is printed as written.
 */
/** A section head: the small label, the h2, the lede under it. */
export interface TemplateHead { label: string; title: string; text: string }
/** A chart with its table alternative: the chart's scroll label, the disclosure summary, the table caption. */
export interface TemplateChart { chart: string; table: string; caption: string }
/** Section ids on /benchmarks, in page order (the jump links). */
export type BenchJumpId = 'method' | 'row-board' | 'scenarios' | 'scaling' | 'ssr' | 'apps' | 'bundle' | 'reactivity'
  | 'every-product' | 'losses' | 'withdrawn' | 'harness' | 'reproduce'
export interface BenchmarksTemplate {
  meta: { title: string; description: string }
  hero: { eyebrow: string /* {date} {count} */; title: string; lede: string; statsLabel: string; jumpsLabel: string }
  jumps: Record<BenchJumpId, string>
  method: TemplateHead & { guide: { text: string; link: SiteLink } }
  rows: TemplateHead & TemplateChart & { columns: { op: string; verdict: string }; run: string
    initial: string                      // the rowBoard operation the static chart shows
    fastestFirst: string                 // {op} {list}
    live: { control: string; title: string /* {op} */; pyreon: string; others: string } }
  scenarios: TemplateHead & { columns: { op: string; pyreon: string; rival: string; verdict: string }; run: string }
  scaling: TemplateHead & TemplateChart /* caption: {op} */ & { columns: { framework: string; size: string /* {size} */ }; run: string
    live: { control: string; title: string /* {op} */; note: string /* {op} */ } }
  ssr: TemplateHead & TemplateChart & { columns: { rows: string; pyreon: string; vue: string; svelte: string; react: string }; run: string }
  apps: TemplateHead & { run: string
    forms: TemplateChart & { columns: { op: string; pyreon: string; rivals: string } }
    todomvc: TemplateChart & { columns: { op: string; pyreon: string; react: string; ratio: string } } }
  bundle: TemplateHead & TemplateChart & { columns: { framework: string; kb: string }; run: string }
  reactivity: TemplateHead & { control: string; caption: string /* {engine} */; run: string
    columns: { test: string; pyreon: string; preact: string; solid: string; verdict: string } }
  products: TemplateHead & { control: string; filters: { all: string; win: string; loss: string; info: string }
    shown: string                        // {shown} {total}
    card: string                         // {name} {headline} {tally}: the card's accessible name
    tally: Record<Verdict, [one: string, many: string]> }
  losses: { label: string }
  withdrawn: TemplateHead & { tag: string }
  harness: { label: string /* {count} */; pr: string /* {n} */ }
  reproduce: { label: string; command: string; allSuites: string; competitors: string /* {count} */; more: SiteLink; guide: SiteLink }
}

// ---------------------------------------------------------------- _products.json
export type ProductGroupId = 'build' | 'foundations' | 'data' | 'visual' | 'tools'
export interface ProductsIndexPage {
  hero: { eyebrow: string; title: string; lede: string }
  groupingNote: string
  groups: { id: ProductGroupId; title: string; text: string; productIds: string[] }[]
  products: {
    id: string; name: string; package: string
    group: ProductGroupId
    href: string                        // '/products/<id>'
    pitch: string                       // inline `code` markup only
    proof?: SiteProof
    status?: 'experimental' | 'next release'
  }[]
  underneath: { text: string; link: SiteLink }
  proofFooter: string
  proofFooterLink: SiteLink
  end: { title: string; text: string
    primary: { label: string; command: string }; secondary: { label: string; command: string }; tertiary: SiteLink }
}

// ---------------------------------------------------------------- _docs.json
export interface SidebarBadge { kind: 'preview' | 'new' | 'proof'; text: string; source: string }
export interface DocsSidebarItem {
  title: string
  href: string                          // '/docs' or '/docs/<path without .md>'
  productId?: string
  badge?: SidebarBadge
  children?: DocsSidebarItem[]
}
export interface DocsNav {
  generatedFrom: { repo: string; commit: string; date: string }
  current: {
    pageCount: number
    pages: { path: string; title: string; href: string }[]
    sidebar: { definedIn: string; note: string
      groups: { text: string; tier: string | null; collapsed: boolean; slugs: string[]; source: string }[] }
  }
  sidebar: { group: 'Get started' | 'Build' | 'Data and state' | 'Visual and content' | 'Developer tools' | 'Guides' | 'Migrate' | 'Reference'
    items: DocsSidebarItem[] }[]
  flags: {
    noGroup: { path: string; title: string; placedIn: string; note: string }[]
    duplicates: { pages: string[]; verdict: string; note: string }[]
    gaps: { productId: string | null; package?: string; note: string }[]
    statusLabelConflicts: { path: string; note: string }[]
  }
  overviews: {
    productId: string; name: string
    docsPage: string | null             // path relative to docs/src/content/docs
    docsHref: string
    gapNote?: string
    closestPage?: string
    pitch: string                       // 'content/<id>.json#hero'
    demo: string                        // 'content/<id>.json#demo'
    bench: string | null                // 'content/<id>.json#benchmarks'
    benchNote?: string
    comingFrom: { lib: string; ref: string } | null
    crossSell: string[]
  }[]
}

// ---------------------------------------------------------------- _docs-home.json
export interface DocsHome {
  meta: { title: string; description: string }
  banner: { kind: 'preview'; label: string; text: string; link: SiteLink; source: string }
  hero: { eyebrow: string; title: string; lede: string }
  startHere: {
    id: 'web' | 'apps' | 'react' | 'one'
    title: string; text: string; command: string
    alt?: { label: string; command: string }
    href: string; productIds: string[]
    status?: 'experimental'
    source: string
  }[]
  tiles: { title: string; text: string; items: { productId: string; name: string; href: string; proof: SiteProof }[]; link: SiteLink }
  whyFast: {
    title: string; text: string
    code: { file: string; lang: 'tsx'; source: string }
    compiled: { label: string; lang: 'js'; source: string }
    live: { component: string; note: string }
    link: SiteLink
    source: string
  }
  proofStrip: { items: SiteProof[]; footer: string; link: SiteLink }
  whatsNew: {
    title: string; text: string
    items: { area: string; title: string; text: string; href: string; status: 'next release'; kind?: 'breaking'; source: string }[]
    footer: string
    link: SiteLink
  }
  counts: { docPages: string; note: string }
  next: SiteLink
}

// ---------------------------------------------------------------- _why.json / _project.json
export type SiteSection =
  | { kind: 'proof'; title: string; note?: string; stats: SiteProof[] }  // up to 3
  | { kind: 'diff'; title: string; caption: string
      before: { label: string; code: string }; after: { label: string; code: string } }
  | { kind: 'code'; title: string; text?: string; caption?: string
      blocks: { label: string; lang: string; code: string }[] }        // 1–3 tabs or side by side
  | { kind: 'story'; title: string; text: string[] }                   // paragraphs
  | { kind: 'steps'; title: string; items: { title: string; text: string; code?: string }[] }
  | { kind: 'list'; title: string; text?: string
      items: { title: string; text: string; code?: string; status?: ItemStatus }[] }
  | { kind: 'quote'; text: string; attribution: string; href?: string } // 'Pyreon docs' | 'Pyreon benchmark record'
  | { kind: 'compare-strip'; title: string; items: { label: string; before: string; after: string }[] }
  | { kind: 'faq'; title: string; items: { q: string; a: string }[] }
  | { kind: 'links'; title: string; items: ({ label: string; href: string; text: string } & WithChannel<{ label: string; href: string; text: string }>)[] }
  | { kind: 'note'; text: string; href?: string }                      // small fine-print line
  | { kind: 'table'; title: string; columns: string[]; rows: string[][] }
  | { kind: 'logos'; title: string; text: string
      items: { file: string; href: string; use: string; background: string }[] }
  | { kind: 'palette'; title: string; text: string
      swatches: { name: string; hex: string; role: string }[]
      gradient: { name: string; css: string; role: string } }
  | { kind: 'type'; title: string; faces: { name: string; weights: number[]; role: string; href: string }[] }
  | { kind: 'dodont'; title: string; items: { do: string; dont: string; why: string }[] }

export interface WhyPage {
  id: 'components-run-once' | 'one-codebase' | 'ai-ready' | 'performance' | 'full-stack'
  route: string                         // '/why/<id>'
  title: string
  hook: { eyebrow: string; title: string; lede: string; cta: Cta }
  sections: SiteSection[]
  end: { title: string; cta: Cta & { command: string } }   // the end CTA is always an install command
  share: { ogTitle: string; ogSub: string }
  sources: Source[]
}
/** The labels SiteSections prints above each section kind (why and project pages). */
export interface SiteSectionLabels {
  proofCaveat: string; proofLink: SiteLink; diff: string; code: string; steps: string; list: string
  compareStrip: string; faq: string; links: string; noteLink: string; table: string
}
export interface WhyTemplate {
  meta: { title: string /* {title} = share.ogTitle */ }
  index: { title: string; label: string /* {title} */ }   // /why forwards to the first page
  switcher: string
  heroLink: SiteLink                    // beside the install command when hook.cta has no href
  tryIt: TemplateHead                   // the live counter on components-run-once
  diagram: { scroll: string; handOff: string }
  sections: SiteSectionLabels
}
export interface WhyFile { pages: WhyPage[]; template: WhyTemplate }

export interface ProjectPage {
  id: 'status' | 'releases' | 'community' | 'brand'
  route: string
  title: string
  lede: string
  sections: SiteSection[]
  end: { title: string; cta: Cta & WithChannel<Cta> }
  sources: Source[]
}
export interface NotFoundPage {
  id: 'not-found'; route: '/404'; code: string; title: string; text: string; lede: string
  snippet: string                       // one line of code, rendered mono
  links: { label: string; href: string; text: string }[]
  sources: Source[]
}
export interface ProjectFile { status: ProjectPage; releases: ProjectPage; community: ProjectPage; brand: ProjectPage; notFound: NotFoundPage }

// ---------------------------------------------------------------- _compare.json
export type CompareVerdict = 'pyreon' | 'rival' | 'tie' | 'different'
export interface ComparePage {
  id: 'react' | 'next' | 'solid' | 'vue' | 'svelte' | 'react-native'
  route: string                         // '/compare/<id>'
  rival: string
  rivalMeasured: string | null          // versions in the record; null = no head-to-head
  hook: { eyebrow: string; title: string; lede: string }
  proof: SiteProof[]                    // ≤ 3
  table: { title: string; note: string
    rows: { topic: string; pyreon: string; rival: string; verdict: CompareVerdict; source: string }[] }
  code: { title: string; caption: string; rival: CodeSide; pyreon: CodeSide; checked: string }
  deletes: null | { title: string; items: { what: string; instead: string }[] }
  pickTheOther: { title: string; items: string[] }   // rendered low on the page, plain
  migrate: { title: string; text: string; href: string; label: string }
  cta: CtaBlock
  sources: SourceRef[]
}
export interface CompareTemplate {
  meta: { title: string /* {rival} {title} */ }
  index: { title: string; label: string /* {rival} */ }  // /compare forwards to the first page
  switcher: string
  proofLink: SiteLink
  table: { label: string; measured: string /* {versions} */; method: SiteLink }
  chart: {
    measured: { label: string; title: string; scroll: string /* {rival} */ }
    diagram: { label: string; title: string; scroll: string /* {rival} */; caveat: string }
    link: SiteLink }
  code: { label: string }
  deletes: { label: string; before: string; after: string; item: string }
  migrate: { eyebrow: string }
}
export interface CompareSite { record: string; caveat: string; order: ComparePage['id'][]; pages: ComparePage[]; template: CompareTemplate }

// ---------------------------------------------------------------- _migrate.json
export interface MigrateLanding {
  id: 'migrate'; route: '/migrate'; productHref: string
  hook: { eyebrow: string; title: string; lede: string }
  steps: { n: number; title: string; text: string; file: string | null; code: string | null }[]
  tools: { title: string; items: { name: string; package: string; what: string; how: string; limits: string }[] }
  layersTitle: string
  guidesTitle: string
  cta: CtaBlock
  sources: SourceRef[]
}
export interface MigrateLayer {
  id: 'react' | 'vue' | 'solid' | 'preact' | 'svelte'
  route: string                         // '/migrate/<id>'
  name: string
  package: string
  hook: { title: string; lede: string }
  covers: string[]
  doesNotCover: string[]
  install: string
  config: { file: string; code: string; note: string }[]
  scaffold: string | null               // null for svelte (create-zero has no svelte option)
  ports: { title: string; before: CodeSide; after: CodeSide; note: string }[]   // 1–2
  docs: SiteLink[]
  sources: SourceRef[]
}
export interface MigrateGuide { id: 'angular' | 'react-native'; name: string; href: string; text: string; why: string }
export interface MigrateTemplate {
  product: string                       // the link to the Migrate product page
  switcher: string
  landing: {
    meta: { title: string /* {title} */ }
    steps: { label: string; title: string; caption: string; scroll: string }
    tools: { label: string; how: string; limits: string }
    layers: { label: string; eyebrow: string /* {name} */; name: string /* {name} */ }
    guides: { label: string }
  }
  layer: {
    meta: { title: string /* {name} {title} */ }
    eyebrow: string                     // {name} {package}
    beforeAfter: { label: string; title: string /* {name} */; caption: string; scroll: string /* {name} */ }
    coverage: { label: string; title: string /* {package} */; covers: string; doesNotCover: string }
    setup: { label: string; title: string; scaffold: string }
    ports: { label: string }
    docs: { label: string; title: string }
  }
}
export interface MigrateSite { landing: MigrateLanding; layers: MigrateLayer[]; guides: MigrateGuide[]; template: MigrateTemplate }

// ---------------------------------------------------------------- blog, showcase, open, discord, newsletter (_channels.json)
// Workstream b of the site integration. The pages that publish and gather: the blog's index,
// tag and post pages (the posts themselves are docs/src/content/blog/*.md), the showcase,
// the live stats page and the two stable links (built only while their channel is open, see
// ChannelId). `{name}` in a string is filled by the page.
export interface ChannelHero { eyebrow: string; title: string; lede: string; actions: Cta[] }
export interface ChannelMeta { title: string; description: string }   // <title> and meta description

export interface BlogChannel {
  route: '/blog'
  meta: ChannelMeta                     // also the blog name (og:site_name, RSS) and its summary
  hero: ChannelHero
  tagsLabel: string                     // accessible name of the tag row
  allTags: string                       // the "every post" chip
  latest: string                        // label above the newest post on page 1
  readPost: string                      // the link line of the featured post
  list: { title: string; text: string } // the rest of the posts
  upNext: { title: string; text: string; planned: string } // scheduled posts on the index; planned: "Planned · {date}"
  empty: { title: string; text: string }
  tag: { eyebrow: string; title: string; lede: string; posts: [one: string, many: string] }   // {tag}, {count}, {posts}
  pager: string                         // accessible name of the pager
  page: string                          // "Page {page} of {pages}"
  newer: string
  older: string
  subscribe: { title: string; text: string; links: SiteLink[] }
  bench: { more: string }              // footer link of a `::: bench` block in a post (to /benchmarks)
  post: {
    back: string
    toc: string
    copyLink: string
    copied: string                      // a copy button after it copied
    byline: string                      // "By {author}"
    share: string
    more: string
    previous: string
    next: string
    related: string
    cta: { title: string; text: string; link: SiteLink }   // the closing card after every post
  }
}

export interface ShowcaseExample {
  dir: string                           // under examples/ in the repo
  title: string
  summary: string
  highlights: string[]                  // @pyreon/<name>, each a dependency of the example (unit-tested)
  run: string                           // one command from the repo root, after the setup command
  open: string                          // where it serves
  note?: string
  liveDemo?: string                     // a static build served from pyreon.dev
  alsoSource?: { label: string; dir: string }[]
}
export interface ShowcaseChannel {
  route: '/showcase'
  meta: ChannelMeta
  hero: ChannelHero
  setup: { title: string; text: string; command: string }
  featured: {
    label: string; title: string; text: string
    example: ShowcaseExample
    captures: { file: string; label: string }[]   // files in assets/manifest.json (slot showcase-card)
  }
  more: { label: string; title: string; text: string; items: ShowcaseExample[] }
  submit: { label: string; title: string; text: string; cta: Cta }
  labels: { source: string; liveDemo: string; open: string /* {url} */; packages: string }
}

export type OpenStatId =
  | 'commits' | 'mergedPrs' | 'releases' | 'publishedPackages' | 'testFiles' | 'lintRules' | 'mcpTools' | 'docPages'
  | 'stars' | 'forks' | 'contributors' | 'openIssues' | 'closedIssues'
export interface OpenTile {
  stat: OpenStatId
  label: string
  href?: string
  hint?: string                         // {latestTag} {latestDate} {browserTestFiles} {lintCategories}
}
export interface OpenChannel {
  route: '/open'
  meta: ChannelMeta
  hero: ChannelHero
  updated: string                       // "Last updated" before the build time
  unavailable: string                   // shown instead of a number that could not be fetched
  work: { label: string; title: string; text: string; tiles: OpenTile[]; note: string; noteLink: SiteLink }
  downloads: { label: string; title: string; text: string; monthly: string; chart: string; chartMissing: string }
  community: { label: string; title: string; text: string; tiles: OpenTile[]; actions: Cta[] }
  benchmarks: { label: string; title: string; text: string; links: { label: string; href: string; text: string }[] }
}

/** `/discord`, `/newsletter`: a redirect to the channel, built only while its address is set. */
export interface StableLinkChannel {
  route: '/discord' | '/newsletter'
  destination: string                   // "the Pyreon Discord"
  meta: ChannelMeta
  redirect: { title: string; text: string; cta: string }   // {destination}
}

export interface ChannelsFile {
  blog: BlogChannel
  showcase: ShowcaseChannel
  open: OpenChannel
  discord: StableLinkChannel
  newsletter: StableLinkChannel
}
