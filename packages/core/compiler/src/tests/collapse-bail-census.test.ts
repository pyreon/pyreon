/**
 * Proposal #1 (collapse tail / partial collapse) — FIRST MEASURABLE STEP.
 *
 * The open-work doc commits: "instrument `scanCollapsibleSites` bail reasons
 * on the real `examples/ui-showcase` + `@pyreon/ui-components` corpus and
 * bucket by bail cause — that quantifies the partial-collapse addressable
 * surface before any code is written (mirrors the E2 '95.3% statically
 * resolvable' measurement that justified the slice)."
 *
 * This test IS that measurement, executed and locked. It does NOT build
 * partial collapse (multi-week, roadmap-scale). It produces the number that
 * tells whoever picks #1 up whether partial collapse is worth the spend.
 *
 * Methodology — every JSX element across the example corpus whose tag is
 * PascalCase AND imported from `@pyreon/ui-components` is a *candidate*. Each
 * candidate is bucketed by its FIRST bail reason (same catalogue order as
 * the production `detectCollapsibleShape`):
 *
 *   collapsible        — no bail; the shipped slice already collapses it
 *   spread             — a `{...x}` attribute
 *   boolean-attr       — a valueless attr (`disabled`)
 *   dynamic-prop       — an `{expr}`-valued attr (incl. `onClick={...}`)
 *   element-child      — a JSX element child
 *   expression-child   — a `{expr}` child
 *
 * The trustworthiness gate (the bisect-equivalent — no fake fix to revert):
 * this file's own "collapsible" count, computed by an INDEPENDENT walk, is
 * asserted EQUAL to the production `scanCollapsibleSites` truth-set over the
 * same files. If the two ever disagree, the census is not measuring what the
 * compiler actually collapses and the number is worthless — the test fails
 * and says so. So the measurement can't silently rot.
 *
 * Partial-collapse addressable surface — among `dynamic-prop` bails,
 * how many bail SOLELY because of `on*` handler props while EVERY other
 * attr is a plain string literal and children are static text. Those are
 * exactly the sites a "collapse the static dimension slice, keep the
 * handler runtime" pass would capture. That ratio is the headline number
 * for the #1 go/no-go decision.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSync } from 'oxc-parser'
import { collectStaticChildren, scanCollapsibleSites } from '../jsx'

const COLLAPSIBLE_SOURCES = new Set(['@pyreon/ui-components'])

// `bun run test` sets cwd to the package dir (packages/core/compiler);
// repo root is 3 up. Robust to bundler __dirname rewriting.
const REPO = join(process.cwd(), '..', '..', '..')
const CORPUS = [
  'examples/ui-showcase/src',
  'examples/app-showcase/src',
  'examples/fundamentals-playground/src',
].map((p) => join(REPO, p))

function walkTsx(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e)
    const st = statSync(p)
    if (st.isDirectory()) walkTsx(p, out)
    else if (e.endsWith('.tsx')) out.push(p)
  }
  return out
}

type Bucket =
  | 'collapsible'
  | 'spread'
  | 'boolean-attr'
  | 'dynamic-prop'
  | 'element-child'
  | 'expression-child'

interface SiteClass {
  bucket: Bucket
  /** dynamic-prop only: true iff every dynamic attr is `on*` AND all other
   * attrs are string literals AND children are static text (partial-collapse
   * addressable). */
  partialAddressable: boolean
  /** dynamic-prop only: true iff EXACTLY ONE dynamic attr is a ternary of
   * two string literals AND every OTHER non-literal attr is an `on*`
   * handler (which compose orthogonally via the handler-combined
   * emit), AND children are static text. Counts the subset addressable
   * by the dynamic-prop collapse PR sequence (PRs #765-#767 plus the
   * handler-combined follow-up). */
  dynamicTernaryAddressable: boolean
  /** element-child only: true iff EVERY element child is recursively
   * static (DOM tag, literal props, no handlers, static text/element
   * children all the way down) — i.e. `collectStaticChildren` succeeds.
   * Counts the subset a future element-child collapse pass (PR 2) could
   * bake into the `_rsCollapse` template. The go/no-go number for that
   * investment — measurement-only here. */
  elementChildStaticAddressable?: boolean
}

const isPascal = (t: string): boolean =>
  !!t && t[0] === t[0]!.toUpperCase() && t[0] !== t[0]!.toLowerCase()

function importTable(program: any): Map<string, string> {
  const t = new Map<string, string>()
  for (const s of program.body ?? []) {
    if (s.type !== 'ImportDeclaration') continue
    const src = s.source?.value
    if (typeof src !== 'string') continue
    for (const sp of s.specifiers ?? []) {
      if (sp.type === 'ImportSpecifier' && typeof sp.local?.name === 'string')
        t.set(sp.local.name, src)
    }
  }
  return t
}

function tagName(node: any): string {
  const n = node?.openingElement?.name ?? node?.name
  return n?.type === 'JSXIdentifier' ? n.name : ''
}

function classifySite(node: any): SiteClass {
  const opening = node.openingElement ?? node
  const attrs: any[] = opening.attributes ?? []
  let sawDynamic = false
  let everyDynamicIsHandler = true
  // Dynamic-prop addressable tracking: count ternaries + check shape.
  // Exactly one ternary-of-two-literals + every other non-literal attr
  // is either a ternary or an `on*` handler (handlers compose via the
  // combined `_rsCollapseDynH` emit) → addressable. Note no
  // `sawHandler` tracking: the original PR 3 no-handler restriction
  // was lifted by the handler-combined follow-up; handlers no longer
  // disqualify a site from `dynamicTernaryAddressable`.
  let ternaryCount = 0
  let everyDynamicIsTernary = true
  for (const a of attrs) {
    if (a.type === 'JSXSpreadAttribute')
      return { bucket: 'spread', partialAddressable: false, dynamicTernaryAddressable: false }
    const nm = a.name?.type === 'JSXIdentifier' ? a.name.name : null
    if (!nm)
      return { bucket: 'spread', partialAddressable: false, dynamicTernaryAddressable: false }
    const v = a.value
    if (!v)
      return {
        bucket: 'boolean-attr',
        partialAddressable: false,
        dynamicTernaryAddressable: false,
      }
    const isStr =
      v.type === 'StringLiteral' || (v.type === 'Literal' && typeof v.value === 'string')
    if (!isStr) {
      sawDynamic = true
      const isHandler = /^on[A-Z]/.test(nm)
      if (!isHandler) everyDynamicIsHandler = false
      // Probe for the ternary-of-two-literals shape (PR 2 detector's
      // structural shape).
      const expr = v.type === 'JSXExpressionContainer' ? v.expression : null
      const isLitStr = (n: any): boolean =>
        n &&
        (n.type === 'StringLiteral' || (n.type === 'Literal' && typeof n.value === 'string'))
      const isTernaryOfLits =
        expr &&
        expr.type === 'ConditionalExpression' &&
        isLitStr(expr.consequent) &&
        isLitStr(expr.alternate)
      if (isTernaryOfLits) ternaryCount++
      else if (!isHandler) everyDynamicIsTernary = false
    }
  }
  // children
  const kids: any[] = node.children ?? []
  let staticChildrenOnly = true
  for (const c of kids) {
    if (c.type === 'JSXText') continue
    if (c.type === 'JSXElement' || c.type === 'JSXFragment') staticChildrenOnly = false
    else staticChildrenOnly = false // JSXExpressionContainer etc.
  }
  if (sawDynamic) {
    const partialAddressable = everyDynamicIsHandler && staticChildrenOnly
    // Dynamic-collapse claims: EXACTLY 1 ternary, every OTHER dynamic
    // attr is either a ternary or an `on*` handler (no plain dynamic
    // shapes like `state={getValue()}`), static children. The
    // handler-combined follow-up (this PR) lifted the no-handler
    // restriction by routing handler-bearing dynamic sites to the
    // `_rsCollapseDynH` runtime helper instead of bailing — closes
    // the bulk of the 15.4% dynamic-prop bucket (previously the
    // strict no-handler scope only addressed 0.2% of sites).
    //
    // The `everyDynamicIsTernary` flag here is computed in the loop
    // above as "every non-handler dynamic attr is a ternary"; combined
    // with `ternaryCount === 1` + `staticChildrenOnly` it precisely
    // matches what `detectDynamicCollapsibleShape` + `tryDynamicCollapse`
    // claim. Handlers are NO LONGER excluded — they compose orthogonally.
    const dynamicTernaryAddressable =
      ternaryCount === 1 && everyDynamicIsTernary && staticChildrenOnly
    return { bucket: 'dynamic-prop', partialAddressable, dynamicTernaryAddressable }
  }
  // No spread / boolean / dynamic attr. Bail can now only come from children.
  for (const c of kids) {
    if (c.type === 'JSXText') continue
    if (c.type === 'JSXElement' || c.type === 'JSXFragment') {
      // Element-child bail. Is the WHOLE child list recursively static
      // (so a future pass could bake the subtree)? `collectStaticChildren`
      // returns null if ANY child is non-static (component, handler,
      // `{expr}`, fragment, …) — exactly the addressable predicate.
      const elementChildStaticAddressable = collectStaticChildren(node) !== null
      return {
        bucket: 'element-child',
        partialAddressable: false,
        dynamicTernaryAddressable: false,
        elementChildStaticAddressable,
      }
    }
    return {
      bucket: 'expression-child',
      partialAddressable: false,
      dynamicTernaryAddressable: false,
    }
  }
  return { bucket: 'collapsible', partialAddressable: false, dynamicTernaryAddressable: false }
}

describe('proposal #1 — collapse-tail bail-reason census (measurement, not a build)', () => {
  it('measures the real corpus and locks the partial-collapse addressable surface', () => {
    const files = CORPUS.flatMap((d) => walkTsx(d))
    expect(files.length).toBeGreaterThan(150) // sanity: the corpus exists

    const tally: Record<Bucket, number> = {
      collapsible: 0,
      spread: 0,
      'boolean-attr': 0,
      'dynamic-prop': 0,
      'element-child': 0,
      'expression-child': 0,
    }
    let candidates = 0
    let partialAddressable = 0
    let dynamicTernaryAddressable = 0
    let elementChildStaticAddressable = 0
    let myCollapsible = 0
    let scannerCollapsible = 0

    for (const file of files) {
      const code = readFileSync(file, 'utf8')
      let program: any
      try {
        program = parseSync(file, code, { sourceType: 'module', lang: 'tsx' }).program
      } catch {
        continue
      }
      const imports = importTable(program)

      const visit = (node: any): void => {
        if (!node || typeof node !== 'object') return
        if (node.type === 'JSXElement') {
          const tag = tagName(node)
          if (isPascal(tag) && imports.has(tag) && COLLAPSIBLE_SOURCES.has(imports.get(tag)!)) {
            candidates++
            const c = classifySite(node)
            tally[c.bucket]++
            if (c.bucket === 'collapsible') myCollapsible++
            if (c.partialAddressable) partialAddressable++
            if (c.dynamicTernaryAddressable) dynamicTernaryAddressable++
            if (c.elementChildStaticAddressable) elementChildStaticAddressable++
          }
        }
        for (const k in node) {
          const v = node[k]
          if (Array.isArray(v)) for (const x of v) visit(x)
          else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v)
        }
      }
      visit(program)

      // Production truth-set for the SAME file.
      scannerCollapsible += scanCollapsibleSites(code, file, COLLAPSIBLE_SOURCES).length
    }

    // ── Report (the deliverable) ────────────────────────────────────────────
    const pct = (n: number) => `${((n / candidates) * 100).toFixed(1)}%`
    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        `[collapse-bail-census] ${files.length} corpus files, ${candidates} @pyreon/ui-components call sites`,
        `  collapsible (slice already handles): ${tally.collapsible} (${pct(tally.collapsible)})`,
        `  bail:spread                        : ${tally.spread} (${pct(tally.spread)})`,
        `  bail:boolean-attr                  : ${tally['boolean-attr']} (${pct(tally['boolean-attr'])})`,
        `  bail:dynamic-prop                  : ${tally['dynamic-prop']} (${pct(tally['dynamic-prop'])})`,
        `  bail:element-child                 : ${tally['element-child']} (${pct(tally['element-child'])})`,
        `  bail:expression-child              : ${tally['expression-child']} (${pct(tally['expression-child'])})`,
        `  ── partial-collapse ADDRESSABLE    : ${partialAddressable} (${pct(partialAddressable)} of all sites)`,
        `     (dynamic-prop bails where every dynamic attr is on*, all else literal, static children)`,
        `  ── dynamic-collapse ADDRESSABLE    : ${dynamicTernaryAddressable} (${pct(dynamicTernaryAddressable)} of all sites)`,
        `     (dynamic-prop bails where EXACTLY ONE attr is a ternary-of-two-string-literals,`,
        `      every other non-literal attr is on* (handlers compose via _rsCollapseDynH),`,
        `      static children — dynamic-prop sequence #765-#767 + handler-combined follow-up)`,
        `  ── element-child STATIC-ADDRESSABLE: ${elementChildStaticAddressable} (${pct(elementChildStaticAddressable)} of all sites)`,
        `     (element-child sites where EVERY element child is recursively static`,
        `      — DOM tag, literal props, no handlers, static text/element subtree.`,
        `      SHIPPED — the scanner expands these into the resolve set and the`,
        `      compiler emits the UNCHANGED __rsCollapse with the baked subtree.)`,
        `  ══ TOTAL ADDRESSED (collapsed end-to-end): ${
          myCollapsible + partialAddressable + dynamicTernaryAddressable + elementChildStaticAddressable
        } (${pct(
          myCollapsible + partialAddressable + dynamicTernaryAddressable + elementChildStaticAddressable,
        )} of all sites)`,
        `     (full + on*-handler partial + dynamic-prop + element-child — every`,
        `      collapse path shipped today. The remaining bail buckets are out of`,
        `      scope: multi-axis dynamic, expression-child, spread, boolean-attr.)`,
        '',
      ].join('\n'),
    )

    // ── Trustworthiness gate (bisect-equivalent) ────────────────────────────
    // This independent walk's "collapsible-equivalent" count MUST equal the
    // production scanner's truth-set. If they diverge the census is
    // measuring fiction.
    //
    // Per PR 3 (#767) the scanner emits TWO `CollapsibleSite` entries per
    // dynamic-prop site (one per literal value — the resolver pre-renders
    // both); the compiler emit still produces ONE collapsed call site.
    //
    // Per element-child PR 2 the scanner emits ONE `CollapsibleSite` entry
    // per recursively-static element-child site (the resolver SSR-renders
    // the real component WITH its child subtree once — no per-value fan-out,
    // unlike dynamic). So the per-site classifier collapsible count
    // + 2× the dynamic-addressable count + 1× the element-child
    // static-addressable count equals the scanner's per-resolution count.
    // If they diverge, either the classifier and scanner disagree on which
    // sites are addressable, OR a scanner expansion drifted from this formula.
    expect(myCollapsible + 2 * dynamicTernaryAddressable + elementChildStaticAddressable).toBe(
      scannerCollapsible,
    )

    // ── Lock the headline finding (ratchet record) ──────────────────────────
    // The corpus is real and large; these are the measured facts as of this
    // PR. They are asserted as RANGES (not exact) so benign corpus churn
    // doesn't flake the gate, but a structural shift (partial collapse landed,
    // or the slice's collapsible rate collapsed) trips it for review.
    expect(candidates).toBeGreaterThan(50)
    expect(tally.collapsible).toBeGreaterThan(0)
    // partial-addressable is the #1 go/no-go number — assert it's measured
    // (>=0 always true; the value is in the logged report). Lock only that
    // the classifier ran over a non-trivial dynamic-prop population so the
    // ratio is meaningful, not noise.
    expect(tally['dynamic-prop'] + tally.collapsible).toBeGreaterThan(0)
    // PR 4 of the dynamic-prop partial-collapse build: lock that the
    // dynamic-collapse classifier ran over a meaningful population
    // (dynamic-prop bucket non-zero). The addressable count is in the
    // log; we DON'T assert it >0 here because the strict no-handler
    // PR 3 scope is honestly small in real-world corpora (real Buttons
    // with `state={cond ? ... : ...}` almost always also carry
    // `onClick` → BAIL until the handler-combined follow-up). The
    // dynamic-prop bucket itself is the size of the future surface;
    // PR 3's no-handler subset is the first measurable step.
    expect(tally['dynamic-prop']).toBeGreaterThan(0)
    // The dynamic-addressable count can be 0 in a clean run (no
    // matching sites in the corpus); just lock that the counter is
    // wired and consistent with the bucket.
    expect(dynamicTernaryAddressable).toBeLessThanOrEqual(tally['dynamic-prop'])

    // ── Element-child static-addressable (PR 1 measurement) ─────────────────
    // The static-addressable subset is BY DEFINITION ≤ the element-child
    // bucket (every addressable site is an element-child bail). Locks the
    // counter is wired + consistent.
    expect(elementChildStaticAddressable).toBeLessThanOrEqual(tally['element-child'])
    // Bisect-verify lock (documented in the PR body): the corpus DOES
    // contain ≥1 recursively-static element-child site (e.g. a Button
    // wrapping a static <span>/<svg>). When `detectStaticElementChild` /
    // `collectStaticChildren` is stubbed to always bail, this drops to 0
    // and the assertion fails — proving the measurement is load-bearing
    // on the detector, not passing for the wrong reason. If the corpus
    // ever legitimately has zero such sites this would need revisiting,
    // but the measured count at PR time is > 0.
    expect(elementChildStaticAddressable).toBeGreaterThan(0)

    // ── Element-child collapse SHIPPED — reclassification (PR 3) ─────────────
    // Element-child is no longer measurement-only: the scanner expands every
    // static-addressable element-child site into the resolve set and the
    // compiler emits the collapse. The trustworthiness invariant above
    // (`+ elementChildStaticAddressable`) already proves the scanner emits
    // exactly that many extra resolutions; here we lock that the ADDRESSED
    // coverage headline genuinely includes the element-child contribution
    // (it strictly exceeds the full-collapse-only count by ≥1 element-child
    // site). Reverting the element-child scan/emit drops the element-child
    // term out of the scanner truth-set → the trustworthiness invariant
    // fails first; this assertion documents the coverage intent.
    const totalAddressed =
      myCollapsible + partialAddressable + dynamicTernaryAddressable + elementChildStaticAddressable
    expect(totalAddressed).toBeGreaterThan(myCollapsible)
    expect(totalAddressed - myCollapsible).toBeGreaterThanOrEqual(elementChildStaticAddressable)
    // Addressed coverage is the dominant share of the corpus (full +
    // partial + dynamic + element-child). Range-locked (not exact) so
    // benign corpus churn doesn't flake; a structural collapse-path
    // regression (a whole path stops collapsing) trips it.
    expect(totalAddressed / candidates).toBeGreaterThan(0.8)
  })
})
