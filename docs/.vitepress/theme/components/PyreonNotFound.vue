<!--
  Branded 404 — brand handoff §6.1 + illustrations Illo-02
  ("signal not found"). Schematic source → missing? → caller graph,
  ember "?" node, mono "the path you asked for has no readers" copy.

  100% semantic tokens (light + dark correct). Reduced-motion safe —
  the only motion is the ember "?" pulse, gated.
-->
<script setup lang="ts">
import { withBase } from 'vitepress'
</script>

<template>
  <div class="px-nf">
    <p class="pyreon-eyebrow">404 · signal not found</p>

    <svg class="px-nf-graph" viewBox="0 0 280 120" fill="none" aria-hidden="true">
      <!-- source node + live edge -->
      <circle cx="32" cy="60" r="5" class="px-nf-src" />
      <line x1="38" y1="60" x2="104" y2="60" class="px-nf-edge-live" />
      <!-- broken span -->
      <line x1="104" y1="60" x2="156" y2="60" class="px-nf-edge-break" />
      <!-- missing target -->
      <circle cx="130" cy="60" r="13" class="px-nf-miss-ring" />
      <text x="130" y="65" text-anchor="middle" class="px-nf-q">?</text>
      <!-- cold tail to caller -->
      <line x1="156" y1="60" x2="242" y2="60" class="px-nf-edge-cold" />
      <circle cx="248" cy="60" r="5" class="px-nf-caller" />
      <!-- labels -->
      <text x="32" y="88" text-anchor="middle" class="px-nf-lbl">source</text>
      <text x="130" y="30" text-anchor="middle" class="px-nf-lbl px-nf-lbl--ember">missing</text>
      <text x="248" y="88" text-anchor="middle" class="px-nf-lbl px-nf-lbl--dim">caller</text>
    </svg>

    <h1 class="px-nf-h1">This path has no readers.</h1>
    <p class="px-nf-body">
      The page you asked for either was never defined, or this route
      doesn't subscribe to it. Check the spelling, the imports, the scope.
    </p>
    <div class="px-nf-cta">
      <a class="px-nf-btn" :href="withBase('/docs/')">↗ docs index</a>
      <a class="px-nf-link" :href="withBase('/')">back to home</a>
    </div>
  </div>
</template>

<style scoped>
.px-nf {
  max-width: 560px;
  margin: 0 auto;
  padding: 12vh 24px 16vh;
  text-align: center;
}
.px-nf-graph {
  width: 100%;
  max-width: 360px;
  height: auto;
  margin: 14px auto 28px;
  display: block;
}
.px-nf-src,
.px-nf-caller {
  stroke-width: 1.5;
  fill: none;
}
.px-nf-src {
  fill: var(--text-muted);
  stroke: none;
}
.px-nf-caller {
  stroke: var(--text-hint);
}
.px-nf-edge-live {
  stroke: var(--text-muted);
  stroke-width: 1.5;
}
.px-nf-edge-break {
  stroke: var(--ember);
  stroke-width: 1.5;
  stroke-dasharray: 2 4;
}
.px-nf-edge-cold {
  stroke: var(--text-hint);
  stroke-width: 1.5;
  stroke-dasharray: 3 6;
}
.px-nf-miss-ring {
  stroke: var(--ember);
  stroke-width: 1.5;
  stroke-dasharray: 3 4;
  fill: none;
  transform-box: fill-box;
  transform-origin: center;
  animation: px-nf-pulse 2s ease-out infinite;
}
.px-nf-q {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  fill: var(--ember);
}
.px-nf-lbl {
  font-family: var(--font-mono);
  font-size: 9px;
  fill: var(--text-dim);
}
.px-nf-lbl--ember {
  fill: var(--ember);
}
.px-nf-lbl--dim {
  fill: var(--text-hint);
}
.px-nf-h1 {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(28px, 5vw, 40px);
  letter-spacing: -0.03em;
  color: var(--text);
  margin: 0 0 12px;
  border: 0;
}
.px-nf-body {
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
  line-height: 1.6;
  margin: 0 auto 28px;
  max-width: 440px;
  text-wrap: pretty;
}
.px-nf-cta {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: center;
}
.px-nf-btn {
  background: var(--text);
  color: var(--bg);
  padding: 10px 18px;
  border-radius: 4px;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}
.px-nf-link {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--link);
  text-decoration: none;
  border-bottom: 1px solid var(--link);
}
@keyframes px-nf-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
@media (prefers-reduced-motion: reduce) {
  .px-nf-miss-ring {
    animation: none;
  }
}
</style>
