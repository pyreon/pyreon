import { onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

// Ported from docs/.vitepress/theme/components/PyreonLanding.vue
// (898 LOC). Same eight sections: Hero · Benchmark · Mechanism ·
// Compat · Zero · AI · Ecosystem · Footer. Same data — real measured
// benchmark numbers from CLAUDE.md, real package categories, real
// CLI command (`bunx create-pyreon-app`). Same brand-handoff
// semantic tokens for all visual elements.

// Real measured benchmark numbers (CLAUDE.md "Benchmark Results").
// Wall-clock ms, lower = faster. Pyreon ties Solid within noise.
const BENCHMARK: { name: string; c1k: string; r1k: string; upd: string; sel: string; c10k: string; hot: boolean }[] = [
  { name: 'Pyreon', c1k: '9', r1k: '10', upd: '5', sel: '5', c10k: '103', hot: true },
  { name: 'Solid', c1k: '10', r1k: '10', upd: '5', sel: '5', c10k: '104', hot: false },
  { name: 'Vue 3', c1k: '11', r1k: '11', upd: '7', sel: '5', c10k: '131', hot: false },
  { name: 'React 19', c1k: '33', r1k: '31', upd: '6', sel: '8', c10k: '540', hot: false },
]

const MECHANISM = [
  {
    n: '01',
    tag: '~>',
    t: 'Value-level signal reads',
    d: 'Reading a signal inside an effect or template registers a dependency on that value. Writing notifies exactly those subscribers — never the component, never the tree.',
  },
  {
    n: '02',
    tag: '//',
    t: 'Compiled templates · _tpl / _bind',
    d: 'JSX compiles to static HTML templates plus per-signal bindings. Static parts hoist once at module load; only the bindings ever re-run.',
  },
  {
    n: '03',
    tag: '[]',
    t: 'Zero-alloc mount',
    d: 'No virtual nodes, no diff array, no per-render allocation. Mount walks the template once and wires bindings straight to the DOM.',
  },
  {
    n: '04',
    tag: '>>',
    t: 'Streaming SSR + islands',
    d: 'Server renders to a stream with Suspense + async components. Islands hydrate independently — interactive before the tree settles.',
  },
]

const COMPAT = [
  { lib: 'React 18+', lines: ['// useState → signal', 'const [c, setC] = useState(0)', 'useEffect(fn, [c])'] },
  { lib: 'Preact 10', lines: ['// mirrors @preact/signals', 'const c = signal(0)', 'effect(() => log(c.value))'] },
  { lib: 'Vue 3.4', lines: ['// composition · ref/computed', 'const c = ref(0)', 'const d = computed(() => c.value*2)'] },
  { lib: 'SolidJS 1.9', lines: ['// createSignal / createEffect', 'const [c, setC] = createSignal(0)', 'createEffect(() => log(c()))'] },
]

const RENDER_MODES = [
  { tag: 'SSG', d: 'Pre-rendered at build. Static HTML + signal-hydration islands.' },
  { tag: 'ISR', d: 'Cached, revalidated on demand. CDN-friendly.' },
  { tag: 'SSR-STREAM', d: 'Server-rendered with streaming Suspense + async components.' },
  { tag: 'ISLANDS', d: 'Mostly static; interactive parts hydrate independently.' },
  { tag: 'SPA', d: 'Client-only. Same component model, no server.' },
]

const ECOSYSTEM = [
  { cat: 'core', count: 8, items: ['reactivity', 'core', 'compiler', 'runtime-dom', 'runtime-server', 'router', 'head', 'server'] },
  { cat: 'fundamentals', count: 22, items: ['store', 'form', 'query', 'i18n', 'storage', 'hooks', 'machine', 'flow', 'rx', '+13 more'] },
  { cat: 'tools', count: 10, items: ['cli', 'lint', 'mcp', 'vite-plugin', 'typescript', 'storybook', 'react/preact/vue/solid-compat'] },
  { cat: 'ui-system', count: 11, items: ['ui-core', 'styler', 'unistyle', 'elements', 'attrs', 'rocketstyle', 'coolgrid', 'kinetic', '+3 more'] },
  { cat: 'zero', count: 4, items: ['zero', 'zero-cli', 'create-zero', 'meta'] },
]

const FOOTER_GROUPS = [
  { h: 'Docs', items: ['Getting started', 'Reactivity', 'Zero · full-stack', 'AI · MCP + llms.txt'] },
  { h: 'Packages', items: ['@pyreon/reactivity', '@pyreon/router', '@pyreon/query', 'All 55 packages'] },
  { h: 'Tools', items: ['pyreon CLI', 'pyreon doctor', 'Devtools', 'Lint'] },
  { h: 'Project', items: ['GitHub', 'License (MIT)', 'Changelog', 'Brand'] },
]

export function PyreonLanding() {
  // Hero live counter — auto-ticks; only the digit re-renders.
  const count = signal(42)
  let timer: ReturnType<typeof setInterval> | null = null

  onMount(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    timer = setInterval(() => count.set(count() + 1), 2600)
  })
  onUnmount(() => {
    if (timer !== null) clearInterval(timer)
  })

  return (
    <div class="pyreon-landing">
      {/* ── 0 · HERO ─────────────────────────────────────────── */}
      <section class="px-hero">
        <div class="px-hero-text">
          <p class="pyreon-eyebrow">signal-based · full-stack · ai-native</p>
          <h1 class="px-h1">
            Reactivity that knows
            <br />
            <span class="px-ember-text">exactly where to fire.</span>
          </h1>
          <p class="px-lede">
            Fine-grained signal tracking — no virtual DOM, no diffing,
            no wasted work. When a signal changes, only the nodes that
            read it run again. Measured, not marketed — honest about
            the trade-offs.
          </p>
          <div class="px-cta">
            <a class="px-btn-primary" href="/docs/getting-started">
              Get started →
            </a>
            <code class="px-btn-cmd">$ bunx create-pyreon-app</code>
            <a class="px-link-inline" href="/docs/">
              ↗ docs
            </a>
          </div>
          <p class="px-honest">
            Synthetic-benchmark parity with Solid. Real-app head-to-head:
            we haven't run it, and we won't claim it until we do.
          </p>
        </div>
        <div class="px-panel px-demo">
          <div class="px-panel-head">
            <span class="px-mono-label">LIVE · only the digit re-renders</span>
            <span class="pyreon-pill pyreon-pill--ember">firing</span>
          </div>
          <div class="px-counter">
            <span class="px-counter-label">$count</span>
            <span class="px-digit">{() => count()}</span>
          </div>
          <pre class="px-code">
            <span class="c-cm">{`// counter.tsx\n`}</span>
            <span class="c-kw">const</span>{' '}
            <span class="c-var">$count</span> ={' '}
            <span class="c-fn">signal</span>(<span class="c-num">0</span>){'\n'}
            <span class="c-fn">setInterval</span>(() ={'>'}{' '}
            <span class="c-var">$count</span>.<span class="c-fn">set</span>(
            <span class="c-var">$count</span>+<span class="c-num">1</span>),{' '}
            <span class="c-num">2600</span>){'\n'}
            {'<'}<span class="c-fn">Counter</span>{'>'}
            {'{'}<span class="c-var">$count</span>{'}'}
            {'</'}<span class="c-fn">Counter</span>{'>'}
          </pre>
          <p class="px-demo-foot">
            The wrapping component, the layout, the page — never re-render.
            Only the digit node is updated.
          </p>
        </div>
      </section>

      {/* ── 1 · BENCHMARK ────────────────────────────────────── */}
      <section class="px-sec">
        <div class="px-sec-head">
          <span class="px-mono-label">
            01 · benchmark · js framework benchmark (chromium / playwright)
          </span>
          <span class="px-rule" />
        </div>
        <h2 class="px-h2">The measured numbers. Read them as data.</h2>
        <p class="px-sub">
          Wall-clock milliseconds on the standard js-framework-benchmark
          suite (Chromium via Playwright, lower = faster). These are
          synthetic workloads — every framework here optimizes for
          different real-world shapes. It's a data point, not a verdict.
        </p>
        <div class="px-panel">
          <table class="px-bench">
            <thead>
              <tr>
                <th>framework</th>
                <th class="px-r">create 1k</th>
                <th class="px-r">replace 1k</th>
                <th class="px-r">update</th>
                <th class="px-r">select</th>
                <th class="px-r">create 10k</th>
              </tr>
            </thead>
            <tbody>
              {BENCHMARK.map((b) => (
                <tr class={b.hot ? 'px-hot' : ''}>
                  <td>
                    {b.hot ? <span class="px-dot">●</span> : null}
                    {b.name}
                  </td>
                  <td class="px-r px-num">{b.c1k}</td>
                  <td class="px-r px-num">{b.r1k}</td>
                  <td class="px-r px-num">{b.upd}</td>
                  <td class="px-r px-num">{b.sel}</td>
                  <td class="px-r px-num">{b.c10k}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="px-bench-foot">
            Source: CLAUDE.md "Benchmark Results".{' '}
            <a href="https://github.com/pyreon/pyreon">run yours</a> ·
            methodology in the repo.
          </p>
        </div>
      </section>

      {/* ── 2 · MECHANISM ────────────────────────────────────── */}
      <section class="px-sec">
        <div class="px-sec-head">
          <span class="px-mono-label">
            02 · mechanism · how the engine actually works
          </span>
          <span class="px-rule" />
        </div>
        <h2 class="px-h2">No magic. Four layers, each one observable.</h2>
        <div class="px-mech-grid">
          {MECHANISM.map((m) => (
            <article class="px-panel px-mech">
              <div class="px-mech-h">
                <span class="px-mech-n">{m.n}</span>
                <span class="px-mech-tag">{m.tag}</span>
              </div>
              <h3 class="px-mech-t">{m.t}</h3>
              <p class="px-mech-d">{m.d}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── 3 · COMPAT ───────────────────────────────────────── */}
      <section class="px-sec">
        <div class="px-sec-head">
          <span class="px-mono-label">
            03 · compatibility · the API you already know
          </span>
          <span class="px-rule" />
        </div>
        <h2 class="px-h2">Same hooks. Same composition. Same shape.</h2>
        <p class="px-sub">
          Migrate gradually. Adopt incrementally. Each compat layer
          targets ~95% public-API parity with its parent framework;
          where Pyreon's signal model demands a different shape, the
          gap is documented per-package.
        </p>
        <div class="px-compat-grid">
          {COMPAT.map((c) => (
            <div class="px-panel px-compat">
              <div class="px-compat-h">{c.lib}</div>
              <pre class="px-compat-pre">{c.lines.join('\n')}</pre>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4 · ZERO ─────────────────────────────────────────── */}
      <section class="px-sec">
        <div class="px-sec-head">
          <span class="px-mono-label">
            04 · zero · the full-stack meta-framework
          </span>
          <span class="px-rule" />
        </div>
        <h2 class="px-h2">Five render modes. One component model.</h2>
        <div class="px-modes-grid">
          {RENDER_MODES.map((r) => (
            <div class="px-panel px-mode">
              <div class="px-mode-tag">{r.tag}</div>
              <p class="px-mode-d">{r.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5 · ECOSYSTEM ────────────────────────────────────── */}
      <section class="px-sec">
        <div class="px-sec-head">
          <span class="px-mono-label">
            05 · ecosystem · 55 packages, all first-party
          </span>
          <span class="px-rule" />
        </div>
        <h2 class="px-h2">Every layer ships with the framework.</h2>
        <div class="px-eco-grid">
          {ECOSYSTEM.map((e) => (
            <div class="px-panel px-eco">
              <div class="px-eco-h">
                <span class="px-eco-cat">{e.cat}</span>
                <span class="px-eco-count">{e.count}</span>
              </div>
              <ul class="px-eco-list">
                {e.items.map((it) => (
                  <li>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── 6 · FOOTER ───────────────────────────────────────── */}
      <footer class="px-footer">
        <div class="px-footer-grid">
          {FOOTER_GROUPS.map((g) => (
            <div>
              <div class="px-footer-h">{g.h}</div>
              <ul class="px-footer-list">
                {g.items.map((it) => (
                  <li>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p class="px-footer-foot">
          Pyreon · signal-based UI · MIT
        </p>
      </footer>
    </div>
  )
}
