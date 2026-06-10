import { For, onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { PyreonHeroMark } from './PyreonHeroMark'

// Verbatim structural port of
// docs/.vitepress/theme/components/PyreonLanding.vue (898 LOC).
// Eight sections: Hero · Benchmark · Mechanism · Compat · Zero · AI ·
// Ecosystem · Footer. Every class name, every section number, every
// piece of copy matches the Vue source — paraphrasing here would
// break the CSS bound to those exact names.

// Real measured numbers — CLAUDE.md "Benchmark Results" (Chromium via
// Playwright). ms, lower = faster. Pyreon ties Solid within noise.
const BENCHMARK = [
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

// Each token is `[text, class]`. Classes map to `--syn-*` CSS vars
// (defined in `tokens.css`): `cm` comment, `kw` keyword, `fn` function,
// `var` variable/identifier, `num` number, `str` string, `fg` punctuation.
// Letter-only classnames are short enough to write inline without a
// helper. The full syntax-token surface (7 colors) is the same set
// Shiki paints in our `.md`-page code blocks — landing parity.
type Tok = readonly [string, 'cm' | 'kw' | 'fn' | 'var' | 'num' | 'str' | 'fg']
const COMPAT: ReadonlyArray<{ lib: string; lines: ReadonlyArray<ReadonlyArray<Tok>> }> = [
  {
    lib: 'React 18+',
    lines: [
      [['// useState → signal', 'cm']],
      [
        ['const ', 'kw'],
        ['[c, setC]', 'var'],
        [' = ', 'fg'],
        ['useState', 'fn'],
        ['(', 'fg'],
        ['0', 'num'],
        [')', 'fg'],
      ],
      [
        ['useEffect', 'fn'],
        ['(fn, [c])', 'fg'],
      ],
    ],
  },
  {
    lib: 'Preact 10',
    lines: [
      [['// mirrors @preact/signals', 'cm']],
      [
        ['const ', 'kw'],
        ['c', 'var'],
        [' = ', 'fg'],
        ['signal', 'fn'],
        ['(', 'fg'],
        ['0', 'num'],
        [')', 'fg'],
      ],
      [
        ['effect', 'fn'],
        ['(() => ', 'fg'],
        ['log', 'fn'],
        ['(c.value))', 'fg'],
      ],
    ],
  },
  {
    lib: 'Vue 3.4',
    lines: [
      [['// composition · ref/computed', 'cm']],
      [
        ['const ', 'kw'],
        ['c', 'var'],
        [' = ', 'fg'],
        ['ref', 'fn'],
        ['(', 'fg'],
        ['0', 'num'],
        [')', 'fg'],
      ],
      [
        ['const ', 'kw'],
        ['d', 'var'],
        [' = ', 'fg'],
        ['computed', 'fn'],
        ['(() => c.value*', 'fg'],
        ['2', 'num'],
        [')', 'fg'],
      ],
    ],
  },
  {
    lib: 'SolidJS 1.9',
    lines: [
      [['// createSignal / createEffect', 'cm']],
      [
        ['const ', 'kw'],
        ['[c, setC]', 'var'],
        [' = ', 'fg'],
        ['createSignal', 'fn'],
        ['(', 'fg'],
        ['0', 'num'],
        [')', 'fg'],
      ],
      [
        ['createEffect', 'fn'],
        ['(() => ', 'fg'],
        ['log', 'fn'],
        ['(c()))', 'fg'],
      ],
    ],
  },
]

const RENDER_MODES = [
  { tag: 'SSG', d: 'Pre-rendered at build. Static HTML + signal-hydration islands.' },
  { tag: 'ISR', d: 'Cached, revalidated on demand. CDN-friendly.' },
  { tag: 'SSR-STREAM', d: 'Server-rendered with streaming Suspense + async components.' },
  { tag: 'ISLANDS', d: 'Mostly static; interactive parts hydrate independently.' },
  { tag: 'SPA', d: 'Client-only. Same component model, no server.' },
]

// Real categories/counts from CLAUDE.md (55 published packages).
const ECOSYSTEM = [
  { cat: 'core', count: 8, items: ['reactivity', 'core', 'compiler', 'runtime-dom', 'runtime-server', 'router', 'head', 'server'] },
  { cat: 'fundamentals', count: 22, items: ['store', 'form', 'query', 'i18n', 'storage', 'hooks', 'machine', 'flow', 'rx', '+13 more'] },
  { cat: 'tools', count: 10, items: ['cli', 'lint', 'mcp', 'vite-plugin', 'typescript', 'storybook', 'react/preact/vue/solid-compat'] },
  { cat: 'ui-system', count: 11, items: ['ui-core', 'styler', 'unistyle', 'elements', 'attrs', 'rocketstyle', 'coolgrid', 'kinetic', '+3 more'] },
  { cat: 'zero', count: 4, items: ['zero', 'zero-cli', 'create-zero', 'meta'] },
]

const FOOTER = [
  { h: 'Docs', items: ['Getting started', 'Reactivity', 'Zero · full-stack', 'AI · MCP + llms.txt'] },
  { h: 'Packages', items: ['@pyreon/reactivity', '@pyreon/router', '@pyreon/query', 'All 55 packages'] },
  { h: 'Tools', items: ['pyreon CLI', 'pyreon doctor', 'Devtools', 'Lint'] },
  { h: 'Project', items: ['GitHub', 'Changelog', 'Benchmarks', 'RFCs'] },
]

export function PyreonLanding() {
  // Hero live counter — auto-ticks; only the digit node re-renders.
  // `pulseKey` bumps alongside `count` so the digit can re-fire its
  // CSS keyframe on every tick (the keyframe doesn't restart on text
  // change alone — Vue uses `:key="pulseKey"` to remount the node).
  const count = signal(42)
  const pulseKey = signal(0)
  let timer: ReturnType<typeof setInterval> | null = null

  onMount(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    timer = setInterval(() => {
      count.set(count() + 1)
      pulseKey.set(pulseKey() + 1)
    }, 2600)
  })
  onUnmount(() => {
    if (timer !== null) clearInterval(timer)
  })

  return (
    <div class="px-landing">
      {/* ── 1 · HERO ───────────────────────────────────────────── */}
      <section class="px-hero">
        <div class="px-hero-copy">
          <PyreonHeroMark />
          <p class="pyreon-eyebrow">signal-based · full-stack · ai-native</p>
          <h1 class="px-h1">
            Reactivity that knows
            <br />
            <span class="px-ember-text">exactly where to fire.</span>
          </h1>
          <p class="px-lede">
            Fine-grained signal tracking — no virtual DOM, no diffing, no
            wasted work. When a signal changes, only the nodes that read it
            run again. Measured, not marketed — honest about the trade-offs.
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
            {/* Remount the digit span on every tick via `<For>` keyed
                by `pulseKey`. CSS animations don't re-fire when only
                text content changes — Vue uses `:key="pulseKey"` to
                replace the DOM node. `<For>` with a single-item array
                keyed by the bumped counter is the Pyreon-canonical
                equivalent. */}
            <For each={() => [pulseKey()]} by={(k) => k}>
              {() => <span class="px-digit">{() => count()}</span>}
            </For>
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

      {/* ── 2 · BENCHMARK ─────────────────────────────────────── */}
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
        <div class="px-bench-grid">
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
          <div class="px-claim-col">
            <div class="px-claim px-claim--cyan">
              <div class="px-claim-h">METHOD</div>
              <p>
                Standard js-framework-benchmark suite, Chromium via
                Playwright, wall-clock ms — same machine, same run.
                Re-run it yourself; the config is in the repo.
              </p>
            </div>
            <div class="px-claim px-claim--ember">
              <div class="px-claim-h">SCOPE</div>
              <p>
                We report our own measured numbers and synthetic-benchmark
                parity with Solid. Real-app head-to-head isn't run yet —
                we won't claim it until it is. Every framework here is
                good work by good people.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3 · MECHANISM ──────────────────────────────────────── */}
      <section class="px-sec">
        <div class="px-sec-head">
          <span class="px-mono-label">02 · mechanism · how it works</span>
          <span class="px-rule" />
        </div>
        <h2 class="px-h2">Signal reads in. Targeted re-runs out.</h2>
        <p class="px-sub">
          Four mechanisms, named the way the source names them — the words
          your profiler will print at 3am.
        </p>
        <div class="px-grid-4">
          {MECHANISM.map((m, i) => (
            <div class={i === 0 ? 'px-card px-card--lead' : 'px-card'}>
              <div class="px-card-head">
                <span class="px-mono-label">{m.n}</span>
                <span class="px-card-rule" />
                <span class="px-card-tag">{m.tag}</span>
              </div>
              <div class="px-card-t">{m.t}</div>
              <div class="px-card-d">{m.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4 · COMPAT ─────────────────────────────────────────── */}
      <section class="px-sec">
        <div class="px-sec-head">
          <span class="px-mono-label">03 · compat · use the api you know</span>
          <span class="px-rule" />
        </div>
        <h2 class="px-h2">
          React, Preact, Vue 3, or SolidJS. Pick your dialect.
        </h2>
        <p class="px-sub">
          Compatibility layers compile each API down to Pyreon signals.
          Migrate one component at a time, or just write what your team
          already speaks.
        </p>
        <div class="px-grid-4">
          {COMPAT.map((col) => (
            <div class="px-panel px-compat">
              <div class="px-panel-head">
                <span class="px-compat-lib">{col.lib}</span>
                <span class="px-mono-label">↻ → signals</span>
              </div>
              <pre class="px-code">
                {col.lines.map((line, i) => (
                  <>
                    {line.map(([text, cls]) => (
                      <span class={`c-${cls}`}>{text}</span>
                    ))}
                    {i < col.lines.length - 1 ? '\n' : ''}
                  </>
                ))}
              </pre>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5 · ZERO ───────────────────────────────────────────── */}
      <section class="px-sec">
        <div class="px-sec-head">
          <span class="px-mono-label">04 · zero · full-stack meta-framework</span>
          <span class="px-rule" />
        </div>
        <h2 class="px-h2">SSR · SSG · ISR · islands · SPA. One config.</h2>
        <p class="px-sub">
          Zero is the meta-framework atop Pyreon: file-system routing, API
          routes, server actions, every render strategy in one config.
        </p>
        <div class="px-zero-grid">
          <div class="px-panel">
            <div class="px-mono-label">zero.config.ts</div>
            <pre class="px-code">
              <span class="c-kw">export default</span>{' '}
              <span class="c-fn">defineConfig</span>({'{'}
              {'\n  '}
              <span class="c-var">routes</span>: {'{'}
              {'\n    '}
              <span class="c-str">'/'</span>:{'         {'} render:{' '}
              <span class="c-str">'ssg'</span> {'}'},{'\n    '}
              <span class="c-str">'/blog/:id'</span>: {'{'} render:{' '}
              <span class="c-str">'isr'</span>, revalidate:{' '}
              <span class="c-num">60</span> {'}'},{'\n    '}
              <span class="c-str">'/feed'</span>:{'     {'} render:{' '}
              <span class="c-str">'ssr-stream'</span> {'}'},{'\n    '}
              <span class="c-str">'/app/*'</span>:{'    {'} render:{' '}
              <span class="c-str">'islands'</span> {'}'},{'\n  '}
              {'}'},{'\n  '}
              <span class="c-var">ai</span>: {'{'} mcp:{' '}
              <span class="c-num">true</span>, llmsTxt:{' '}
              <span class="c-num">true</span> {'}'},{'\n'}
              {'}'})
            </pre>
          </div>
          <div>
            <div class="px-mono-label">RENDER MODES</div>
            {RENDER_MODES.map((m) => (
              <div class="px-mode">
                <span class="px-mode-tag">{m.tag}</span>
                <span class="px-mode-d">{m.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6 · AI ─────────────────────────────────────────────── */}
      <section class="px-sec">
        <div class="px-sec-head">
          <span class="px-mono-label">
            05 · ai · for agents that read source, not guess it
          </span>
          <span class="px-rule" />
        </div>
        <h2 class="px-h2">First-class MCP + llms.txt.</h2>
        <p class="px-sub">
          Every Pyreon project ships a generated llms.txt manifest and an
          MCP server exposing typed tools. Agents read your actual source —
          no prompt scaffolding, no scraping.
        </p>
        <div class="px-grid-2">
          <div class="px-panel">
            <div class="px-panel-head">
              <span class="px-mono-label">llms.txt · auto-generated</span>
              <span class="px-ok">● in sync · CI-gated</span>
            </div>
            <pre class="px-code">
              <span class="c-fn"># Pyreon</span>
              {'\n'}
              <span class="c-cm">
                {'>'} Signal-based UI framework. Fine-grained, no VDOM.
              </span>
              {'\n\n'}
              <span class="c-fn">## Core API</span>
              {'\n'}- signal: create a tracked reactive value{'\n'}- computed:
              pure function of other signals{'\n'}- effect: side effect,
              auto-tracked{'\n'}- untrack: read without subscribing
            </pre>
          </div>
          <div class="px-panel">
            <div class="px-panel-head">
              <span class="px-mono-label">
                MCP tool call · from your editor's agent
              </span>
              <span class="pyreon-pill pyreon-pill--ember">typed tools</span>
            </div>
            <pre class="px-code">
              <span class="c-fn">→ get_api</span>(
              <span class="c-str">{`{ symbol: "createStore" }`}</span>){'\n'}
              <span class="c-cm">← signature, example, mistakes[],</span>
              {'\n'}
              <span class="c-cm">
                {'  '}seeAlso, addedIn — straight from the
              </span>
              {'\n'}
              <span class="c-cm">
                {'  '}package manifest, not a guess.
              </span>
            </pre>
          </div>
        </div>
      </section>

      {/* ── 7 · ECOSYSTEM ──────────────────────────────────────── */}
      <section class="px-sec">
        <div class="px-sec-head">
          <span class="px-mono-label">
            06 · ecosystem · counted, not exclaimed
          </span>
          <span class="px-rule" />
        </div>
        <h2 class="px-h2">
          55 packages. Routing, forms, data, devtools — already there.
        </h2>
        <p class="px-sub">
          Everything you'd otherwise stitch together yourself. Every
          package is signal-aware, type-safe, and tree-shakeable.
        </p>
        <div class="px-grid-3">
          {ECOSYSTEM.map((g) => (
            <div class="px-panel">
              <div class="px-eco-head">
                <span class="px-eco-cat">{g.cat}</span>
                <span class="px-card-rule" />
                <span class="px-mono-label">{g.count}</span>
              </div>
              <div class="px-eco-items">
                {g.items.map((it, j) => (
                  <span>
                    <span class="px-eco-ns">@pyreon/</span>
                    <span class="px-eco-pkg">{it}</span>
                    {j < g.items.length - 1 ? (
                      <span class="px-eco-sep"> · </span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div class="px-eco-total">
          total · <strong>55 packages</strong> · 5 categories · all
          tree-shakeable
        </div>
      </section>

      {/* ── 8 · FOOTER ─────────────────────────────────────────── */}
      <footer class="px-footer">
        <div class="px-footer-grid">
          <div class="px-footer-brand">
            <PyreonHeroMark noMotion />
            <p>
              The signal-based UI framework — fine-grained reactivity,
              full-stack, AI-native.
            </p>
          </div>
          {FOOTER.map((c) => (
            <div class="px-footer-col">
              <div class="px-mono-label">{c.h}</div>
              {c.items.map((it) => (
                <div class="px-footer-item">{it}</div>
              ))}
            </div>
          ))}
        </div>
        <div class="px-footer-bar">
          <span>© 2026 Pyreon · MIT · forged in prague · eu</span>
          <span class="px-footer-meta">
            <a href="https://github.com/pyreon/pyreon">github ↗</a>
            <span class="px-ok">● ci passing</span>
          </span>
        </div>
      </footer>
    </div>
  )
}
