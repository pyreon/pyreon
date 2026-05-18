<!--
  Animated hero lockup — brand handoff §5 + hero-variants 14–17.

  ALL FOUR generated intros ship; one is picked at RANDOM per visit:
    14 · Particles     — discrete signals converge into the disc
    15 · Wavefront     — an ember flamefront sweeps across the glyph
    16 · Pulse cascade — three pulses, each triggers the next stage
    17 · Path-trace    — an ember bead runs a fuse, lighting the glyph

  Progressive enhancement / SSR safety: the *final* state (solid glyph +
  wordmark) is the default render. The random pick + the intro happen
  CLIENT-SIDE after mount, and every variant-specific transient element
  is behind `v-if="playing"` — so server and client render identical
  markup (no hydration mismatch) and SSR / no-JS / reduced-motion show a
  correct static logo. Colour is 100% tokens.css variables (no raw hex),
  so it also flips correctly under the paired light theme.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const N_PATH = 'M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86'
const FUSE = 'M -40 130 L 96 130 L 168 130 L 168 90 L 204 90 L 204 130 L 760 130'

// 8 converging particles for variant 14 (fixed offsets — deterministic).
const PARTICLES = [
  { x: -120, y: -90, s: 6, d: 0 },
  { x: 160, y: -70, s: 4, d: 60 },
  { x: -150, y: 120, s: 5, d: 30 },
  { x: -90, y: 40, s: 4, d: 120 },
  { x: 520, y: -50, s: 4, d: 90 },
  { x: 480, y: 140, s: 3, d: 180 },
  { x: -130, y: -10, s: 5, d: 220 },
  { x: 540, y: 60, s: 4, d: 50 },
]

const root = ref<HTMLElement | null>(null)
const playing = ref(false)
const variant = ref<14 | 15 | 16 | 17 | 0>(0) // 0 = static (SSR / no-JS / reduced-motion)
let io: IntersectionObserver | null = null

onMounted(() => {
  const el = root.value
  if (!el) return
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduce || typeof IntersectionObserver === 'undefined') return // stay static-final

  // Optional override for QA: ?hero=14|15|16|17 — otherwise random per visit.
  const forced = Number(new URLSearchParams(window.location.search).get('hero'))
  const pool = [14, 15, 16, 17] as const
  variant.value = (
    pool.includes(forced as 14) ? forced : pool[Math.floor(Math.random() * pool.length)]
  ) as 14 | 15 | 16 | 17

  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          playing.value = true // one-shot
          io?.disconnect()
          io = null
          break
        }
      }
    },
    { threshold: 0.4 },
  )
  io.observe(el)
})

onBeforeUnmount(() => io?.disconnect())
</script>

<template>
  <div
    ref="root"
    class="px-heromark"
    :class="[playing ? `is-playing is-v${variant}` : '']"
    aria-hidden="true"
  >
    <svg viewBox="0 0 760 200" class="px-heromark-svg" role="img">
      <defs>
        <linearGradient id="px-ember-grad" x1="0" x2="1">
          <stop offset="0" stop-color="var(--ember-plasma)" />
          <stop offset="0.55" stop-color="var(--ember)" />
          <stop offset="1" stop-color="var(--ember-warm)" />
        </linearGradient>
      </defs>

      <!-- 17 · fuse trail + bead (client-only when that variant plays) -->
      <template v-if="playing && variant === 17">
        <path :d="FUSE" class="px-fuse-guide" fill="none" />
        <path :d="FUSE" class="px-fuse-trail" fill="none" stroke-linecap="round" />
        <circle r="6" class="px-fuse-bead" />
      </template>

      <!-- 14 · converging particles -->
      <template v-if="playing && variant === 14">
        <circle
          v-for="(p, i) in PARTICLES"
          :key="i"
          :r="p.s"
          class="px-particle"
          :style="{
            '--fx': p.x + 'px',
            '--fy': p.y + 'px',
            animationDelay: p.d + 'ms',
          }"
        />
      </template>

      <!-- ON glyph -->
      <g class="px-glyph" transform="translate(108 36)">
        <circle cx="36" cy="64" r="22" class="px-disc" />
        <path
          :d="N_PATH"
          class="px-n"
          stroke-width="10"
          stroke-linecap="square"
          stroke-linejoin="miter"
          fill="none"
        />
        <!-- 16 · pulse-cascade glow ring -->
        <circle
          v-if="playing && variant === 16"
          cx="91"
          cy="64"
          r="40"
          class="px-ring"
          fill="none"
        />
      </g>

      <!-- wordmark — "pyre" paper + ember "on" (one ember/page, §2) -->
      <g class="px-wordwrap">
        <text x="250" y="132" class="px-word">
          pyre<tspan class="px-word-on">on</tspan>
        </text>
        <!-- 16 · ember underline flash -->
        <line
          v-if="playing && variant === 16"
          x1="250"
          y1="150"
          x2="600"
          y2="150"
          class="px-underline"
        />
      </g>

      <!-- 15 · wavefront wipe cover + ember sweep bar -->
      <template v-if="playing && variant === 15">
        <rect x="0" y="0" width="780" height="200" class="px-wf-cover" />
        <rect x="0" y="0" width="46" height="200" class="px-wf-bar" />
      </template>
    </svg>
  </div>
</template>

<style scoped>
.px-heromark {
  width: 100%;
  max-width: 520px;
}
.px-heromark-svg {
  width: 100%;
  height: auto;
  display: block;
  overflow: visible;
}

/* ── Final state (SSR / no-JS / reduced-motion / pre-play) ───────────── */
.px-disc {
  fill: var(--ember);
}
.px-n {
  stroke: var(--text);
}
.px-word {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 92px;
  letter-spacing: -0.04em;
  fill: var(--text);
}
.px-word-on {
  fill: var(--ember);
}
.px-fuse-guide {
  stroke: var(--border);
  stroke-width: 1.5;
}
.px-fuse-trail {
  stroke: url(#px-ember-grad);
  stroke-width: 3;
  stroke-dasharray: 900;
  stroke-dashoffset: 0;
}
.px-fuse-bead {
  fill: url(#px-ember-grad);
  opacity: 0;
}
.px-particle {
  fill: url(#px-ember-grad);
  opacity: 0;
}
.px-ring {
  stroke: var(--ember);
  stroke-width: 2;
  opacity: 0;
}
.px-underline {
  stroke: url(#px-ember-grad);
  stroke-width: 3;
  opacity: 0;
}
.px-wf-cover,
.px-wf-bar {
  opacity: 0;
}

/* ── 17 · Path-trace ────────────────────────────────────────────────── */
.is-v17 .px-fuse-trail {
  animation: px-fz-draw 700ms cubic-bezier(0.3, 0.8, 0.2, 1) backwards;
}
.is-v17 .px-fuse-bead {
  offset-path: path('M -40 130 L 96 130 L 168 130 L 168 90 L 204 90 L 204 130 L 760 130');
  animation: px-fz-bead 700ms cubic-bezier(0.3, 0.8, 0.2, 1) backwards;
}
.is-v17 .px-glyph {
  animation: px-fade 240ms 360ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.is-v17 .px-wordwrap {
  animation: px-fade 280ms 640ms ease-out backwards;
}

/* ── 14 · Particles ─────────────────────────────────────────────────── */
.is-v14 .px-particle {
  transform-box: fill-box;
  transform-origin: center;
  animation: px-part 500ms cubic-bezier(0.3, 0.8, 0.2, 1) backwards;
}
.is-v14 .px-glyph {
  transform-box: fill-box;
  transform-origin: center;
  animation: px-pop 240ms 500ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.is-v14 .px-wordwrap {
  animation: px-fade 260ms 760ms ease-out backwards;
}

/* ── 15 · Wavefront ─────────────────────────────────────────────────── */
.is-v15 .px-wf-cover {
  fill: var(--ink-1);
  opacity: 1;
  animation: px-wf-wipe 640ms cubic-bezier(0.4, 0, 0.3, 1) forwards;
}
.is-v15 .px-wf-bar {
  fill: url(#px-ember-grad);
  opacity: 0.9;
  animation: px-wf-sweep 640ms cubic-bezier(0.4, 0, 0.3, 1) forwards;
}

/* ── 16 · Pulse cascade ─────────────────────────────────────────────── */
.is-v16 .px-disc {
  transform-box: fill-box;
  transform-origin: center;
  animation: px-pc-disc 320ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
}
.is-v16 .px-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
  animation: px-pc-n 220ms 320ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.is-v16 .px-ring {
  transform-box: fill-box;
  transform-origin: center;
  animation: px-pc-ring 360ms 320ms ease-out forwards;
}
.is-v16 .px-wordwrap {
  animation: px-fade 280ms 640ms ease-out backwards;
}
.is-v16 .px-underline {
  transform-origin: left center;
  animation: px-pc-under 320ms 640ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}

/* ── Keyframes ──────────────────────────────────────────────────────── */
@keyframes px-fz-draw {
  from {
    stroke-dashoffset: 900;
  }
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes px-fz-bead {
  from {
    offset-distance: 0%;
    opacity: 1;
  }
  99% {
    opacity: 1;
  }
  to {
    offset-distance: 100%;
    opacity: 0;
  }
}
@keyframes px-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes px-part {
  from {
    transform: translate(var(--fx), var(--fy));
    opacity: 0;
  }
  60% {
    opacity: 1;
  }
  to {
    transform: translate(0, 0);
    opacity: 0;
  }
}
@keyframes px-pop {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
  60% {
    transform: scale(1.12);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes px-wf-wipe {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(780px);
  }
}
@keyframes px-wf-sweep {
  from {
    transform: translateX(-60px);
    opacity: 0.9;
  }
  90% {
    opacity: 0.9;
  }
  to {
    transform: translateX(760px);
    opacity: 0;
  }
}
@keyframes px-pc-disc {
  0% {
    transform: scale(0.4);
  }
  55% {
    transform: scale(1.18);
  }
  100% {
    transform: scale(1);
  }
}
@keyframes px-pc-n {
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes px-pc-ring {
  0% {
    transform: scale(0.4);
    opacity: 0.9;
  }
  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}
@keyframes px-pc-under {
  0% {
    transform: scaleX(0);
    opacity: 1;
  }
  100% {
    transform: scaleX(1);
    opacity: 1;
  }
}

/* Hard guarantee — reduced-motion never animates (JS also avoids it). */
@media (prefers-reduced-motion: reduce) {
  .px-heromark * {
    animation: none !important;
  }
  .px-fuse-bead,
  .px-particle,
  .px-ring,
  .px-underline,
  .px-wf-cover,
  .px-wf-bar {
    opacity: 0 !important;
  }
}
</style>
