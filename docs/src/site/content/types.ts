/**
 * Shape of every file in ./content/*.json (one per product page).
 * Inline markup inside strings is limited to:
 *   `code`        → <Code inline>
 *   {dot:ok}      → <StatusDot tone="ok" />   (also {dot:warn}, {dot:#hex})
 *   <small>…</small> inside fact values → secondary line under the value
 * Render strings through `renderInline()` (kit.tsx); never with innerHTML.
 */
export interface ProductPage {
  id: string
  route: string                 // '/products/<id>'
  name: string
  package: string               // '@pyreon/form', or a family name like 'Pyreon Compat'
  category: string              // 'fundamentals · forms'
  hero: {
    title: string
    /** The one word (or short phrase) of `title` that carries the hook: rendered in the ember gradient with the underline sweep. Must occur in `title`, outside backticks. */
    emberWord: string
    lede: string
    install: string             // shown in <InstallCommand>
    ctaShort: string            // nav pill label
    facts: { key: string; value: string }[]   // always 4
  }
  why: { title: string; items: { title: string; text: string }[] }      // 4 cards, first is `hot`
  difference: null | {
    title: string
    before: { label: string; caption: string; code: string }
    after: { label: string; caption: string; code: string }            // `hot` card
  }
  /**
   * Extra sections between "difference" and "demo" (fold-ins, Native's pipeline, MCP tool list…).
   * Delivered as reference HTML: rebuild with <Section>/<PackageGrid>/<StepCards>/<StatRow>.
   */
  extraSectionsHtml: string | null
  demo: {
    title: string
    text: string
    component: string           // name of the Pyreon component to write, e.g. 'DemoForm'
    reference: string           // canvas page + anchor showing the target behaviour
    referenceHtml: string       // vanilla prototype — behaviour spec, NOT code to port 1:1
    referenceCss: string
    referenceJs: string
  }
  features: { title: string; items: { name: string; text: string }[] }   // 10 items, 2 columns
  api: { title: string; groups: { name: string; items: string[] }[] }
  limits: { title: string; text: string }[]
  related: { href: string; category: string; name: string; text: string; package: string }[]
  end: { title: string; cta: string }
  /** Sourced ONLY from BENCHMARKS.md (record of 2026-11-05). null = no published head-to-head. */
  benchmarks: null | {
    rival: string               // header line: who we measured against, and where
    run: string                 // 'final pass, two runs' | 'overnight run, one run' | …
    h: string                   // section headline
    p: string                   // section intro
    rows: {
      op: string
      pyreon: number | null     // null when the record only publishes a ratio
      rival: number | null
      unit: 'ns' | 'µs' | 'ms' | 'KB' | 'MB' | 'x' | ''
      verdict: 'win' | 'tie' | 'loss' | 'split' | 'info'
      label: string             // the ratio / note shown next to the verdict chip
    }[]
  }
  glyphSvg: string              // inner SVG for a 120×120 viewBox; `url(#eg)` = ember gradient

  // ---- Added 11 Nov 2026 (content pass). All optional; the template renders each when present. ----
  /** Up to three big numbers for a proof band under the hero. Each must be true and sourced. */
  proof?: { stat: string; label: string; source: string }[]
  /** Side-by-side migrations from the library people use today. Both sides are correct, runnable code. */
  comingFrom?: { lib: string; title: string; before: string; after: string; note?: string }[]
  /** Two or three real things to build with it, with working code. */
  recipes?: { title: string; text: string; code: string }[]
  /** The questions a sceptical developer asks, answered plainly. */
  faq?: { q: string; a: string }[]
  /** Not rendered. One entry per non-obvious claim: where in the repo it is backed. */
  sources?: { claim: string; path: string }[]
}

/**
 * Any item object above (`why.items[]`, `features.items[]`, `recipes[]`) may carry
 * `status: 'next release'` when the capability is on `main` but not in the published version.
 * `demo.spec` (optional string) describes a demo's behaviour precisely when it differs from
 * the `demo.reference*` prototype.
 */

export interface ProductIndex {
  order: string[]
  products: { id: string; name: string; package: string; category: string }[]
}
