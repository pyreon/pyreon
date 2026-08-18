#!/usr/bin/env bun
/**
 * Decomposition + strategy probe for the `$`-marker normalization — the single
 * largest item in Pyreon's hydration WALK (`bench-hydration.ts`).
 *
 * WHY THIS EXISTS. On the 1,000-row hydration page Pyreon's walk is ~1.47ms
 * against Vue's ~1.27ms, and ~0.29ms of Pyreon's is marker normalization —
 * larger than the whole gap. That makes it the obvious thing to attack, and it
 * has now been attacked twice. This probe is the evidence, kept next to the
 * bench so the next attempt starts from measurements instead of intuition.
 *
 * WHAT IT NORMALIZES. A compiled row template bakes a text placeholder
 * (`<a> </a>`) while the SSR row emits `<a><!--$-->text<!--/$--></a>`. The
 * compiled bind's ref is `__e1.firstChild`, so the OPEN marker must go before
 * `bind` runs. `hydration-plan.ts:replayAdoptPlan` does that per row: walk to
 * the slot's parent, verify the `$`/text/`/$` triplet, `remove()` the open one.
 *
 * MEASURED (M3 Max, Playwright Chromium, crossOriginIsolated → 5.0µs clock,
 * 1,000 rows, n=60, arms interleaved, fresh DOM per sample):
 *
 *   full          290ns/row   — what ships
 *     ├─ walk      85ns       — elByPath, 3 element hops + firstChild
 *     ├─ verify   150ns       — nodeType/`.data` checks over the triplet
 *     └─ remove    55ns       — the `.remove()` itself
 *   bindOnly      115ns/row   — the compiled bind's OWN walk (paid regardless)
 *
 * The headline result is that the REMOVAL is not the cost (19%); the WALK and
 * VERIFY are (81%). Two consequences:
 *
 *  1. Strategies that only make the mutation cheaper cannot help.
 *  2. `elByPath` re-walks to the same element the compiled bind then walks to
 *     itself, so ~85ns/row is duplicated work — but it can only be shared by
 *     changing what the COMPILER emits, not by changing the runtime.
 *
 * REFUTED ALTERNATIVES (all measured here, all LOSE — do not re-try blind):
 *   twComments   +16%  one TreeWalker(SHOW_COMMENT) over the range. It visits
 *                      3,000 comments to find 1,000; the C++ filter does not
 *                      pay for the extra crossings.
 *   qsaWalk       +3%  one `querySelectorAll` for every slot parent. The batch
 *                      walk itself IS cheap (`qsaOnly` 60ns/row vs `walkOnly`
 *                      85ns/row) but static-NodeList indexing gives it all back.
 *   hopList       -2%  flattened FIRST/NEXT op list instead of the nested loop.
 *                      Loop shape is not the cost; DOM crossings are (~25ns each).
 *   verifyCount   -7%  `childNodes.length` instead of sibling hops.
 *   verifyNoData -20%  dropping the two `.data` compares. The only sizeable
 *                      runtime-only win, and it is REJECTED: it trades a
 *                      documented structural guard (see `matchDomAgainstTemplate`)
 *                      for 0.057ms, which does not win the op anyway.
 *
 * Usage: bun probe-marker-cost.ts [--samples 60]
 * Requires a current build (`bun run build`) — it drives the bench's own
 * `vite preview`, whose COOP/COEP headers are what give the 5µs clock.
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4186
const SAMPLES = Number(process.argv[process.argv.indexOf('--samples') + 1]) || 60

const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 1500))

const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] })
try {
  const page = await browser.newPage()
  await page.goto(`http://localhost:${PORT}/`)

  const env = await page.evaluate(() => {
    let min = Infinity
    for (let i = 0; i < 200_000; i++) {
      const a = performance.now()
      const b = performance.now()
      if (b > a && b - a < min) min = b - a
    }
    return {
      isolated: (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated,
      quantumUs: min * 1000,
    }
  })
  console.log(
    `[probe] crossOriginIsolated=${env.isolated}  clock quantum ≈ ${env.quantumUs.toFixed(1)}µs`,
  )
  if (!env.isolated) throw new Error('page is NOT cross-origin isolated — numbers unusable')

  const fixture = await (await fetch(`http://localhost:${PORT}/hydration-fixtures.json`)).json()
  const fixtureHtml: string = (fixture.html as Record<string, string>).pyreon as string

  const out = await page.evaluate(
    ({ html: pageHtml, samples }: { html: string; samples: number }) => {
      const host = document.createElement('div')
      document.body.appendChild(host)

      /** Rebuild the SSR DOM, attached + laid out — the real hydration condition. */
      const fresh = (): Element => {
        host.innerHTML = pageHtml
        const tbody = host.querySelector('tbody') as Element
        void (host as HTMLElement).offsetHeight
        return tbody
      }
      const rowsOf = (tbody: Element): Element[] => {
        const rs: Element[] = []
        for (let c = tbody.firstElementChild; c; c = c.nextElementSibling) rs.push(c)
        return rs
      }

      // The bench row: <tr><td>id</td><td><a><!--$-->label<!--/$--></a></td></tr>
      const PATH = [1, 0] // <tr> → td[1] → a[0]
      const HOPS = new Int8Array([0, 1, 0]) // 0 = firstElementChild, 1 = nextElementSibling
      const SEL = ':scope > tr > td:nth-child(2) > a'

      /** Verbatim from hydration-plan.ts. */
      function elByPath(root: Element, path: number[], upto: number): Element | null {
        let el: Element | null = root
        for (let i = 0; i < upto && el; i++) {
          let c: Element | null = el.firstElementChild
          for (let k = 0; k < (path[i] as number) && c; k++) c = c.nextElementSibling
          el = c
        }
        return el
      }
      function elByHops(root: Element, hops: Int8Array): Element | null {
        let el: Element | null = root
        for (let i = 0; i < hops.length && el; i++) {
          el = hops[i] === 0 ? el.firstElementChild : el.nextElementSibling
        }
        return el
      }
      /** The shipped triplet verify + strip, given the slot's parent. */
      function verifyStrip(parent: Element): boolean {
        const n = parent.firstChild
        if (!n || n.nodeType !== 8 || (n as Comment).data !== '$') return false
        const a = n.nextSibling
        if (!a || a.nodeType !== 3) return false
        const b = a.nextSibling
        if (!b || b.nodeType !== 8 || (b as Comment).data !== '/$') return false
        ;(n as Comment).remove()
        return true
      }

      const arms: Record<string, number[]> = {
        full: [],
        walk: [],
        removeOnly: [],
        bindOnly: [],
        hopList: [],
        verifyNoData: [],
        verifyCount: [],
        twComments: [],
        qsaWalk: [],
        qsaOnly: [],
        walkOnly: [],
      }
      let sink = 0

      for (let s = 0; s < samples; s++) {
        // ── full: what ships ──
        {
          const rows = rowsOf(fresh())
          const t0 = performance.now()
          for (let i = 0; i < rows.length; i++) {
            const p = elByPath(rows[i] as Element, PATH, 2)
            if (p && verifyStrip(p)) sink++
          }
          arms.full!.push(performance.now() - t0)
        }
        // ── walk: verify, NO mutation ──
        {
          const rows = rowsOf(fresh())
          const t0 = performance.now()
          for (let i = 0; i < rows.length; i++) {
            const p = elByPath(rows[i] as Element, PATH, 2) as Element
            const n = p.firstChild
            if (!n || n.nodeType !== 8 || (n as Comment).data !== '$') continue
            const a = n.nextSibling
            if (!a || a.nodeType !== 3) continue
            const b = a.nextSibling
            if (!b || b.nodeType !== 8 || (b as Comment).data !== '/$') continue
            sink++
          }
          arms.walk!.push(performance.now() - t0)
        }
        // ── removeOnly: markers pre-resolved OUTSIDE the timed region ──
        {
          const rows = rowsOf(fresh())
          const marks: Comment[] = []
          for (let i = 0; i < rows.length; i++) {
            marks.push((elByPath(rows[i] as Element, PATH, 2) as Element).firstChild as Comment)
          }
          const t0 = performance.now()
          for (let i = 0; i < marks.length; i++) (marks[i] as Comment).remove()
          arms.removeOnly!.push(performance.now() - t0)
        }
        // ── bindOnly: the compiled bind's own walk (paid regardless) ──
        {
          const rows = rowsOf(fresh())
          const t0 = performance.now()
          for (let i = 0; i < rows.length; i++) {
            const root = rows[i] as Element
            const e0 = root.firstElementChild as Element
            const e1 = e0.nextElementSibling!.firstElementChild as Element
            if (e1.firstChild) sink++
          }
          arms.bindOnly!.push(performance.now() - t0)
        }
        // ── hopList: flattened op list ──
        {
          const rows = rowsOf(fresh())
          const t0 = performance.now()
          for (let i = 0; i < rows.length; i++) {
            const p = elByHops(rows[i] as Element, HOPS)
            if (p && verifyStrip(p)) sink++
          }
          arms.hopList!.push(performance.now() - t0)
        }
        // ── verifyNoData: drop the `.data` compares (REJECTED, see header) ──
        {
          const rows = rowsOf(fresh())
          const t0 = performance.now()
          for (let i = 0; i < rows.length; i++) {
            const p = elByPath(rows[i] as Element, PATH, 2) as Element
            const n = p.firstChild
            if (!n || n.nodeType !== 8) continue
            const a = n.nextSibling
            if (!a || a.nodeType !== 3) continue
            const b = a.nextSibling
            if (!b || b.nodeType !== 8) continue
            ;(n as Comment).remove()
            sink++
          }
          arms.verifyNoData!.push(performance.now() - t0)
        }
        // ── verifyCount: childNodes.length instead of sibling hops ──
        {
          const rows = rowsOf(fresh())
          const t0 = performance.now()
          for (let i = 0; i < rows.length; i++) {
            const p = elByPath(rows[i] as Element, PATH, 2) as Element
            if (p.childNodes.length !== 3) continue
            const n = p.firstChild as ChildNode
            if (n.nodeType !== 8) continue
            if ((n.nextSibling as ChildNode).nodeType !== 3) continue
            ;(n as Comment).remove()
            sink++
          }
          arms.verifyCount!.push(performance.now() - t0)
        }
        // ── twComments: one TreeWalker(SHOW_COMMENT) over the whole range ──
        {
          const tbody = fresh()
          const t0 = performance.now()
          const tw = document.createTreeWalker(tbody, NodeFilter.SHOW_COMMENT)
          const kill: Comment[] = []
          let c = tw.nextNode() as Comment | null
          while (c) {
            if (c.data === '$') kill.push(c)
            c = tw.nextNode() as Comment | null
          }
          for (let i = 0; i < kill.length; i++) (kill[i] as Comment).remove()
          sink += kill.length
          arms.twComments!.push(performance.now() - t0)
        }
        // ── qsaWalk: one C++ batch walk, then verify+remove ──
        {
          const tbody = fresh()
          const t0 = performance.now()
          const ps = tbody.querySelectorAll(SEL)
          for (let i = 0; i < ps.length; i++) if (verifyStrip(ps[i] as Element)) sink++
          arms.qsaWalk!.push(performance.now() - t0)
        }
        // ── qsaOnly / walkOnly: the two walk strategies alone ──
        {
          const tbody = fresh()
          const t0 = performance.now()
          sink += tbody.querySelectorAll(SEL).length
          arms.qsaOnly!.push(performance.now() - t0)
        }
        {
          const rows = rowsOf(fresh())
          const t0 = performance.now()
          for (let i = 0; i < rows.length; i++) {
            if (elByPath(rows[i] as Element, PATH, 2)) sink++
          }
          arms.walkOnly!.push(performance.now() - t0)
        }
      }
      host.remove()
      return { arms, sink }
    },
    { html: fixtureHtml, samples: SAMPLES },
  )

  const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length % 2
      ? (s[s.length >> 1] as number)
      : ((s[s.length / 2 - 1] as number) + (s[s.length / 2] as number)) / 2
  }
  const ci95 = (xs: number[]): [number, number] => {
    let seed = 42
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff)
    const meds: number[] = []
    for (let b = 0; b < 1000; b++) {
      const re: number[] = []
      for (let i = 0; i < xs.length; i++) re.push(xs[Math.floor(rnd() * xs.length)] as number)
      meds.push(median(re))
    }
    meds.sort((a, b) => a - b)
    return [
      meds[Math.floor(0.025 * meds.length)] as number,
      meds[Math.floor(0.975 * meds.length)] as number,
    ]
  }

  console.log(`\n  $-marker normalization — 1,000 rows, n=${SAMPLES}`)
  console.log('  ' + '─'.repeat(66))
  const base = median(out.arms.full as number[])
  for (const [name, xs] of Object.entries(out.arms)) {
    const m = median(xs as number[])
    const c = ci95(xs as number[])
    const delta = name === 'full' ? '' : `${m <= base ? '-' : '+'}${((Math.abs(m - base) / base) * 100).toFixed(0)}%`
    console.log(
      `  ${name.padEnd(13)} ${(m * 1000).toFixed(0).padStart(5)}µs  [${(c[0] * 1000).toFixed(0)}–${(c[1] * 1000).toFixed(0)}µs]  ` +
        `${((m / 1000) * 1e6).toFixed(0).padStart(4)}ns/row  ${delta}`,
    )
  }
  const walk = median(out.arms.walk as number[])
  const rem = median(out.arms.removeOnly as number[])
  const walkOnly = median(out.arms.walkOnly as number[])
  console.log(
    `\n  → split: walk ${((walkOnly / 1000) * 1e6).toFixed(0)}ns + verify ` +
      `${(((walk - walkOnly) / 1000) * 1e6).toFixed(0)}ns + remove ${((rem / 1000) * 1e6).toFixed(0)}ns per row`,
  )
  console.log('  → the removal is the SMALL half; the walk + verify are the cost.')
} finally {
  await browser.close()
  preview.kill('SIGTERM')
}
