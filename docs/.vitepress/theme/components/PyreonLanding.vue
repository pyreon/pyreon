<!--
  Full landing — recreates the brand handoff's dedicated landing
  (pyreon-landing.jsx, 8 sections): Hero · Benchmark · Mechanism ·
  Compat · Zero · AI · Ecosystem · Footer.

  Single-source / honesty:
  - 100% SEMANTIC tokens (--bg/--text/--ember/--link/--syn-* from
    tokens.css) — no raw hex, so it themes correctly in BOTH light and
    dark (the merged #660 token system drives it).
  - The benchmark uses the REAL measured numbers from CLAUDE.md, NOT
    the mockup's illustrative geo-mean figures (handoff §7 honesty rule
    + PR #648 enforced measured data). Pending real-app head-to-head is
    stated, not hidden.
  - The CLI command is the real `bunx create-pyreon-app` (the mockup's
    `npx create pyreon` does not exist).
  - No fabricated bundle size / tool counts; no 404 nav/footer links.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

// Hero live counter — auto-ticks; only the digit node re-renders.
const count = ref(42)
const pulseKey = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduce) return
  timer = setInterval(() => {
    count.value++
    pulseKey.value++
  }, 1800)
})
onBeforeUnmount(() => clearInterval(timer))

// Real measured numbers — CLAUDE.md "Benchmark Results" (Chromium via
// Playwright). ms, lower = faster. Pyreon ties Solid within noise.
const benchmark = [
  { name: 'Pyreon', c1k: '9', r1k: '10', upd: '5', sel: '5', c10k: '103', hot: true },
  { name: 'Solid', c1k: '10', r1k: '10', upd: '5', sel: '5', c10k: '104', hot: false },
  { name: 'Vue 3', c1k: '11', r1k: '11', upd: '7', sel: '5', c10k: '131', hot: false },
  { name: 'React 19', c1k: '33', r1k: '31', upd: '6', sel: '8', c10k: '540', hot: false },
]

const mechanism = [
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

const compat = [
  { lib: 'React 18+', lines: ['// useState → signal', 'const [c, setC] = useState(0)', 'useEffect(fn, [c])'] },
  { lib: 'Preact 10', lines: ['// mirrors @preact/signals', 'const c = signal(0)', 'effect(() => log(c.value))'] },
  { lib: 'Vue 3.4', lines: ['// composition · ref/computed', 'const c = ref(0)', 'const d = computed(() => c.value*2)'] },
  { lib: 'SolidJS 1.9', lines: ['// createSignal / createEffect', 'const [c, setC] = createSignal(0)', 'createEffect(() => log(c()))'] },
]

const renderModes = [
  { tag: 'SSG', d: 'Pre-rendered at build. Static HTML + signal-hydration islands.' },
  { tag: 'ISR', d: 'Cached, revalidated on demand. CDN-friendly.' },
  { tag: 'SSR-STREAM', d: 'Server-rendered with streaming Suspense + async components.' },
  { tag: 'ISLANDS', d: 'Mostly static; interactive parts hydrate independently.' },
  { tag: 'SPA', d: 'Client-only. Same component model, no server.' },
]

// Real categories/counts from CLAUDE.md (55 published packages).
const ecosystem = [
  { cat: 'core', count: 8, items: ['reactivity', 'core', 'compiler', 'runtime-dom', 'runtime-server', 'router', 'head', 'server'] },
  { cat: 'fundamentals', count: 22, items: ['store', 'form', 'query', 'i18n', 'storage', 'hooks', 'machine', 'flow', 'rx', '+13 more'] },
  { cat: 'tools', count: 10, items: ['cli', 'lint', 'mcp', 'vite-plugin', 'typescript', 'storybook', 'react/preact/vue/solid-compat'] },
  { cat: 'ui-system', count: 11, items: ['ui-core', 'styler', 'unistyle', 'elements', 'attrs', 'rocketstyle', 'coolgrid', 'kinetic', '+3 more'] },
  { cat: 'zero', count: 4, items: ['zero', 'zero-cli', 'create-zero', 'meta'] },
]

const footer = [
  { h: 'Docs', items: ['Getting started', 'Reactivity', 'Zero · full-stack', 'AI · MCP + llms.txt'] },
  { h: 'Packages', items: ['@pyreon/reactivity', '@pyreon/router', '@pyreon/query', 'All 55 packages'] },
  { h: 'Tools', items: ['pyreon CLI', 'pyreon doctor', 'Devtools', 'Lint'] },
  { h: 'Project', items: ['GitHub', 'Changelog', 'Benchmarks', 'RFCs'] },
]
</script>

<template>
  <div class="px-landing">
    <!-- ── 1 · HERO ───────────────────────────────────────────── -->
    <section class="px-hero">
      <div class="px-hero-copy">
        <PyreonHeroMark class="px-hero-mark" />
        <p class="pyreon-eyebrow">signal-based · full-stack · ai-native</p>
        <h1 class="px-h1">
          Reactivity that knows<br />
          <span class="px-ember-text">exactly where to fire.</span>
        </h1>
        <p class="px-lede">
          Fine-grained signal tracking — no virtual DOM, no diffing, no
          wasted work. When a signal changes, only the nodes that read it
          run again. Measured, not marketed — honest about the trade-offs.
        </p>
        <div class="px-cta">
          <a class="px-btn-primary" href="/docs/getting-started">Get started →</a>
          <code class="px-btn-cmd">$ bunx create-pyreon-app</code>
          <a class="px-link-inline" href="/docs/">↗ docs</a>
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
          <span :key="pulseKey" class="px-digit">{{ count }}</span>
        </div>
        <pre class="px-code"><span class="c-cm">// counter.tsx</span>
<span class="c-kw">const</span> <span class="c-var">$count</span> = <span class="c-fn">signal</span>(<span class="c-num">0</span>)
<span class="c-fn">setInterval</span>(() =&gt; <span class="c-var">$count</span>.<span class="c-fn">set</span>(<span class="c-var">$count</span>+<span class="c-num">1</span>), <span class="c-num">1800</span>)
&lt;<span class="c-fn">Counter</span>&gt;{{ '{' }}<span class="c-var">$count</span>{{ '}' }}&lt;/<span class="c-fn">Counter</span>&gt;</pre>
        <p class="px-demo-foot">
          The wrapping component, the layout, the page — never re-render.
          Only the digit node is updated.
        </p>
      </div>
    </section>

    <!-- ── 2 · BENCHMARK (real measured numbers) ──────────────── -->
    <section class="px-sec">
      <div class="px-sec-head">
        <span class="px-mono-label">01 · benchmark · js framework benchmark (chromium / playwright)</span>
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
              <tr v-for="b in benchmark" :key="b.name" :class="{ 'px-hot': b.hot }">
                <td><span v-if="b.hot" class="px-dot">●</span>{{ b.name }}</td>
                <td class="px-r px-num">{{ b.c1k }}</td>
                <td class="px-r px-num">{{ b.r1k }}</td>
                <td class="px-r px-num">{{ b.upd }}</td>
                <td class="px-r px-num">{{ b.sel }}</td>
                <td class="px-r px-num">{{ b.c10k }}</td>
              </tr>
            </tbody>
          </table>
          <p class="px-bench-foot">
            Source: CLAUDE.md “Benchmark Results”.
            <a href="https://github.com/pyreon/pyreon">run yours</a> · methodology in the repo.
          </p>
        </div>
        <div class="px-claim-col">
          <div class="px-claim px-claim--cyan">
            <div class="px-claim-h">METHOD</div>
            <p>Standard js-framework-benchmark suite, Chromium via Playwright, wall-clock ms — same machine, same run. Re-run it yourself; the config is in the repo.</p>
          </div>
          <div class="px-claim px-claim--ember">
            <div class="px-claim-h">SCOPE</div>
            <p>We report our own measured numbers and synthetic-benchmark parity with Solid. Real-app head-to-head isn't run yet — we won't claim it until it is. Every framework here is good work by good people.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 3 · MECHANISM ──────────────────────────────────────── -->
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
        <div
          v-for="(c, i) in mechanism"
          :key="c.n"
          class="px-card"
          :class="{ 'px-card--lead': i === 0 }"
        >
          <div class="px-card-head">
            <span class="px-mono-label">{{ c.n }}</span>
            <span class="px-card-rule" />
            <span class="px-card-tag">{{ c.tag }}</span>
          </div>
          <div class="px-card-t">{{ c.t }}</div>
          <div class="px-card-d">{{ c.d }}</div>
        </div>
      </div>
    </section>

    <!-- ── 4 · COMPAT ─────────────────────────────────────────── -->
    <section class="px-sec">
      <div class="px-sec-head">
        <span class="px-mono-label">03 · compat · use the api you know</span>
        <span class="px-rule" />
      </div>
      <h2 class="px-h2">React, Preact, Vue 3, or SolidJS. Pick your dialect.</h2>
      <p class="px-sub">
        Compatibility layers compile each API down to Pyreon signals.
        Migrate one component at a time, or just write what your team
        already speaks.
      </p>
      <div class="px-grid-4">
        <div v-for="col in compat" :key="col.lib" class="px-panel px-compat">
          <div class="px-panel-head">
            <span class="px-compat-lib">{{ col.lib }}</span>
            <span class="px-mono-label">↻ → signals</span>
          </div>
          <pre class="px-code"><template v-for="(l, j) in col.lines" :key="j"><span :class="l.startsWith('//') ? 'c-cm' : 'c-fg'">{{ l }}</span>
</template></pre>
        </div>
      </div>
    </section>

    <!-- ── 5 · ZERO ───────────────────────────────────────────── -->
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
          <pre class="px-code"><span class="c-kw">export default</span> <span class="c-fn">defineConfig</span>({{ '{' }}
  <span class="c-var">routes</span>: {{ '{' }}
    <span class="c-str">'/'</span>:         {{ '{' }} render: <span class="c-str">'ssg'</span> {{ '}' }},
    <span class="c-str">'/blog/:id'</span>: {{ '{' }} render: <span class="c-str">'isr'</span>, revalidate: <span class="c-num">60</span> {{ '}' }},
    <span class="c-str">'/feed'</span>:     {{ '{' }} render: <span class="c-str">'ssr-stream'</span> {{ '}' }},
    <span class="c-str">'/app/*'</span>:    {{ '{' }} render: <span class="c-str">'islands'</span> {{ '}' }},
  {{ '}' }},
  <span class="c-var">ai</span>: {{ '{' }} mcp: <span class="c-num">true</span>, llmsTxt: <span class="c-num">true</span> {{ '}' }},
{{ '}' }})</pre>
        </div>
        <div>
          <div class="px-mono-label">RENDER MODES</div>
          <div v-for="m in renderModes" :key="m.tag" class="px-mode">
            <span class="px-mode-tag">{{ m.tag }}</span>
            <span class="px-mode-d">{{ m.d }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 6 · AI ─────────────────────────────────────────────── -->
    <section class="px-sec">
      <div class="px-sec-head">
        <span class="px-mono-label">05 · ai · for agents that read source, not guess it</span>
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
          <pre class="px-code"><span class="c-fn"># Pyreon</span>
<span class="c-cm">&gt; Signal-based UI framework. Fine-grained, no VDOM.</span>

<span class="c-fn">## Core API</span>
- signal: create a tracked reactive value
- computed: pure function of other signals
- effect: side effect, auto-tracked
- untrack: read without subscribing</pre>
        </div>
        <div class="px-panel">
          <div class="px-panel-head">
            <span class="px-mono-label">MCP tool call · from your editor's agent</span>
            <span class="pyreon-pill pyreon-pill--ember">typed tools</span>
          </div>
          <pre class="px-code"><span class="c-fn">→ get_api</span>(<span class="c-str">{ symbol: "createStore" }</span>)
<span class="c-cm">← signature, example, mistakes[],</span>
<span class="c-cm">  seeAlso, addedIn — straight from the</span>
<span class="c-cm">  package manifest, not a guess.</span></pre>
        </div>
      </div>
    </section>

    <!-- ── 7 · ECOSYSTEM ──────────────────────────────────────── -->
    <section class="px-sec">
      <div class="px-sec-head">
        <span class="px-mono-label">06 · ecosystem · counted, not exclaimed</span>
        <span class="px-rule" />
      </div>
      <h2 class="px-h2">55 packages. Routing, forms, data, devtools — already there.</h2>
      <p class="px-sub">
        Everything you'd otherwise stitch together yourself. Every
        package is signal-aware, type-safe, and tree-shakeable.
      </p>
      <div class="px-grid-3">
        <div v-for="g in ecosystem" :key="g.cat" class="px-panel">
          <div class="px-eco-head">
            <span class="px-eco-cat">{{ g.cat }}</span>
            <span class="px-card-rule" />
            <span class="px-mono-label">{{ g.count }}</span>
          </div>
          <div class="px-eco-items">
            <span v-for="(it, j) in g.items" :key="j">
              <span class="px-eco-ns">@pyreon/</span><span class="px-eco-pkg">{{ it }}</span><span
                v-if="j < g.items.length - 1"
                class="px-eco-sep"
              > · </span>
            </span>
          </div>
        </div>
      </div>
      <div class="px-eco-total">
        total · <strong>55 packages</strong> · 5 categories · all tree-shakeable
      </div>
    </section>

    <!-- ── 8 · FOOTER ─────────────────────────────────────────── -->
    <footer class="px-footer">
      <div class="px-footer-grid">
        <div class="px-footer-brand">
          <PyreonHeroMark />
          <p>The signal-based UI framework — fine-grained reactivity, full-stack, AI-native.</p>
        </div>
        <div v-for="c in footer" :key="c.h" class="px-footer-col">
          <div class="px-mono-label">{{ c.h }}</div>
          <div v-for="it in c.items" :key="it" class="px-footer-item">{{ it }}</div>
        </div>
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
</template>

<style scoped>
.px-landing {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 40px 40px;
}

/* Section scaffolding */
.px-sec {
  padding: 88px 0;
  border-top: 1px solid var(--border);
}
.px-sec-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}
.px-rule,
.px-card-rule {
  flex: 1;
  height: 1px;
  background: var(--border);
}
.px-h2 {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(30px, 4vw, 52px);
  letter-spacing: -0.035em;
  line-height: 1.04;
  color: var(--text);
  margin: 0 0 14px;
  max-width: 960px;
}
.px-sub {
  font-family: var(--font-sans);
  font-size: 18px;
  color: var(--text-muted);
  line-height: 1.5;
  max-width: 680px;
  margin: 0 0 36px;
  text-wrap: pretty;
}
.px-mono-label {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-dim);
}

/* Hero */
.px-hero {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 56px;
  align-items: center;
  padding: 72px 0 80px;
}
.px-hero-mark {
  margin-bottom: 26px;
}
.px-h1 {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(44px, 5.6vw, 84px);
  letter-spacing: -0.04em;
  line-height: 1;
  color: var(--text);
  margin: 14px 0 18px;
}
.px-lede {
  font-family: var(--font-sans);
  font-size: 19px;
  color: var(--text-muted);
  line-height: 1.5;
  max-width: 520px;
  margin: 0;
  text-wrap: pretty;
}
.px-cta {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 24px;
  flex-wrap: wrap;
}
.px-btn-primary {
  background: var(--text);
  color: var(--bg);
  padding: 12px 20px;
  border-radius: 4px;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: opacity 0.15s ease;
}
.px-btn-primary:hover {
  opacity: 0.88;
}
.px-btn-cmd {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
  padding: 12px 20px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 13px;
}
.px-link-inline {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--link);
  border-bottom: 1px solid var(--link);
  text-decoration: none;
}
.px-honest {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-dim);
  line-height: 1.6;
  max-width: 520px;
  margin: 20px 0 0;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

/* Panels / cards */
.px-panel {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 22px;
}
.px-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

/* Live counter */
.px-counter {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 18px;
}
.px-counter-label {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--text-dim);
}
.px-digit {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 84px;
  letter-spacing: -0.04em;
  line-height: 1;
  color: var(--text);
  animation: px-digit 200ms cubic-bezier(0.2, 0.7, 0.3, 1);
}
.px-demo-foot {
  margin: 14px 0 0;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  line-height: 1.6;
}

/* Code blocks (semantic --syn-*) */
.px-code {
  margin: 0;
  background: var(--syn-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 14px 16px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  color: var(--syn-fg);
  overflow-x: auto;
  white-space: pre;
}
.c-cm {
  color: var(--syn-comment);
}
.c-fg {
  color: var(--syn-fg);
}
.c-kw {
  color: var(--syn-keyword);
}
.c-str {
  color: var(--syn-string);
}
.c-num {
  color: var(--syn-number);
}
.c-fn {
  color: var(--syn-fn);
}
.c-var {
  color: var(--syn-variable);
}

/* Benchmark */
.px-bench-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 36px;
  align-items: flex-start;
}
.px-bench {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 13px;
}
.px-bench th {
  text-align: left;
  padding: 8px 0;
  font-weight: 400;
  color: var(--text-dim);
  border: 0;
  text-transform: none;
}
.px-bench .px-r {
  text-align: right;
}
.px-bench td {
  padding: 10px 0;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
}
.px-bench tr.px-hot {
  background: var(--ember-bg);
}
.px-bench tr.px-hot td:first-child {
  color: var(--text);
  font-weight: 600;
}
.px-num {
  color: var(--text);
}
.px-dot {
  color: var(--ember);
  margin-right: 6px;
}
.px-bench-foot {
  margin: 14px 0 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.6;
}
.px-bench-foot a,
.px-footer-meta a {
  color: var(--link);
}
.px-claim-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.px-claim {
  padding: 18px;
  border-radius: 4px;
}
.px-claim p {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14.5px;
  color: var(--text);
  line-height: 1.55;
}
.px-claim-h {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  margin-bottom: 6px;
}
.px-claim--ember {
  background: var(--ember-bg);
  border-left: 2px solid var(--ember);
}
.px-claim--ember .px-claim-h {
  color: var(--ember);
}
.px-claim--cyan {
  background: var(--link-bg);
  border-left: 2px solid var(--link);
}
.px-claim--cyan .px-claim-h {
  color: var(--link);
}

/* Grids */
.px-grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.px-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.px-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
.px-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 22px;
}
.px-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.px-card--lead .px-card-rule {
  background: var(--ember);
}
.px-card-tag {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-muted);
}
.px-card-t {
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 500;
  color: var(--text);
  margin-top: 18px;
  letter-spacing: -0.015em;
}
.px-card-d {
  font-family: var(--font-sans);
  font-size: 13.5px;
  color: var(--text-muted);
  margin-top: 8px;
  line-height: 1.55;
}
.px-compat-lib {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}

/* Zero */
.px-zero-grid {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  gap: 28px;
}
.px-zero-grid .px-code {
  margin-top: 10px;
}
.px-mode {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 16px;
  padding: 11px 0;
  border-top: 1px solid var(--border);
}
.px-mode-tag {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
  letter-spacing: 0.04em;
}
.px-mode-d {
  font-family: var(--font-sans);
  font-size: 13.5px;
  color: var(--text-muted);
  line-height: 1.5;
}
.px-mode:first-of-type {
  margin-top: 8px;
}

/* AI */
.px-ok {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ok);
}

/* Ecosystem */
.px-eco-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.px-eco-cat {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 500;
}
.px-eco-items {
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.85;
}
.px-eco-ns {
  color: var(--text-dim);
}
.px-eco-pkg {
  color: var(--text);
}
.px-eco-sep {
  color: var(--text-hint);
}
.px-eco-total {
  margin-top: 24px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
}
.px-eco-total strong {
  color: var(--text);
}

/* Footer */
.px-footer {
  padding: 64px 0 24px;
  border-top: 1px solid var(--border);
}
.px-footer-grid {
  display: grid;
  grid-template-columns: 1.2fr repeat(4, 1fr);
  gap: 32px;
  margin-bottom: 44px;
}
.px-footer-brand p {
  font-family: var(--font-sans);
  font-size: 13.5px;
  color: var(--text-muted);
  line-height: 1.55;
  max-width: 260px;
  margin: 14px 0 0;
}
.px-footer-col .px-mono-label {
  display: block;
  margin-bottom: 12px;
}
.px-footer-item {
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-muted);
  padding: 4px 0;
}
.px-footer-bar {
  border-top: 1px solid var(--border);
  padding-top: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
}
.px-footer-meta {
  display: flex;
  gap: 18px;
}

@media (max-width: 920px) {
  .px-hero,
  .px-bench-grid,
  .px-zero-grid,
  .px-grid-2 {
    grid-template-columns: 1fr;
    gap: 32px;
  }
  .px-grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }
  .px-grid-3 {
    grid-template-columns: repeat(2, 1fr);
  }
  .px-footer-grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 560px) {
  .px-landing {
    padding: 0 20px 32px;
  }
  .px-grid-4,
  .px-grid-3,
  .px-footer-grid {
    grid-template-columns: 1fr;
  }
}
</style>
