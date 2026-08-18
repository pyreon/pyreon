#!/usr/bin/env bun
/**
 * SSR NODE-RETENTION probe — what fraction of a page's server-rendered DOM
 * survives hydration with its identity intact?
 *
 * WHY THIS EXISTS. Identity is the entire product of hydration (#2918): a node
 * that is replaced rather than adopted loses typed input, focus, scroll
 * position, and any listener attached by non-Pyreon code, and the client
 * re-does DOM construction the server already paid for. Retention is therefore
 * a CORRECTNESS metric first and a performance one second — but nothing
 * measured it on a real, fully-built page. `bench-apppage.ts` reports adoption
 * for its own synthetic fixture; this probe answers the same question for any
 * URL, including a production build of a real site.
 *
 * HOW IT WORKS, and why the timing is the whole trick. A synchronous `<script>`
 * is injected immediately before `</body>` in the document response, so it runs
 * DURING parse — after every server-rendered node exists, and before any
 * deferred `<script type="module">` boots the framework. It stamps a `__ssrId`
 * expando on every element. After boot, elements still carrying the expando are
 * the ones hydration ADOPTED; everything else was rebuilt.
 *
 * A `DOMContentLoaded` listener is NOT good enough and will silently under-
 * report: module scripts are deferred, which means they execute AFTER parsing
 * but BEFORE `DOMContentLoaded` fires. A stamp registered on that event runs
 * after the framework has already re-mounted, so it measures the post-boot DOM
 * and reports a meaningless ~100%. (Observed while writing this probe: the
 * first version read 628/628 = 100% on a page whose real retention is 0.5%.)
 *
 * READING THE OUTPUT. Retention is reported over the SSR node set, and the
 * survivors are grouped by their ancestor chain, because WHICH nodes survive is
 * the diagnostic. `<head>`-only survival is the signature of a route subtree
 * that is re-mounted rather than hydrated in place.
 *
 * MEASURED 2026-08 (production builds, serve-ssg, Playwright Chromium):
 *
 *   examples/islands-showcase  /             9/9      100.0%   (control)
 *   docs (@pyreon/zero SSG)    /docs/router  63/11567   0.5%   head only
 *
 * The control matters: a probe that reports 0% everywhere is indistinguishable
 * from a broken probe. Run one page you expect to retain before trusting a
 * page that does not.
 *
 * USAGE
 *   bun scripts/serve-ssg.ts <dist-dir> 4197        # or any static server
 *   bun probe-ssr-retention.ts http://localhost:4197/some/route
 *   bun probe-ssr-retention.ts <url> --survivors 40 # list survivor chains
 */
import { chromium } from 'playwright'

const argv = process.argv.slice(2)
const url = argv.find((a) => !a.startsWith('--'))
if (!url) {
  console.error('usage: probe-ssr-retention.ts <url> [--survivors N] [--wait MS]')
  process.exit(1)
}
const pick = (flag: string, dflt: number): number => {
  const i = argv.indexOf(flag)
  return i >= 0 ? (Number(argv[i + 1]) || dflt) : dflt
}
const SURVIVORS = pick('--survivors', 12)
const WAIT = pick('--wait', 3000)

const browser = await chromium.launch()
const page = await browser.newPage()

// Inject the stamp at end-of-body so it runs during parse, before the bundle.
await page.route('**/*', async (route) => {
  if (route.request().resourceType() !== 'document') return route.continue()
  const resp = await route.fetch()
  const body = await resp.text()
  const stamp =
    `<script>(function(){var a=document.querySelectorAll('*');` +
    `window.__ssrCount=a.length;for(var i=0;i<a.length;i++){a[i].__ssrId=i+1;}})();</script>`
  const at = body.lastIndexOf('</body>')
  return route.fulfill({
    response: resp,
    body: at >= 0 ? body.slice(0, at) + stamp + body.slice(at) : body + stamp,
  })
})

const pageErrors: string[] = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(WAIT)

const r = await page.evaluate((limit: number) => {
  const all = document.querySelectorAll('*')
  const chains: string[] = []
  let survived = 0
  for (const el of all) {
    if (!(el as unknown as Record<string, unknown>).__ssrId) continue
    survived++
    if (chains.length >= limit) continue
    const parts: string[] = []
    let c: Element | null = el
    while (c && parts.length < 4) {
      const cls = typeof c.className === 'string' && c.className ? `.${c.className.split(/\s+/)[0]}` : ''
      parts.unshift(c.tagName.toLowerCase() + cls)
      c = c.parentElement
    }
    chains.push(parts.join('>'))
  }
  const inHead = (() => {
    let n = 0
    for (const el of document.head.querySelectorAll('*')) {
      if ((el as unknown as Record<string, unknown>).__ssrId) n++
    }
    return n
  })()
  return {
    ssr: ((globalThis as unknown as Record<string, unknown>).__ssrCount as number) ?? 0,
    now: all.length,
    survived,
    inHead,
    chains,
  }
}, SURVIVORS)

const pct = (r.survived / Math.max(1, r.ssr)) * 100
const bodySurvivors = r.survived - r.inHead
const bodySsr = r.ssr - r.inHead

console.log(`\n══ SSR retention — ${url}`)
if (pageErrors.length) console.log(`   PAGE ERRORS: ${pageErrors.slice(0, 3).join(' | ')}`)
console.log(`   SSR nodes at parse end : ${r.ssr}`)
console.log(`   live nodes after boot  : ${r.now}`)
console.log(`   SURVIVED identity      : ${r.survived} (${pct.toFixed(1)}%)`)
console.log(
  `     of which in <head>   : ${r.inHead}` +
    `   — <body> retention ${bodySurvivors}/${bodySsr}` +
    ` (${((bodySurvivors / Math.max(1, bodySsr)) * 100).toFixed(1)}%)`,
)
if (bodySsr > 0 && bodySurvivors === 0) {
  console.log(`   ⚠ ZERO <body> retention — the route subtree is re-mounted, not hydrated in place.`)
}
if (r.chains.length) {
  console.log(`   survivor chains (first ${r.chains.length}):`)
  for (const c of r.chains) console.log(`     ${c}`)
}

await browser.close()
process.exit(0)
