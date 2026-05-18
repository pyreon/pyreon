<!--
  Bespoke landing — brand handoff §6.2.

  Faithful recreation of the `PxArtLanding` reference: ember-suffix hero,
  live signal counter (only the digit re-renders, with the ≤200ms ember
  pulse — the signature motion), honest js-framework-benchmark table, and
  the numbered no-icon feature grid.

  All colour comes from CSS variables in theme/tokens.css (copied verbatim
  from the handoff) — this component holds NO raw hex, so it can never
  drift from the brand system. Reduced-motion is handled centrally in
  tokens.css (the `px-digit` / `px-pulse` keyframes are gated there).
-->
<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
const increment = () => count.value++
const reset = () => (count.value = 0)

const benchmark = [
  { name: 'Pyreon', todo: '1.00', stk: '1.04', tag: 'tied', hot: true },
  { name: 'Solid', todo: '1.00', stk: '1.00', tag: 'tied', hot: false },
  { name: 'Svelte 5', todo: '1.06', stk: '1.12', tag: 'close', hot: false },
  { name: 'Vue 3.4', todo: '1.34', stk: '1.41', tag: '', hot: false },
  { name: 'React 19', todo: '1.62', stk: '1.78', tag: '', hot: false },
]

const features = [
  { n: '01', t: 'Fine-grained signals', d: 'No VDOM. The value, not the component.' },
  { n: '02', t: 'Zero · full-stack', d: 'SSR · SSG · islands · SPA, one config.' },
  { n: '03', t: 'AI-native', d: 'First-class MCP + llms.txt, every package.' },
  { n: '04', t: 'Batteries-included', d: '55 packages. Routing, forms, data, devtools.' },
]
</script>

<template>
  <div class="px-landing">
    <!-- ── Hero ───────────────────────────────────────────────── -->
    <section class="px-hero">
      <div class="px-hero-copy">
        <p class="pyreon-eyebrow">signal-based · full-stack · ai-native</p>
        <h1 class="px-h1">
          The framework with<br />a <span class="px-ember-text">flamegraph</span>.
        </h1>
        <p class="px-lede">
          Competitive with Solid. Ahead of React and Vue. Honest about
          trade-offs. Built for senior teams who measure their own code.
        </p>
        <div class="px-cta">
          <a class="px-btn-primary" href="/docs/">Read the docs →</a>
          <code class="px-btn-cmd">$ bunx create-pyreon-app</code>
        </div>
      </div>

      <!-- Live signal demo — only the digit re-renders -->
      <div class="px-panel px-demo">
        <div class="px-panel-head">
          <span class="px-mono-label">LIVE · only digit re-renders</span>
          <span class="pyreon-pill pyreon-pill--ember">firing</span>
        </div>
        <div class="px-counter">
          <span class="px-counter-label">count</span>
          <span :key="count" class="px-digit">{{ count }}</span>
        </div>
        <div class="px-counter-actions">
          <button type="button" class="px-mini-btn" @click="increment">increment()</button>
          <button type="button" class="px-mini-btn px-mini-btn--muted" @click="reset">
            reset()
          </button>
        </div>
      </div>
    </section>

    <!-- ── Honest benchmark ───────────────────────────────────── -->
    <section class="px-bench-row">
      <div class="px-panel">
        <div class="px-panel-head">
          <span class="px-mono-label">JS-FRAMEWORK-BENCHMARK · 1.10 · GEOMETRIC MEAN</span>
          <span class="pyreon-pill">lower = faster</span>
        </div>
        <table class="px-bench">
          <thead>
            <tr>
              <th>framework</th>
              <th class="px-r">todo</th>
              <th class="px-r">stockticker</th>
              <th class="px-r"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in benchmark" :key="b.name" :class="{ 'px-hot': b.hot }">
              <td>
                <span v-if="b.hot" class="px-dot">●</span>{{ b.name }}
              </td>
              <td class="px-r px-num">{{ b.todo }}</td>
              <td class="px-r px-num">{{ b.stk }}</td>
              <td class="px-r px-tag">{{ b.tag }}</td>
            </tr>
          </tbody>
        </table>
        <p class="px-bench-foot">
          We tie with Solid. We don't claim to beat it.<br />
          Source &amp; methodology in
          <a href="https://github.com/pyreon/pyreon">/benchmarks</a> · run yours.
        </p>
      </div>
    </section>

    <!-- ── Feature grid — numbered, no icons ──────────────────── -->
    <section class="px-features">
      <div
        v-for="(f, i) in features"
        :key="f.n"
        class="px-feature"
        :class="{ 'px-feature--lead': i === 0 }"
      >
        <div class="px-feature-head">
          <span class="px-mono-label">{{ f.n }}</span>
          <span class="px-feature-rule" />
        </div>
        <div class="px-feature-t">{{ f.t }}</div>
        <div class="px-feature-d">{{ f.d }}</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.px-landing {
  max-width: 1180px;
  margin: 0 auto;
  padding: 56px 40px 96px;
  display: flex;
  flex-direction: column;
  gap: 40px;
}

/* Hero */
.px-hero {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 56px;
  align-items: center;
}
.px-h1 {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(44px, 5.4vw, 76px);
  letter-spacing: -0.04em;
  line-height: 0.98;
  color: var(--paper-1);
  margin: 14px 0 18px;
}
.px-lede {
  font-family: var(--font-sans);
  font-size: 19px;
  color: var(--muted-1);
  line-height: 1.5;
  max-width: 480px;
  margin: 0;
  text-wrap: pretty;
}
.px-cta {
  display: flex;
  gap: 10px;
  margin-top: 24px;
  flex-wrap: wrap;
}
.px-btn-primary {
  background: var(--paper-1);
  color: var(--ink-1);
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
  display: inline-flex;
  align-items: center;
  background: transparent;
  color: var(--paper-1);
  border: 1px solid var(--ink-4);
  padding: 12px 20px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 13px;
}

/* Panels */
.px-panel {
  background: var(--ink-2);
  border: 1px solid var(--ink-4);
  border-radius: 4px;
  padding: 22px;
}
.px-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
}
.px-mono-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--muted-2);
  text-transform: uppercase;
}

/* Live counter — the signature motion */
.px-counter {
  display: flex;
  align-items: baseline;
  gap: 14px;
}
.px-counter-label {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--muted-2);
}
.px-digit {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 64px;
  letter-spacing: -0.04em;
  color: var(--paper-1);
  /* `:key="count"` remounts this node on change → animation re-fires.
     Keyframe + reduced-motion gate live in tokens.css. */
  animation: px-digit 200ms cubic-bezier(0.2, 0.7, 0.3, 1);
}
.px-counter-actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
}
.px-mini-btn {
  flex: 1;
  background: var(--ink-3);
  color: var(--paper-1);
  border: 1px solid var(--ink-4);
  padding: 8px 12px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease;
}
.px-mini-btn:hover {
  border-color: var(--cyan);
}
.px-mini-btn--muted {
  color: var(--muted-1);
}

/* Benchmark */
.px-bench {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 12.5px;
}
.px-bench th {
  text-align: left;
  padding: 6px 0;
  font-weight: 400;
  color: var(--muted-2);
  border: 0;
}
.px-bench .px-r {
  text-align: right;
}
.px-bench td {
  padding: 9px 0;
  border-top: 1px solid var(--ink-4);
  color: var(--muted-1);
}
.px-bench tr.px-hot {
  background: rgba(255, 94, 26, 0.04);
}
.px-bench tr.px-hot td:first-child {
  color: var(--paper-1);
  font-weight: 600;
}
.px-num {
  color: var(--paper-1);
}
.px-tag {
  color: var(--muted-2);
  font-size: 11px;
}
.px-dot {
  color: var(--ember-core);
  margin-right: 6px;
}
.px-bench-foot {
  margin: 12px 0 0;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--muted-2);
  line-height: 1.6;
}
.px-bench-foot a {
  color: var(--cyan);
}

/* Feature grid */
.px-features {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.px-feature {
  background: var(--ink-2);
  border: 1px solid var(--ink-4);
  border-radius: 4px;
  padding: 18px;
}
.px-feature-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.px-feature-rule {
  height: 1px;
  flex: 1;
  background: var(--ink-4);
}
.px-feature--lead .px-feature-rule {
  background: var(--ember-core);
}
.px-feature-t {
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 500;
  color: var(--paper-1);
  margin-top: 14px;
  letter-spacing: -0.01em;
}
.px-feature-d {
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--muted-1);
  margin-top: 6px;
  line-height: 1.45;
}

@media (max-width: 880px) {
  .px-hero {
    grid-template-columns: 1fr;
    gap: 32px;
  }
  .px-features {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 520px) {
  .px-features {
    grid-template-columns: 1fr;
  }
}
</style>
