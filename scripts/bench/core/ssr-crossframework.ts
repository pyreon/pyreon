/**
 * Cross-framework SSR benchmark — `@pyreon/runtime-server`'s `renderToString`
 * vs the three dominant runtime SSR renderers, on the SAME logical tree.
 *
 * Compares (all resolved to their REAL production server build):
 *   - @pyreon/runtime-server  — Pyreon's `renderToString` (async maybe-sync renderer)
 *   - react-dom/server        — React 19's `renderToString`
 *   - preact-render-to-string — Preact 10's `render`
 *   - solid-js/web            — SolidJS `renderToString` (compiled via babel-preset-solid)
 *
 * Scenarios (mirror the DOM suite's row-list shape):
 *   - card         — one small component (per-render framework overhead baseline)
 *   - list-50      — a 50-row list  (text + a couple attributes per row)
 *   - list-1000    — a 1,000-row list (bulk string generation)
 *
 * ─── OBJECTIVITY CONTRACT (author-judge disclosed) ───────────────────────────
 * The framework author WROTE and JUDGES this bench. It is a Node/Bun (JSC)
 * micro-bench of the SSR STRING-GENERATION path only. Treat it accordingly.
 *
 * 1. NODE_ENV=production is enforced via a SELF-RE-EXEC GUARD, not the usual
 *    top-of-file `process.env.NODE_ENV = 'production'`. ESM hoists static
 *    imports ABOVE top-level statements, so that assignment runs AFTER
 *    react-dom's module-init dev-gate — silently loading its ~5-10× slower DEV
 *    build (proven: `class`-prop validation warnings fire without external
 *    env). We re-exec with the env set and DYNAMIC-import every framework in
 *    the child, so the timed process always measures PRODUCTION builds.
 *
 * 2. REAL server builds, verified — no inert stub. `solid-js` bare-imported
 *    resolves to a client hyperscript that throws `document is not defined`
 *    server-side; Solid SSR requires the COMPILER to emit `ssr()` template
 *    calls. We compile the Solid components with `babel-preset-solid`
 *    ({ generate: 'ssr' }) at startup — the exact output a Solid app ships,
 *    NOT hand-tuned. `solid-js/web`'s `node` export condition points at the
 *    real `dist/server.js`.
 *
 * 3. CORRECTNESS GATE before any timing: all four renderers must produce
 *    BYTE-IDENTICAL HTML for every scenario (the tree is designed with only
 *    non-boolean attributes so serialization can't diverge). A renderer that
 *    "wins" by emitting empty/wrong output is caught and aborts the run.
 *
 * 4. The vnode/template tree is rebuilt FRESH PER RENDER (the real per-request
 *    SSR shape — JSX runs per request), and each framework is called in its
 *    NATIVE convention: Pyreon's `renderToString` is `async` so it is AWAITED
 *    (its genuine per-request cost, one microtask/render); React/Preact/Solid
 *    are synchronous so they are NOT awaited (awaiting sync output would tax
 *    them with a microtask they never pay in a real sync SSR handler).
 *
 * 5. MEDIAN + 95% bootstrap CI + a `🤝` tie marker (CI-overlap with the row
 *    leader). No forced GC inside the timed loop (it jettisons compiled code →
 *    fake re-tier costs); per-window fresh trees, adaptive window sizing.
 *
 * HONEST LIMITS: this is CPU-only string generation on one tree shape. It does
 * NOT measure streaming, Suspense/async-component promotion, hydration-marker
 * cost differences, real-app async data, or client-side reconciliation. React's
 * default production server path is streaming (`renderToPipeableStream`);
 * `renderToString` is its synchronous fallback and the closest analog to the
 * other three. Numbers are machine- and JSC-version-dependent; the RATIO is the
 * portable signal, and a `🤝` means "inside the noise, not a real win".
 *
 * Usage: bun run bench:ssr-cross   (or: bun scripts/bench/core/ssr-crossframework.ts)
 */

// ─── NODE_ENV self-re-exec guard (MUST precede every value import) ────────────
// Value imports below are DYNAMIC so they evaluate ONLY in the prod-env child.
if (process.env.NODE_ENV !== 'production') {
  const child = Bun.spawnSync(['bun', import.meta.path, ...process.argv.slice(2)], {
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['inherit', 'inherit', 'inherit'],
  })
  process.exit(child.exitCode ?? 0)
}

// ─── Dynamic imports (prod-env child only) ────────────────────────────────────
const { h } = await import('../../../packages/core/core/src/index')
const pyreonRuntime = await import('../../../packages/core/runtime-server/src/index')
const { renderToString: pyreonRenderToString } = pyreonRuntime
const { transformJSX_JS } = await import('../../../packages/core/compiler/src/index')
const { createElement: reactCreateElement } = await import('react')
const { renderToString: reactRenderToString } = await import('react-dom/server')
const { h: preactCreateElement } = await import('preact')
const { render: preactRender } = await import('preact-render-to-string')
const { transformSync } = await import('@babel/core')
const solidPresetMod: any = await import('babel-preset-solid')
const solidPreset = solidPresetMod.default ?? solidPresetMod
const { renderToString: solidRenderToString } = await import('solid-js/web')
const { writeFileSync, unlinkSync } = await import('node:fs')

// ─── Data (module-level; trees rebuilt fresh per render) ──────────────────────

interface Row {
  id: number
  label: string
  tag: string
  prefix: string
}
interface Card {
  title: string
  body: string
  href: string
}

const TAGS = ['new', 'hot', 'sale', 'trend', 'pick']
function makeRows(n: number): Row[] {
  const rows: Row[] = new Array(n)
  for (let i = 0; i < n; i++) {
    rows[i] = { id: i, label: `Item number ${i}`, tag: TAGS[i % TAGS.length]!, prefix: '/item/' }
  }
  return rows
}
const CARD: Card = {
  title: 'Fine-grained SSR',
  body: 'A small component rendered to an HTML string on the server.',
  href: '/read/fine-grained-ssr',
}

// ─── Framework tree builders (idiomatic per lib, identical HTML output) ────────
// Pyreon / Preact / Solid use `class`; React uses `className` (→ `class` attr).
// Only non-boolean attributes so all four serialize byte-identically.

// Pyreon (@pyreon/core `h`)
function pyCard(c: Card) {
  return h(
    'section',
    { class: 'card', 'data-variant': 'primary' },
    h('header', { class: 'hd' }, h('h2', null, c.title)),
    h('p', { class: 'body' }, c.body),
    h('a', { class: 'cta', href: c.href }, 'Read more'),
  )
}
function pyRow(r: Row) {
  return h(
    'div',
    { class: 'row', 'data-id': r.id },
    h('span', { class: 'id' }, String(r.id)),
    h('a', { class: 'label', href: `/item/${r.id}` }, r.label),
    h('span', { class: 'tag' }, r.tag),
  )
}
function pyList(rows: Row[]) {
  return h('div', { class: 'list' }, ...rows.map(pyRow))
}

// React (react-dom/server)
function reCard(c: Card) {
  return reactCreateElement(
    'section',
    { className: 'card', 'data-variant': 'primary' },
    reactCreateElement('header', { className: 'hd' }, reactCreateElement('h2', null, c.title)),
    reactCreateElement('p', { className: 'body' }, c.body),
    reactCreateElement('a', { className: 'cta', href: c.href }, 'Read more'),
  )
}
function reRow(r: Row) {
  return reactCreateElement(
    'div',
    { className: 'row', 'data-id': r.id, key: r.id },
    reactCreateElement('span', { className: 'id' }, String(r.id)),
    reactCreateElement('a', { className: 'label', href: `/item/${r.id}` }, r.label),
    reactCreateElement('span', { className: 'tag' }, r.tag),
  )
}
function reList(rows: Row[]) {
  return reactCreateElement('div', { className: 'list' }, rows.map(reRow))
}

// Preact (preact-render-to-string)
function prCard(c: Card) {
  return preactCreateElement(
    'section',
    { class: 'card', 'data-variant': 'primary' },
    preactCreateElement('header', { class: 'hd' }, preactCreateElement('h2', null, c.title)),
    preactCreateElement('p', { class: 'body' }, c.body),
    preactCreateElement('a', { class: 'cta', href: c.href }, 'Read more'),
  )
}
function prRow(r: Row) {
  return preactCreateElement(
    'div',
    { class: 'row', 'data-id': r.id, key: r.id },
    preactCreateElement('span', { class: 'id' }, String(r.id)),
    preactCreateElement('a', { class: 'label', href: `/item/${r.id}` }, r.label),
    preactCreateElement('span', { class: 'tag' }, r.tag),
  )
}
function prList(rows: Row[]) {
  return preactCreateElement('div', { class: 'list' }, rows.map(prRow))
}

// Solid (compiled from JSX source via babel-preset-solid — the shipped shape)
const SOLID_SRC = `
export function Card(props) {
  return (
    <section class="card" data-variant="primary">
      <header class="hd"><h2>{props.card.title}</h2></header>
      <p class="body">{props.card.body}</p>
      <a class="cta" href={props.card.href}>Read more</a>
    </section>
  )
}
export function List(props) {
  return (
    <div class="list">
      {props.rows.map((r) => (
        <div class="row" data-id={r.id}>
          <span class="id">{String(r.id)}</span>
          <a class="label" href={"/item/" + r.id}>{r.label}</a>
          <span class="tag">{r.tag}</span>
        </div>
      ))}
    </div>
  )
}
`
async function compileSolid(): Promise<{ Card: any; List: any }> {
  const out = transformSync(SOLID_SRC, {
    presets: [[solidPreset, { generate: 'ssr', hydratable: false }]],
    filename: 'solid-ssr-components.jsx',
  })
  if (!out?.code) throw new Error('[ssr-bench] babel-preset-solid produced no output')
  // Write next to this file so `solid-js/web` resolves via the repo node_modules
  // (a bare os-tmpdir path has no node_modules ancestor). Cleaned up after load.
  const tmp = new URL(`./.solid-ssr-${process.pid}.jsx`, import.meta.url).pathname
  writeFileSync(tmp, out.code, 'utf8')
  try {
    const mod: any = await import(`${tmp}?t=${Date.now()}`)
    return { Card: mod.Card, List: mod.List }
  } finally {
    try {
      unlinkSync(tmp)
    } catch {
      /* best-effort */
    }
  }
}

// ─── Stats harness (median + bootstrap CI95 + tie marker) ─────────────────────

interface Sample {
  lib: string
  median: number // renders/sec
  lo: number // CI95 low
  hi: number // CI95 high
}

function pct(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

function bootstrapCI(samples: number[], B = 1000): { median: number; lo: number; hi: number } {
  const sorted = samples.slice().sort((a, b) => a - b)
  const median = pct(sorted, 0.5)
  const n = samples.length
  const medians: number[] = new Array(B)
  for (let b = 0; b < B; b++) {
    const resample: number[] = new Array(n)
    for (let i = 0; i < n; i++) resample[i] = samples[(Math.random() * n) | 0]!
    resample.sort((a, b2) => a - b2)
    medians[b] = pct(resample, 0.5)
  }
  medians.sort((a, b) => a - b)
  return { median, lo: pct(medians, 0.025), hi: pct(medians, 0.975) }
}

/** Calibrate ops-per-window so each window runs ~targetMs (machine-portable). */
async function calibrate(
  render: () => string | Promise<string>,
  isAsync: boolean,
  targetMs = 20,
): Promise<number> {
  for (let i = 0; i < 5; i++) {
    if (isAsync) await render()
    else render()
  }
  const t0 = performance.now()
  let n = 0
  while (performance.now() - t0 < 25 && n < 200_000) {
    if (isAsync) await render()
    else render()
    n++
  }
  const perOp = (performance.now() - t0) / n
  return Math.max(4, Math.round(targetMs / perOp))
}

async function measureAsync(
  lib: string,
  render: () => Promise<string>,
  opsPerWindow: number,
  windows = 25,
  warmup = 6,
): Promise<Sample> {
  let sink = 0
  for (let w = 0; w < warmup; w++) {
    for (let j = 0; j < opsPerWindow; j++) sink += (await render()).length
  }
  const rps: number[] = []
  for (let w = 0; w < windows; w++) {
    const start = performance.now()
    for (let j = 0; j < opsPerWindow; j++) sink += (await render()).length
    const dt = performance.now() - start
    rps.push((opsPerWindow / dt) * 1000)
  }
  if (sink < 0) throw new Error('unreachable')
  return { lib, ...bootstrapCI(rps) }
}

function measureSync(
  lib: string,
  render: () => string,
  opsPerWindow: number,
  windows = 25,
  warmup = 6,
): Sample {
  let sink = 0
  for (let w = 0; w < warmup; w++) {
    for (let j = 0; j < opsPerWindow; j++) sink += render().length
  }
  const rps: number[] = []
  for (let w = 0; w < windows; w++) {
    const start = performance.now()
    for (let j = 0; j < opsPerWindow; j++) sink += render().length
    const dt = performance.now() - start
    rps.push((opsPerWindow / dt) * 1000)
  }
  if (sink < 0) throw new Error('unreachable')
  return { lib, ...bootstrapCI(rps) }
}

const fmt = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

function report(title: string, avgBytes: number, rows: Sample[]): void {
  const sorted = rows.slice().sort((a, b) => b.median - a.median)
  const leader = sorted[0]!
  console.log(`\n  ${title}  (${avgBytes.toLocaleString()} bytes/render)`)
  for (const r of sorted) {
    const isLeader = r === leader
    const tie = !isLeader && r.hi >= leader.lo
    const rel = isLeader
      ? '1.00× 🥇'
      : tie
        ? `${(leader.median / r.median).toFixed(2)}× 🤝`
        : `${(leader.median / r.median).toFixed(2)}× slower`
    console.log(
      `    ${r.lib.padEnd(24)} ${fmt(r.median).padStart(9)} rend/s  ` +
        `[${fmt(r.lo)}–${fmt(r.hi)}]  ${rel}`,
    )
  }
}

// ─── Correctness gate (a renderer that doesn't render can't "win") ────────────

function normalize(html: string): string {
  // React/Solid SSR may inject HTML comment markers (`<!-- -->`, `<!--$-->`,
  // `<!--/-->`) between/around dynamic siblings; our trees have none, so strip
  // ALL comments so a benign marker-only difference doesn't mask a real
  // structural match. Loop until stable so overlapping/adjacent markers can't
  // leave a residual `<!--` (satisfies CodeQL's complete-sanitization check;
  // this is trusted framework output, not untrusted input).
  let out = html
  let prev: string
  do {
    prev = out
    out = out.replace(/<!--[\s\S]*?-->/g, '')
  } while (out !== prev)
  return out
}

interface Scenario {
  label: string
  py: () => Promise<string>
  pyf: () => Promise<string>
  pyfn?: () => Promise<string>
  re: () => string
  pr: () => string
  so: () => string
}

async function correctnessGate(scenarios: Scenario[]): Promise<void> {
  for (const s of scenarios) {
    const py = normalize(await s.py())
    const pyf = normalize(await s.pyf())
    const re = normalize(s.re())
    const pr = normalize(s.pr())
    const so = normalize(s.so())
    const disagree: string[] = []
    // Both fast-path variants MUST be byte-identical to Pyreon's h() path.
    if (py !== pyf) disagree.push('pyreon-fast (provable)')
    if (s.pyfn && py !== normalize(await s.pyfn())) disagree.push('pyreon-fast (nullable)')
    if (py !== re) disagree.push('react')
    if (py !== pr) disagree.push('preact')
    if (py !== so) disagree.push('solid')
    if (disagree.length > 0) {
      console.error(`\n[ssr-bench] CORRECTNESS FAIL on "${s.label}" — differs from Pyreon: ${disagree.join(', ')}`)
      console.error(`  pyreon: ${py.slice(0, 240)}`)
      if (py !== re) console.error(`  react : ${re.slice(0, 240)}`)
      if (py !== pr) console.error(`  preact: ${pr.slice(0, 240)}`)
      if (py !== so) console.error(`  solid : ${so.slice(0, 240)}`)
      throw new Error(`[ssr-bench] correctness gate failed on "${s.label}"`)
    }
    // Sanity: non-trivial output containing the expected content.
    if (!py.includes('class=') || py.length < 40) {
      throw new Error(`[ssr-bench] "${s.label}" produced suspiciously small output (${py.length} bytes)`)
    }
  }
  console.log('  ✓ correctness gate passed (all 4 renderers byte-identical for every scenario)')
}

// Pyreon COMPILED through its own SSR fast path (`ssrTemplate`) — the fair
// analog of compiling Solid via babel-preset-solid. TWO row variants (identical
// output) exercise the two dynamic-attr code paths:
//   PROVABLE  — `data-id={String(r.id)}` + `` href={`/item/${r.id}`} `` are
//               SYNTACTICALLY provably non-null-non-boolean (and the url is
//               provably safe), so the attr name+quotes BAKE into the template
//               and only the value is escaped — exactly like Solid. This is the
//               dominant real-app shape (devs stringify ids + template hrefs).
//   NULLABLE  — bare `data-id={r.id}` + `href={r.href}` are NOT provably
//               non-null, so the fast path keeps the runtime `_ssrAttr*` helper
//               (null-omit safety, a real correctness advantage over Solid,
//               which would emit `data-id=""` for a null id) — the ~15% floor.
const PYREON_FAST_SRC = `
export const Card = (c) => (
  <section class="card" data-variant="primary">
    <header class="hd"><h2>{c.title}</h2></header>
    <p class="body">{c.body}</p>
    <a class="cta" href={c.href}>Read more</a>
  </section>
)
export const List = (rows) => (
  <div class="list">
    {rows.map((r) => (
      <div class="row" data-id={String(r.id)}>
        <span class="id">{String(r.id)}</span>
        <a class="label" href={\`/item/\${r.id}\`}>{r.label}</a>
        <span class="tag">{r.tag}</span>
      </div>
    ))}
  </div>
)
`
const PYREON_FAST_NULLABLE_SRC = `
export const List = (rows) => (
  <div class="list">
    {rows.map((r) => (
      <div class="row" data-id={r.id}>
        <span class="id">{String(r.id)}</span>
        <a class="label" href={r.prefix + r.id}>{r.label}</a>
        <span class="tag">{r.tag}</span>
      </div>
    ))}
  </div>
)
`
function evalPyreonFast(src: string, file: string): Record<string, (arg: never) => unknown> {
  const out = transformJSX_JS(src, file, { ssr: true, ssrTemplate: true })
  if (!out.code.includes('_ssr(')) {
    throw new Error(`[ssr-bench] ${file} did not compile to _ssr — eligibility regressed`)
  }
  const body = out.code.replace(/^import\s+.*$/gm, '').replace(/^export /gm, '').trim()
  const names = ['_ssr', '_ssrChildren', '_ssrItem', '_esc', '_ssrAttr', '_ssrAttrGen', '_ssrAttrUrl']
  const bindings = body.match(/(?:const|function)\s+(\w+)/g)?.map((m) => m.split(/\s+/)[1]) ?? []
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, `${body}\nreturn { ${bindings.join(', ')} }`)
  return fn(...names.map((n) => (pyreonRuntime as Record<string, unknown>)[n]))
}
function compilePyreonFast(): { Card: (c: Card) => unknown; List: (rows: Row[]) => unknown } {
  return evalPyreonFast(PYREON_FAST_SRC, 'pyreon-fast.tsx') as {
    Card: (c: Card) => unknown
    List: (rows: Row[]) => unknown
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const solid = await compileSolid()
const pyFast = compilePyreonFast()
const pyFastNullable = evalPyreonFast(PYREON_FAST_NULLABLE_SRC, 'pyreon-fast-nullable.tsx') as {
  List: (rows: Row[]) => unknown
}

const rows50 = makeRows(50)
const rows1000 = makeRows(1000)

const scenarios = [
  {
    label: 'card',
    py: () => pyreonRenderToString(pyCard(CARD)),
    pyf: () => pyreonRenderToString(pyFast.Card(CARD) as never),
    re: () => reactRenderToString(reCard(CARD)),
    pr: () => preactRender(prCard(CARD)),
    so: () => solidRenderToString(() => solid.Card({ card: CARD })),
  },
  {
    label: 'list-50',
    py: () => pyreonRenderToString(pyList(rows50)),
    pyf: () => pyreonRenderToString(pyFast.List(rows50) as never),
    pyfn: () => pyreonRenderToString(pyFastNullable.List(rows50) as never),
    re: () => reactRenderToString(reList(rows50)),
    pr: () => preactRender(prList(rows50)),
    so: () => solidRenderToString(() => solid.List({ rows: rows50 })),
  },
  {
    label: 'list-1000',
    py: () => pyreonRenderToString(pyList(rows1000)),
    pyf: () => pyreonRenderToString(pyFast.List(rows1000) as never),
    pyfn: () => pyreonRenderToString(pyFastNullable.List(rows1000) as never),
    re: () => reactRenderToString(reList(rows1000)),
    pr: () => preactRender(prList(rows1000)),
    so: () => solidRenderToString(() => solid.List({ rows: rows1000 })),
  },
]

console.log('\n=== Cross-framework SSR benchmark — renderToString ===')
console.log(
  `  Bun ${Bun.version} · ${process.platform}/${process.arch} · NODE_ENV=${process.env.NODE_ENV}`,
)
console.log('  @pyreon/runtime-server vs react-dom/server · preact-render-to-string · solid-js/web')
console.log('  (author-judge bench — see header. higher renders/sec = better; 🤝 = CI-overlap tie)')

await correctnessGate(scenarios)

for (const s of scenarios) {
  const avgBytes = (await s.py()).length
  // Native calling convention per framework: Pyreon awaited (async), rest sync.
  const pyOps = await calibrate(s.py, true)
  const pyfOps = await calibrate(s.pyf, true)
  const reOps = await calibrate(s.re, false)
  const prOps = await calibrate(s.pr, false)
  const soOps = await calibrate(s.so, false)
  const rowsOut: Sample[] = [
    await measureAsync('@pyreon _ssr (provable attrs)', s.pyf, pyfOps),
  ]
  if (s.pyfn) {
    const pyfnOps = await calibrate(s.pyfn, true)
    rowsOut.push(await measureAsync('@pyreon _ssr (nullable attrs)', s.pyfn, pyfnOps))
  }
  rowsOut.push(
    await measureAsync('@pyreon h() (baseline)', s.py, pyOps),
    measureSync('react-dom/server', s.re, reOps),
    measureSync('preact-render-to-string', s.pr, prOps),
    measureSync('solid-js/web', s.so, soOps),
  )
  report(s.label, avgBytes, rowsOut)
}

console.log('')
