<!--
  Full landing page — recreation of the dedicated `pyreon-landing.jsx`
  reference (8 sections): hero, benchmark, mechanism, compat, zero, ai,
  ecosystem, footer.

  Honesty-corrected vs the mockup (handoff §7 / CLAUDE.md rules):
   • Benchmark uses the REAL post-#648 `bench:fair` numbers from CLAUDE.md
     (the mockup's 1.00/1.04 geometric-mean rows were placeholders).
   • Scaffold command is `bunx create-pyreon-app` (the mockup's
     `npx create pyreon` does not exist; verified against
     packages/zero/create-zero).
   • Real package names + real MCP/API surface (mockup invented some).
   • No fabricated nav/footer links that would 404 — VitePress provides
     the nav; footer links only resolve to real destinations.

  Zero raw hex — every colour is a semantic token from tokens.css, so
  the whole page is correct in BOTH the dark and light theme. Reduced
  motion is honoured. SSR-safe (no window access at module scope).
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

// ── Hero live counter — only the digit re-renders ──────────────────────
const count = ref(42)
const pulseKey = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
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
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

// ── Real benchmark data (CLAUDE.md, post-#648 bench:fair) ───────────────
const bench = [
  { name: 'Create 1,000 rows', p: '11.9', s: '11.8', v: '10.7', r: '13.3', note: 'tied w/ Solid' },
  { name: 'Replace 1,000 rows', p: '12.0', s: '11.9', v: '10.6', r: '13.0', note: 'tied w/ Solid' },
  { name: 'Partial update', p: '5.1', s: '9.2', v: '6.6', r: '8.4', note: 'Pyreon fastest', best: true },
  { name: 'Select row', p: '4.6', s: '4.6', v: '4.7', r: '8.3', note: '3-way tie' },
  { name: 'Swap rows', p: '5.2', s: '5.9', v: '5.0', r: '8.7', note: 'tied w/ Vue' },
  { name: 'Clear rows', p: '4.7', s: '4.6', v: '4.8', r: '8.3', note: '3-way tie' },
  {
    name: 'Create 10,000 rows',
    p: '100.2',
    s: '107.5',
    v: '112.6',
    r: '222.5',
    note: 'Pyreon fastest',
    best: true,
  },
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
    d: 'JSX compiles to static HTML templates plus per-signal binding hooks. Static parts hoist once at module load; only the bindings ever re-run.',
  },
  {
    n: '03',
    tag: '[]',
    t: 'Zero-alloc mount',
    d: 'No virtual nodes, no diff array, no per-render allocation. Mount walks the template once and wires bindings directly to the DOM. GC pressure stays flat.',
  },
  {
    n: '04',
    tag: '>>',
    t: 'Streaming SSR + islands',
    d: 'The server renders to a stream with Suspense + async components. Islands hydrate independently — interactive long before the tree settles.',
  },
]

const compat = [
  { lib: 'React 18+', lines: ['// useState → signal', 'const [c, setC] = useState(0)', 'useEffect(() => …, [c])'] },
  { lib: 'Preact 10', lines: ['// mirrors @preact/signals', 'const c = signal(0)', 'effect(() => log(c.value))'] },
  { lib: 'Vue 3.5', lines: ['// composition API', 'const c = ref(0)', 'const d = computed(() => c.value * 2)'] },
  { lib: 'SolidJS 1.9', lines: ['// createSignal / createEffect', 'const [c, setC] = createSignal(0)', 'createEffect(() => log(c()))'] },
]

const renderModes = [
  { tag: 'SSG', d: 'Pre-rendered at build. Static HTML + signal-hydration islands.' },
  { tag: 'ISR', d: 'Cached, revalidated on demand. CDN-friendly.' },
  { tag: 'SSR-STREAM', d: 'Server-rendered with streaming Suspense + async components.' },
  { tag: 'ISLANDS', d: 'Mostly static; interactive parts hydrate independently.' },
  { tag: 'SPA', d: 'Client-only. Same component model, no server.' },
]

// Real @pyreon/* packages (CLAUDE.md), grouped — 55 published total.
const ecosystem = [
  { cat: 'core', items: ['reactivity', 'core', 'compiler', 'runtime-dom', 'runtime-server', 'router', 'head', 'server'] },
  { cat: 'state & data', items: ['store', 'state-tree', 'form', 'validation', 'query', 'table', 'virtual', 'storage'] },
  { cat: 'fundamentals', items: ['i18n', 'hooks', 'machine', 'flow', 'code', 'document', 'rx', 'toast', 'url-state', 'dnd'] },
  { cat: 'ui-system', items: ['ui-core', 'styler', 'unistyle', 'elements', 'rocketstyle', 'coolgrid', 'kinetic'] },
  { cat: 'tools', items: ['cli', 'lint', 'mcp', 'vite-plugin', 'typescript', 'storybook'] },
  { cat: 'compat & zero', items: ['react-compat', 'preact-compat', 'vue-compat', 'solid-compat', 'zero', 'create-zero'] },
]

const footerCols = [
  { h: 'Docs', items: [['Getting started', '/docs/getting-started'], ['Reactivity', '/docs/reactivity'], ['Zero · full-stack', '/docs/zero'], ['MCP server', '/docs/mcp']] },
  { h: 'Packages', items: [['@pyreon/reactivity', '/docs/reactivity'], ['@pyreon/router', '/docs/router'], ['@pyreon/query', '/docs/query'], ['All packages', '/docs/']] },
  { h: 'Tools', items: [['pyreon CLI', '/docs/cli'], ['Lint', '/docs/lint'], ['Vite plugin', '/docs/vite-plugin'], ['create-pyreon-app', '/docs/create-zero']] },
  { h: 'Project', items: [['GitHub', 'https://github.com/pyreon'], ['Changelog', '/docs/'], ['License · MIT', 'https://github.com/pyreon']] },
]
</script>

<template>
  <div class="px-l">
    <!-- ── 1 · HERO ──────────────────────────────────────────────── -->
    <section class="px-hero">
      <div class="px-hero-grid">
        <div>
          <PyreonHeroMark class="px-hero-mark" />
          <p class="px-eyebrow">signal-based · full-stack · ai-native</p>
          <h1 class="px-h1">
            Reactivity that knows<br />
            <span class="px-ember-text">exactly where to fire.</span>
          </h1>
          <p class="px-lede">
            Fine-grained signal tracking — no virtual DOM, no diffing, no
            wasted work. When a signal changes, only the nodes that read it
            run again. Competitive with Solid, honest about trade-offs.
          </p>
          <div class="px-cta">
            <a class="px-btn" href="/docs/getting-started">Get started →</a>
            <code class="px-btn-cmd">$ bunx create-pyreon-app</code>
            <a class="px-link-mini" href="/docs/">↗ docs</a>
          </div>
          <p class="px-honesty">
            Synthetic-benchmark co-leader with Solid and Vue. Real-app
            head-to-head: we haven't run it, and we won't claim it until we do.
          </p>
        </div>

        <div class="px-card px-demo">
          <div class="px-card-head">
            <span class="px-mono-label">LIVE · ONLY DIGIT RE-RENDERS</span>
            <span class="pyreon-pill pyreon-pill--ember">firing</span>
          </div>
          <div class="px-counter">
            <span class="px-counter-sig">$count</span>
            <span :key="pulseKey" class="px-digit">{{ count }}</span>
          </div>
          <div class="px-code">
            <div class="c-cm">// counter.tsx</div>
            <div><span class="c-kw">const</span> <span class="c-va">$count</span> = <span class="c-fn">signal</span>(<span class="c-nu">0</span>)</div>
            <div><span class="c-fn">setInterval</span>(() =&gt; <span class="c-va">$count</span>.<span class="c-fn">set</span>(<span class="c-va">$count</span>+<span class="c-nu">1</span>), <span class="c-nu">1800</span>)</div>
            <div>&lt;<span class="c-fn">Counter</span>&gt;{{ '{' }}$count{{ '}' }}&lt;/<span class="c-fn">Counter</span>&gt;</div>
          </div>
          <p class="px-demo-note">
            The wrapping component, the layout, the page — never re-render.
            Only the digit node is updated.
          </p>
        </div>
      </div>
    </section>

    <!-- ── 2 · BENCHMARK (real numbers) ──────────────────────────── -->
    <section class="px-sec">
      <div class="px-sec-head"><span class="px-mono-label">01 · benchmark · examples/benchmark · bench:fair</span><span class="px-rule" /></div>
      <h2 class="px-h2">Co-leader with Solid and Vue. Decisively ahead of React.</h2>
      <p class="px-sub">
        A single representative run of the <code>bench:fair</code> harness — real
        Chromium via Playwright, <code>vite preview</code> of the production build,
        median of 20 timed runs. Wall-clock ms is machine-dependent; the
        column ratios on one run are the signal. Reproduce:
        <code>cd examples/benchmark &amp;&amp; bun bench:fair</code>.
      </p>
      <div class="px-bench-wrap">
        <div class="px-card px-bench-card">
          <div class="px-bench-meta"><span>MS · LOWER = FASTER</span><span>SOURCE · krausest/js-framework-benchmark</span></div>
          <table class="px-bench">
            <thead>
              <tr><th>benchmark</th><th class="r">Pyreon</th><th class="r">Solid</th><th class="r">Vue</th><th class="r">React 19</th><th class="r"></th></tr>
            </thead>
            <tbody>
              <tr v-for="b in bench" :key="b.name" :class="{ hot: b.best }">
                <td>{{ b.name }}</td>
                <td class="r strong" :class="{ best: b.best }">{{ b.p }}</td>
                <td class="r">{{ b.s }}</td>
                <td class="r">{{ b.v }}</td>
                <td class="r">{{ b.r }}</td>
                <td class="r tag">{{ b.note }}</td>
              </tr>
            </tbody>
          </table>
          <p class="px-bench-foot">
            real-app head-to-head: we haven't run it, and we won't claim it
            until we do · <a href="https://github.com/pyreon">methodology</a>
          </p>
        </div>
        <div class="px-claims">
          <div class="px-claim px-claim--ember">
            <div class="px-claim-h">WE WON'T CLAIM</div>
            <div class="px-claim-b">
              "Fastest." Any real-app head-to-head superiority. A compiler-pass
              perf win that's still on the roadmap.
            </div>
          </div>
          <div class="px-claim px-claim--cyan">
            <div class="px-claim-h">WE WILL CLAIM</div>
            <div class="px-claim-b">
              Synthetic co-leader with Solid + Vue. Fastest partial-update and
              create-10k of the four. Decisively ahead of React 19. 55 shipped
              packages.
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 3 · MECHANISM ─────────────────────────────────────────── -->
    <section class="px-sec">
      <div class="px-sec-head"><span class="px-mono-label">02 · mechanism · how it works</span><span class="px-rule" /></div>
      <h2 class="px-h2">Signal reads in. Targeted re-runs out.</h2>
      <p class="px-sub">Four mechanisms, named the way the source code names them.</p>
      <div class="px-grid-4">
        <div v-for="(c, i) in mechanism" :key="c.n" class="px-card px-mcard">
          <div class="px-mcard-head">
            <span class="px-mono-label">{{ c.n }}</span>
            <span class="px-rule" :class="{ 'px-rule--ember': i === 0 }" />
            <span class="px-mono-tag">{{ c.tag }}</span>
          </div>
          <div class="px-mcard-t">{{ c.t }}</div>
          <div class="px-mcard-d">{{ c.d }}</div>
        </div>
      </div>
    </section>

    <!-- ── 4 · COMPAT ────────────────────────────────────────────── -->
    <section class="px-sec">
      <div class="px-sec-head"><span class="px-mono-label">03 · compat · use the api you know</span><span class="px-rule" /></div>
      <h2 class="px-h2">React, Preact, Vue 3, or SolidJS. Pick your dialect.</h2>
      <p class="px-sub">
        Compatibility layers compile each API down to Pyreon signals. Migrate
        one component at a time, or write in whatever your team speaks.
      </p>
      <div class="px-grid-4">
        <div v-for="col in compat" :key="col.lib" class="px-code px-compat">
          <div class="px-compat-h">
            <span>{{ col.lib }}</span><span class="px-mono-label">↻ → signals</span>
          </div>
          <pre><div v-for="(ln, j) in col.lines" :key="j" :class="j === 0 ? 'c-cm' : 'c-fg'">{{ ln }}</div></pre>
        </div>
      </div>
    </section>

    <!-- ── 5 · ZERO ──────────────────────────────────────────────── -->
    <section class="px-sec">
      <div class="px-sec-head"><span class="px-mono-label">04 · zero · full-stack meta-framework</span><span class="px-rule" /></div>
      <h2 class="px-h2">SSR · SSG · ISR · islands · SPA. One config.</h2>
      <p class="px-sub">
        Zero is the meta-framework atop Pyreon: file-system routing, API
        routes, server actions, and every render strategy in one config.
      </p>
      <div class="px-zero-grid">
        <div class="px-code">
          <div class="px-mono-label" style="margin-bottom: 10px">vite.config.ts</div>
          <pre><div><span class="c-kw">import</span> {{ '{ zero }' }} <span class="c-kw">from</span> <span class="c-st">'@pyreon/zero'</span></div><div>&nbsp;</div><div><span class="c-kw">export default</span> {{ '{' }} <span class="c-va">plugins</span>: [<span class="c-fn">zero</span>({{ '{' }}</div><div>&nbsp;&nbsp;<span class="c-va">mode</span>: <span class="c-st">'ssg'</span>, <span class="c-va">ssg</span>: {{ '{' }} <span class="c-va">paths</span>: <span class="c-st">'auto'</span> {{ '}' }},</div><div>&nbsp;&nbsp;<span class="c-va">i18n</span>: {{ '{' }} <span class="c-va">locales</span>: [<span class="c-st">'en'</span>,<span class="c-st">'de'</span>] {{ '}' }},</div><div>&nbsp;&nbsp;<span class="c-va">ai</span>: {{ '{' }} <span class="c-va">mcp</span>: <span class="c-nu">true</span>, <span class="c-va">llmsTxt</span>: <span class="c-nu">true</span> {{ '}' }},</div><div>{{ '}' }})] {{ '}' }}</div></pre>
        </div>
        <div>
          <div class="px-mono-label" style="margin-bottom: 6px">RENDER MODES</div>
          <div v-for="m in renderModes" :key="m.tag" class="px-mode">
            <span class="px-mode-tag">{{ m.tag }}</span><span class="px-mode-d">{{ m.d }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 6 · AI ────────────────────────────────────────────────── -->
    <section class="px-sec">
      <div class="px-sec-head"><span class="px-mono-label">05 · ai · for agents that read source, not guess it</span><span class="px-rule" /></div>
      <h2 class="px-h2">First-class MCP + llms.txt.</h2>
      <p class="px-sub">
        Manifest-driven <code>llms.txt</code> / <code>llms-full.txt</code> plus an
        MCP server exposing typed tools — agents read your actual source.
      </p>
      <div class="px-ai-grid">
        <div class="px-code">
          <div class="px-compat-h"><span>llms.txt · generated</span><span class="px-ok">● manifest-driven</span></div>
          <pre><div class="c-fn"># Pyreon</div><div class="c-cm">&gt; Signal-based UI framework. Fine-grained reactivity, no VDOM.</div><div>&nbsp;</div><div class="c-fn">## Core</div><div>- signal · computed · effect · batch · untrack</div><div>- createStore · createSelector · onCleanup</div><div>&nbsp;</div><div class="c-fn">## Compat</div><div>- react · preact · vue · solid</div></pre>
        </div>
        <div class="px-card">
          <div class="px-compat-h"><span>MCP TOOL CALL</span><span class="pyreon-pill">11 tools</span></div>
          <pre class="px-code" style="border: 0; padding: 0; margin-top: 10px"><div class="px-cyan">→ tool: get_api</div><div class="c-fg">  args: {{ '{ symbol: "signal" }' }}</div><div>&nbsp;</div><div class="px-warm">← result:</div><div class="c-fg">  {{ '{ signature: "signal<T>(v): Signal<T>",' }}</div><div class="c-fg">  {{ '  notes: "callable; .set/.update",' }}</div><div class="c-fg">  {{ '  seeAlso: ["computed","effect"] }' }}</div></pre>
        </div>
      </div>
    </section>

    <!-- ── 7 · ECOSYSTEM ─────────────────────────────────────────── -->
    <section class="px-sec">
      <div class="px-sec-head"><span class="px-mono-label">06 · ecosystem · counted, not exclaimed</span><span class="px-rule" /></div>
      <h2 class="px-h2">55 packages. Routing, forms, data, devtools — already there.</h2>
      <p class="px-sub">
        Everything you'd otherwise stitch together. Every package is
        signal-aware, type-safe, and tree-shakeable.
      </p>
      <div class="px-grid-3">
        <div v-for="g in ecosystem" :key="g.cat" class="px-card px-eco">
          <div class="px-eco-head">
            <span class="px-eco-cat">{{ g.cat }}</span><span class="px-rule" /><span class="px-mono-label">{{ g.items.length }}</span>
          </div>
          <div class="px-eco-items">
            <template v-for="(it, j) in g.items" :key="it"
              ><span class="px-eco-ns">@pyreon/</span><span class="px-eco-it">{{ it }}</span
              ><span v-if="j < g.items.length - 1" class="px-eco-sep"> · </span></template
            >
          </div>
        </div>
      </div>
      <div class="px-eco-total">
        <span>total · <strong>55 packages</strong> · all tree-shakeable</span>
        <a href="/docs/">↗ browse the docs</a>
      </div>
    </section>

    <!-- ── 8 · FOOTER ────────────────────────────────────────────── -->
    <footer class="px-foot">
      <div class="px-foot-grid">
        <div>
          <div class="px-foot-brand">
            <svg width="34" height="34" viewBox="0 0 120 120" fill="none">
              <circle cx="36" cy="64" r="22" fill="var(--text)" />
              <path
                d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86"
                stroke="var(--text)"
                stroke-width="10"
                stroke-linecap="square"
                stroke-linejoin="miter"
                fill="none"
              />
            </svg>
            <span class="px-foot-word">pyreon</span>
          </div>
          <p class="px-foot-tag">
            The signal-based UI framework — fine-grained reactivity,
            full-stack, AI-native.
          </p>
        </div>
        <div v-for="c in footerCols" :key="c.h" class="px-foot-col">
          <div class="px-mono-label">{{ c.h }}</div>
          <a v-for="[label, href] in c.items" :key="label" :href="href" class="px-foot-link">{{ label }}</a>
        </div>
      </div>
      <div class="px-foot-bar">
        <span>© 2026 Pyreon · MIT · forged in prague · eu</span>
        <span class="px-ok">● ci passing</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.px-l {
  font-family: var(--font-sans);
  color: var(--text);
}
.px-sec,
.px-hero {
  max-width: 1180px;
  margin: 0 auto;
  padding: 88px 40px;
}
.px-sec {
  border-top: 1px solid var(--border);
}
.px-sec-head {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 20px;
}
.px-rule {
  flex: 1;
  height: 1px;
  background: var(--border);
}
.px-rule--ember {
  background: var(--ember);
}
.px-mono-label {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--text-dim);
  text-transform: uppercase;
}
.px-mono-tag {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-muted);
}
.px-eyebrow {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin: 0 0 16px;
}
.px-h1 {
  font-weight: 600;
  font-size: clamp(48px, 6vw, 86px);
  letter-spacing: -0.04em;
  line-height: 1;
  margin: 0 0 22px;
  color: var(--text-strong);
}
.px-h2 {
  font-weight: 600;
  font-size: clamp(30px, 3.4vw, 52px);
  letter-spacing: -0.035em;
  line-height: 1.04;
  margin: 0 0 16px;
  max-width: 980px;
  color: var(--text-strong);
}
.px-sub {
  font-size: 17px;
  color: var(--text-muted);
  line-height: 1.55;
  max-width: 760px;
  margin: 0 0 40px;
  text-wrap: pretty;
}
.px-sub code,
.px-honesty code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  color: var(--ember);
}
.px-hero-mark {
  margin-bottom: 24px;
}
.px-hero-grid {
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 60px;
  align-items: center;
}
.px-lede {
  font-size: 20px;
  color: var(--text-muted);
  line-height: 1.5;
  max-width: 540px;
  margin: 0 0 26px;
  text-wrap: pretty;
}
.px-cta {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.px-btn {
  background: var(--text);
  color: var(--bg);
  padding: 12px 20px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}
.px-btn:hover {
  opacity: 0.88;
}
.px-btn-cmd {
  border: 1px solid var(--border);
  color: var(--text);
  padding: 12px 20px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 13px;
}
.px-link-mini {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--link);
}
.px-honesty {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-dim);
  line-height: 1.6;
  max-width: 540px;
  margin: 0;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.px-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 24px;
}
.px-card-head,
.px-compat-h {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  gap: 12px;
}
.px-counter {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 20px;
}
.px-counter-sig {
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text-dim);
}
.px-digit {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 88px;
  letter-spacing: -0.04em;
  line-height: 1;
  color: var(--text);
  animation: px-hero-digit 200ms cubic-bezier(0.2, 0.7, 0.3, 1);
}
@keyframes px-hero-digit {
  0% {
    color: var(--text);
    text-shadow: 0 0 0 transparent;
  }
  40% {
    color: var(--ember);
    text-shadow: 0 0 26px var(--ember-ring);
  }
  100% {
    color: var(--text);
    text-shadow: 0 0 0 transparent;
  }
}
@media (prefers-reduced-motion: reduce) {
  .px-digit {
    animation: none;
  }
}
.px-code {
  background: var(--syn-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 14px 18px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--syn-fg);
  overflow-x: auto;
}
.px-code pre {
  margin: 0;
  font: inherit;
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
.c-st {
  color: var(--syn-string);
}
.c-nu {
  color: var(--syn-number);
}
.c-fn {
  color: var(--syn-fn);
}
.c-va {
  color: var(--syn-variable);
}
.px-cyan {
  color: var(--link);
}
.px-warm {
  color: var(--ember);
}
.px-ok {
  color: var(--ok);
  font-family: var(--font-mono);
  font-size: 11px;
}
.px-demo-note {
  margin: 14px 0 0;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-dim);
  line-height: 1.6;
}
.px-demo .px-code {
  margin-top: 0;
}
.px-bench-wrap {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 32px;
  align-items: flex-start;
}
.px-bench-meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.08em;
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
}
.px-bench th.r,
.px-bench td.r {
  text-align: right;
}
.px-bench td {
  padding: 10px 0;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
}
.px-bench tr.hot {
  background: var(--ember-bg);
}
.px-bench td.strong {
  color: var(--text);
}
.px-bench td.best {
  color: var(--ember);
  font-weight: 600;
}
.px-bench td.tag {
  color: var(--text-dim);
  font-size: 11px;
}
.px-bench-foot {
  margin: 14px 0 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.7;
}
.px-bench-foot a,
.px-eco-total a,
.px-foot-link {
  color: var(--link);
  text-decoration: none;
}
.px-claims {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.px-claim {
  padding: 18px;
  border-radius: 4px;
}
.px-claim--ember {
  background: var(--ember-bg);
  border-left: 2px solid var(--ember);
}
.px-claim--cyan {
  background: var(--link-bg);
  border-left: 2px solid var(--link);
}
.px-claim-h {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  margin-bottom: 6px;
}
.px-claim--ember .px-claim-h {
  color: var(--ember);
}
.px-claim--cyan .px-claim-h {
  color: var(--link);
}
.px-claim-b {
  font-size: 14.5px;
  color: var(--text);
  line-height: 1.55;
}
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
.px-mcard-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.px-mcard-t {
  font-size: 17px;
  font-weight: 500;
  color: var(--text);
  margin-top: 18px;
  letter-spacing: -0.015em;
}
.px-mcard-d {
  font-size: 13.5px;
  color: var(--text-muted);
  margin-top: 8px;
  line-height: 1.55;
}
.px-compat .px-compat-h {
  margin-bottom: 10px;
  font-size: 11px;
  color: var(--syn-fg);
}
.px-zero-grid {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  gap: 28px;
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
  font-size: 13.5px;
  color: var(--text-muted);
  line-height: 1.5;
}
.px-ai-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
.px-eco-head {
  display: flex;
  align-items: baseline;
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
.px-eco-it {
  color: var(--text);
}
.px-eco-sep {
  color: var(--text-hint);
}
.px-eco-total {
  margin-top: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
}
.px-eco-total strong {
  color: var(--text);
}
.px-foot {
  border-top: 1px solid var(--border);
  max-width: 1180px;
  margin: 0 auto;
  padding: 64px 40px 40px;
}
.px-foot-grid {
  display: grid;
  grid-template-columns: 1.4fr repeat(4, 1fr);
  gap: 32px;
  margin-bottom: 44px;
}
.px-foot-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.px-foot-word {
  font-weight: 600;
  font-size: 24px;
  letter-spacing: -0.03em;
  color: var(--text);
}
.px-foot-tag {
  font-size: 13.5px;
  color: var(--text-muted);
  margin-top: 14px;
  line-height: 1.55;
  max-width: 260px;
}
.px-foot-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.px-foot-col .px-mono-label {
  margin-bottom: 4px;
}
.px-foot-link {
  font-size: 13px;
  color: var(--text-muted);
}
.px-foot-link:hover {
  color: var(--link);
}
.px-foot-bar {
  border-top: 1px solid var(--border);
  padding-top: 20px;
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
}

@media (max-width: 960px) {
  .px-hero-grid,
  .px-bench-wrap,
  .px-zero-grid,
  .px-ai-grid {
    grid-template-columns: 1fr;
    gap: 32px;
  }
  .px-grid-4,
  .px-grid-3 {
    grid-template-columns: repeat(2, 1fr);
  }
  .px-foot-grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 560px) {
  .px-grid-4,
  .px-grid-3,
  .px-foot-grid {
    grid-template-columns: 1fr;
  }
}
</style>
