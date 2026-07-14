/**
 * Compile-to-string SSR fast path (`_ssr`) — self-win + cross-framework, on
 * ELIGIBLE shapes only.
 *
 * The cross-framework h()-path bench is `ssr-crossframework.ts` (PR #2276). Its
 * row carries per-row DYNAMIC attributes (`data-id`, `href`) which the fast
 * path's CONSERVATIVE eligibility BAILS on (the compiler can't prove a dynamic
 * attr renders byte-identically to `renderProp` yet), so the fast path gives no
 * win on that exact shape. THIS bench measures the shapes the compiler ACTUALLY
 * fast-paths: static attributes + dynamic TEXT + a `.map` of eligible items.
 *
 *   - pyreon _ssr — the compile-to-string fast path (this PR)
 *   - pyreon h()  — the current VNode-walk SSR path (the baseline it beats)
 *   - react 19    — react-dom/server (context; a faithful no-build renderer)
 *
 * The `_ssr` fixtures are hand-written to the EXACT bytes the compiler emits for
 * the eligible JSX (verified byte-identical to h() in `runtime-server`'s
 * ssr-template test + the runtime-dom differential/fuzz). A byte-identical
 * correctness gate runs before any timing, so a mis-modeled entry can't fake a
 * win. NODE_ENV=production via a self-re-exec guard (ESM hoists imports above a
 * top-level assignment → would load React's dev build; see ssr-crossframework).
 *
 * Author-judge, single-machine, CPU-only string generation — the RATIO
 * (_ssr vs h()) is the portable signal.
 *
 * Usage: bun scripts/bench/core/ssr-template-fastpath.ts
 */

// ─── NODE_ENV self-re-exec guard (MUST precede every value import) ────────────
if (process.env.NODE_ENV !== 'production') {
  const child = Bun.spawnSync(['bun', import.meta.path, ...process.argv.slice(2)], {
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['inherit', 'inherit', 'inherit'],
  })
  process.exit(child.exitCode ?? 0)
}

// ─── Dynamic imports (prod-env child only) ────────────────────────────────────
const { h } = await import('../../../packages/core/core/src/index')
const { _ssr, _ssrChildren, renderToString } = await import(
  '../../../packages/core/runtime-server/src/index'
)
const { createElement: R } = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')

// ─── Data ─────────────────────────────────────────────────────────────────────
interface Row {
  id: number
  label: string
}
const makeRows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: i, label: `Item number ${i} & "friends"` }))
const CARD = { title: 'Fine-grained SSR', body: 'Rendered to an HTML string on the server & fast.' }

// ─── Builders (byte-identical HTML; static attrs + dynamic text only) ─────────
// card: <article class="card"><h2 class="t">{title}</h2><p class="b">{body}</p></article>
const pyCard = (c: { title: string; body: string }) =>
  h(
    'article',
    { class: 'card' },
    h('h2', { class: 't' }, c.title),
    h('p', { class: 'b' }, c.body),
  )
const ssrCard = (c: { title: string; body: string }) =>
  _ssr(['<article class="card"><h2 class="t">', '</h2><p class="b">', '</p></article>'], c.title, c.body)
const reCard = (c: { title: string; body: string }) =>
  R('article', { className: 'card' }, R('h2', { className: 't' }, c.title), R('p', { className: 'b' }, c.body))

// list: <ul class="list">{rows.map(r => <li class="row"><span class="label">{label}</span></li>)}</ul>
// (the h() + _ssr forms wrap the .map in an accessor → <!--$--> markers, matching
//  the compiler; React has no such markers, so it is compared per-item, not on
//  the exact bytes — its entry is excluded from the byte gate for `list`.)
const pyList = (rows: Row[]) => () =>
  h('ul', { class: 'list' }, () =>
    rows.map((r) => h('li', { class: 'row' }, h('span', { class: 'label' }, r.label))),
  )
const ssrList = (rows: Row[]) => () =>
  _ssr(
    ['<ul class="list"><!--$-->', '<!--/$--></ul>'],
    _ssrChildren(rows.map((r) => _ssr(['<li class="row"><span class="label">', '</span></li>'], r.label))),
  )
const reList = (rows: Row[]) => () =>
  R(
    'ul',
    { className: 'list' },
    rows.map((r) => R('li', { className: 'row', key: r.id }, R('span', { className: 'label' }, r.label))),
  )

// ─── Timing ────────────────────────────────────────────────────────────────────
async function pyRender(mk: () => unknown): Promise<string> {
  return renderToString(mk() as never)
}
async function throughput(fn: () => unknown | Promise<unknown>, ms = 900): Promise<number> {
  for (let i = 0; i < 50; i++) await fn()
  const runs: number[] = []
  for (let pass = 0; pass < 7; pass++) {
    let n = 0
    const t0 = performance.now()
    while (performance.now() - t0 < ms) {
      await fn()
      n++
    }
    runs.push(n / ((performance.now() - t0) / 1000))
  }
  runs.sort((a, b) => a - b)
  return runs[3]!
}

interface Entry {
  label: string
  run: () => unknown | Promise<unknown>
  html: () => Promise<string>
  inByteGate: boolean
}

async function scenario(name: string, entries: Entry[]): Promise<void> {
  // Byte-identical correctness gate (entries flagged inByteGate).
  const gated = entries.filter((e) => e.inByteGate)
  const ref = await gated[0]!.html()
  for (const e of gated) {
    const out = await e.html()
    if (out !== ref) {
      throw new Error(`[${name}] ${e.label} not byte-identical:\n  ref =${JSON.stringify(ref).slice(0, 120)}\n  got =${JSON.stringify(out).slice(0, 120)}`)
    }
  }
  const results: [string, number][] = []
  for (const e of entries) results.push([e.label, await throughput(e.run)])
  const base = results.find(([l]) => l === 'pyreon h()')?.[1] ?? 1
  console.log(`\n── ${name} ──`)
  results
    .sort((a, b) => b[1] - a[1])
    .forEach(([label, rps]) => {
      console.log(
        `  ${label.padEnd(13)} ${(rps / 1000).toFixed(1).padStart(9)}K renders/s   ${(rps / base).toFixed(2)}× vs pyreon h()`,
      )
    })
}

async function main(): Promise<void> {
  console.log('SSR fast-path throughput — ELIGIBLE shapes (static attrs + dynamic text)')
  console.log('(NODE_ENV=production, median of 7 windows; `_ssr` bytes verified === h())')

  await scenario('card', [
    { label: 'pyreon _ssr', run: () => pyRender(() => ssrCard(CARD)), html: () => pyRender(() => ssrCard(CARD)), inByteGate: true },
    { label: 'pyreon h()', run: () => pyRender(() => pyCard(CARD)), html: () => pyRender(() => pyCard(CARD)), inByteGate: true },
    { label: 'react', run: () => renderToStaticMarkup(reCard(CARD)), html: async () => renderToStaticMarkup(reCard(CARD)), inByteGate: true },
  ])

  for (const [n, count] of [['list-50', 50], ['list-1000', 1000]] as const) {
    const rows = makeRows(count)
    const pFast = ssrList(rows)
    const pSlow = pyList(rows)
    const rl = reList(rows)
    await scenario(n, [
      { label: 'pyreon _ssr', run: () => pyRender(pFast), html: () => pyRender(pFast), inByteGate: true },
      { label: 'pyreon h()', run: () => pyRender(pSlow), html: () => pyRender(pSlow), inByteGate: true },
      // React omitted from the byte gate for lists (no <!--$--> hydration markers).
      { label: 'react', run: () => renderToStaticMarkup(rl()), html: async () => renderToStaticMarkup(rl()), inByteGate: false },
    ])
  }
}

void main()
