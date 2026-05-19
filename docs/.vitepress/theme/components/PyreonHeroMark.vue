<!--
  Animated hero lockup — brand handoff §5 + pyreon-motion-hero.jsx
  (canonical HeroTrace) + hero-variants 14–17.

  ELEVEN generated intros ship; one is picked at RANDOM per visit:
    12 · Trace         — graph edges converge, ignite, n, wordmark, fire→
    14 · Particles     — discrete signals converge into the disc
    15 · Wavefront     — an ember flamefront sweeps across the glyph
    16 · Pulse cascade — three pulses, each triggers the next stage
    17 · Path-trace    — an ember bead runs a fuse, lighting the glyph
    18 · Terminal      — cursor types the wordmark, glyph fires on n
    19 · Rings         — disc emerges from expanding concentric rings
    20 · Orbit         — particles orbit, then snap inward
    21 · RGB-split     — channels offset, snap into register
    22 · Spotlight     — a dim ring contracts, intensifies onto the disc
    23 · ECG sweep     — a vertical scan; each element flashes as crossed

  Reduced-motion is not just "freeze": per pyreon-motion-hero.jsx's
  PxArtHeroReduced, the static end-state shows a 2px ember underline
  beneath the wordmark — the "something just fired" signal still reads.

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

// `noMotion`: render the static final lockup only — no IntersectionObserver,
// no random variant, no transient overlay elements. Used by the footer
// (the design's PxLandFooter is a static mark, not an animated intro).
const props = defineProps<{ noMotion?: boolean }>()

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

// Variant 12 (canonical HeroTrace) — signal-graph edges converging on
// the o-disc centre (≈144,100 in this 760×200 stage), staggered draw.
const EDGES = [
  { x: 4, y: 24, d: 0 },
  { x: 22, y: 184, d: 40 },
  { x: 4, y: 110, d: 80 },
  { x: 70, y: 8, d: 120 },
]

// Variant 19 ring delays / 20 orbiters (8) — deterministic.
const RINGS = [0, 80, 160, 240]
const ORBITERS = Array.from({ length: 8 }, (_, i) => ({
  a: (i / 8) * 360,
  d: i * 25,
}))

type V = 12 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23
const POOL = [12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] as const

const root = ref<HTMLElement | null>(null)
const playing = ref(false)
const variant = ref<V | 0>(0) // 0 = static (SSR / no-JS / reduced-motion)
let io: IntersectionObserver | null = null

onMounted(() => {
  if (props.noMotion) return // stay static-final (footer)
  const el = root.value
  if (!el) return
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduce || typeof IntersectionObserver === 'undefined') return // stay static-final

  // Optional override for QA: ?hero=12|14..23 — otherwise random per visit.
  const forced = Number(new URLSearchParams(window.location.search).get('hero'))
  variant.value = (
    POOL.includes(forced as V) ? forced : POOL[Math.floor(Math.random() * POOL.length)]
  ) as V

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
        <!-- 22 · spotlight (ember, fades to transparent) -->
        <radialGradient id="px-spot-grad" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="var(--ember)" stop-opacity="0.5" />
          <stop offset="1" stop-color="var(--ember)" stop-opacity="0" />
        </radialGradient>
        <!-- 23 · ECG scan bar (cyan/link, soft vertical edge) -->
        <linearGradient id="px-scan-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="var(--link)" stop-opacity="0" />
          <stop offset="0.5" stop-color="var(--link)" stop-opacity="0.7" />
          <stop offset="1" stop-color="var(--link)" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- 12 · canonical Trace — graph edges converge + continuation -->
      <template v-if="playing && variant === 12">
        <line
          v-for="(e, i) in EDGES"
          :key="i"
          :x1="e.x"
          :y1="e.y"
          x2="144"
          y2="100"
          class="px-edge"
          :style="{ animationDelay: e.d + 'ms' }"
        />
        <line x1="144" y1="100" x2="752" y2="86" class="px-edge px-edge--cont" />
        <g class="px-trace-cap">
          <circle cx="748" cy="86" r="4" class="px-cap-dot" />
          <text x="690" y="70" class="px-cap-txt">fire →</text>
        </g>
      </template>

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

      <!-- 18 · terminal type-on (prompt + walking cursor) -->
      <template v-if="playing && variant === 18">
        <text x="206" y="126" class="px-term-prompt">$</text>
        <rect class="px-term-cursor" y="62" width="4" height="76" />
      </template>

      <!-- 19 · concentric rings -->
      <template v-if="playing && variant === 19">
        <circle
          v-for="(d, i) in RINGS"
          :key="i"
          cx="144"
          cy="100"
          r="20"
          class="px-ring19"
          fill="none"
          :style="{ animationDelay: d + 'ms' }"
        />
      </template>

      <!-- 20 · orbit collapse -->
      <template v-if="playing && variant === 20">
        <circle
          v-for="(o, i) in ORBITERS"
          :key="i"
          cx="144"
          cy="100"
          r="4"
          class="px-orbiter"
          :style="{ '--sa': o.a + 'deg', animationDelay: o.d + 'ms' }"
        />
      </template>

      <!-- 21 · RGB-split resolve (3 drifting channel copies) -->
      <template v-if="playing && variant === 21">
        <g class="px-chan">
          <text x="250" y="132" class="px-chan-a">pyreon</text>
          <text x="250" y="132" class="px-chan-b">pyreon</text>
          <text x="250" y="132" class="px-chan-c">pyreon</text>
        </g>
      </template>

      <!-- 22 · spotlight focus -->
      <template v-if="playing && variant === 22">
        <circle cx="144" cy="100" r="300" class="px-spot" />
      </template>

      <!-- 23 · ECG sync sweep (baseline + scanning bar) -->
      <template v-if="playing && variant === 23">
        <path
          d="M0 100 L300 100 L320 80 L340 120 L360 100 L760 100"
          class="px-ecg-base"
          fill="none"
        />
        <rect class="px-scan" y="0" width="6" height="200" />
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
        <!-- reduced-motion "fired" cue — static 2px ember underline,
             shown ONLY when motion is suppressed (per PxArtHeroReduced) -->
        <line x1="250" y1="150" x2="600" y2="150" class="px-fired" />
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
.px-edge {
  stroke: url(#px-ember-grad);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-dasharray: 320;
  stroke-dashoffset: 320;
  opacity: 0;
}
.px-edge--cont {
  stroke-width: 2;
  stroke-dasharray: 620;
  stroke-dashoffset: 620;
}
.px-trace-cap {
  opacity: 0;
}
.px-cap-dot {
  fill: var(--ember-warm);
}
.px-cap-txt {
  font-family: var(--font-mono);
  font-size: 13px;
  fill: var(--text-dim);
  letter-spacing: 0.6px;
}
/* reduced-motion "fired" cue — hidden unless motion is suppressed */
.px-fired {
  stroke: url(#px-ember-grad);
  stroke-width: 2;
  opacity: 0;
}

/* ── 12 · Trace (canonical · pyreon-motion-hero.jsx) ─────────────────── */
.is-v12 .px-edge {
  opacity: 1;
  animation: px-edge-draw 360ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.is-v12 .px-edge--cont {
  animation: px-edge-draw 380ms 760ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.is-v12 .px-disc {
  transform-box: fill-box;
  transform-origin: center;
  animation: px-pc-disc 280ms 380ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.is-v12 .px-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
  animation: px-pc-n 340ms 580ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.is-v12 .px-wordwrap {
  animation: px-fade 280ms 880ms ease-out backwards;
}
.is-v12 .px-trace-cap {
  animation: px-fade 240ms 1040ms ease-out forwards;
}

/* ── 18 · Terminal type-on ──────────────────────────────────────────── */
.px-term-prompt {
  font-family: var(--font-mono);
  font-size: 30px;
  fill: var(--link);
}
.px-term-cursor {
  fill: var(--ember);
}
.is-v18 .px-word {
  clip-path: inset(0 100% 0 0);
  animation: px-type 700ms cubic-bezier(0.5, 0, 0.3, 1) forwards;
}
.is-v18 .px-term-cursor {
  animation:
    px-cursor 700ms cubic-bezier(0.5, 0, 0.3, 1) forwards,
    px-blink 0.9s steps(1) infinite;
}
.is-v18 .px-glyph {
  animation: px-pop 240ms 720ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}

/* ── 19 · Concentric rings ──────────────────────────────────────────── */
.px-ring19 {
  stroke: url(#px-ember-grad);
  stroke-width: 2;
  opacity: 0;
}
.is-v19 .px-ring19 {
  animation: px-ring 700ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.is-v19 .px-disc {
  transform-box: fill-box;
  transform-origin: center;
  animation: px-rise 300ms 300ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.is-v19 .px-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
  animation: px-pc-n 280ms 550ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.is-v19 .px-wordwrap {
  animation: px-fade 280ms 760ms ease-out backwards;
}

/* ── 20 · Orbit collapse ────────────────────────────────────────────── */
.px-orbiter {
  fill: var(--link);
  transform-box: view-box;
  transform-origin: 144px 100px;
}
.is-v20 .px-orbiter {
  animation:
    px-orbit 500ms cubic-bezier(0.5, 0, 0.4, 1) forwards,
    px-snap 240ms 500ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.is-v20 .px-disc {
  transform-box: fill-box;
  transform-origin: center;
  animation: px-rise 200ms 580ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.is-v20 .px-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
  animation: px-pc-n 240ms 660ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.is-v20 .px-wordwrap {
  animation: px-fade 280ms 820ms ease-out backwards;
}

/* ── 21 · RGB-split resolve ─────────────────────────────────────────── */
.px-chan {
  mix-blend-mode: screen;
}
.px-chan-a,
.px-chan-b,
.px-chan-c {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 92px;
  letter-spacing: -0.04em;
}
.px-chan-a {
  fill: var(--ember-plasma);
}
.px-chan-b {
  fill: var(--link);
}
.px-chan-c {
  fill: var(--ember-warm);
}
.is-v21 .px-chan-a {
  animation: px-chan-a 1000ms cubic-bezier(0.5, 0, 0.2, 1) both;
}
.is-v21 .px-chan-b {
  animation: px-chan-b 1000ms cubic-bezier(0.5, 0, 0.2, 1) both;
}
.is-v21 .px-chan-c {
  animation: px-chan-c 1000ms cubic-bezier(0.5, 0, 0.2, 1) both;
}
.is-v21 .px-wordwrap {
  animation: px-fade 220ms 760ms ease-out backwards;
}
.is-v21 .px-glyph {
  animation: px-pop 280ms 880ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}

/* ── 22 · Spotlight focus ───────────────────────────────────────────── */
.px-spot {
  fill: url(#px-spot-grad);
  transform-box: view-box;
  transform-origin: 144px 100px;
}
.is-v22 .px-spot {
  animation: px-spot 600ms cubic-bezier(0.4, 0, 0.3, 1) forwards;
}
.is-v22 .px-disc {
  transform-box: fill-box;
  transform-origin: center;
  animation: px-rise 240ms 580ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.is-v22 .px-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
  animation: px-pc-n 260ms 700ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.is-v22 .px-wordwrap {
  animation: px-fade 260ms 820ms ease-out backwards;
}

/* ── 23 · ECG sync sweep ────────────────────────────────────────────── */
.px-ecg-base {
  stroke: var(--border);
  stroke-width: 1.5;
}
.px-scan {
  fill: url(#px-scan-grad);
}
.is-v23 .px-scan {
  animation: px-scan 900ms cubic-bezier(0.5, 0, 0.3, 1) forwards;
}
.is-v23 .px-disc {
  opacity: 0;
  animation: px-fade 200ms 280ms ease-out forwards;
}
.is-v23 .px-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
  animation: px-pc-n 240ms 460ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.is-v23 .px-wordwrap {
  animation: px-fade 240ms 720ms ease-out backwards;
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
  fill: var(--bg); /* semantic page bg — flips for light (was raw --ink-1) */
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
    transform: scale(0.82);
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
    opacity: 0;
    transform: scale(0.82);
  }
  100% {
    opacity: 1;
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
@keyframes px-edge-draw {
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes px-rise {
  from {
    opacity: 0;
    transform: scale(0.82);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes px-type {
  to {
    clip-path: inset(0 0 0 0);
  }
}
@keyframes px-cursor {
  from {
    transform: translateX(250px);
  }
  to {
    transform: translateX(706px);
  }
}
@keyframes px-blink {
  50% {
    opacity: 0;
  }
}
@keyframes px-ring {
  0% {
    r: 20;
    opacity: 1;
    stroke-width: 2.5;
  }
  60% {
    opacity: 0.8;
  }
  100% {
    r: 200;
    opacity: 0;
    stroke-width: 0.5;
  }
}
@keyframes px-orbit {
  from {
    transform: rotate(var(--sa)) translateX(70px);
  }
  to {
    transform: rotate(calc(var(--sa) + 540deg)) translateX(70px);
  }
}
@keyframes px-snap {
  from {
    transform: rotate(calc(var(--sa) + 540deg)) translateX(70px);
    fill: var(--link);
    opacity: 1;
  }
  to {
    transform: rotate(calc(var(--sa) + 540deg)) translateX(0);
    fill: var(--ember);
    opacity: 0;
  }
}
@keyframes px-chan-a {
  0% {
    transform: translate(-18px, -4px);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  70% {
    transform: translate(-22px, -3px);
    opacity: 1;
  }
  85% {
    transform: translate(0, 0);
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes px-chan-b {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  70% {
    transform: translate(2px, 4px);
    opacity: 1;
  }
  85% {
    transform: translate(0, 0);
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes px-chan-c {
  0% {
    transform: translate(18px, 4px);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  70% {
    transform: translate(20px, 5px);
    opacity: 1;
  }
  85% {
    transform: translate(0, 0);
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes px-spot {
  from {
    transform: scale(2);
    opacity: 0.6;
  }
  to {
    transform: scale(0.4);
    opacity: 1;
  }
}
@keyframes px-scan {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(760px);
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
  .px-wf-bar,
  .px-edge,
  .px-trace-cap,
  .px-term-cursor,
  .px-term-prompt,
  .px-ring19,
  .px-orbiter,
  .px-chan,
  .px-spot,
  .px-scan,
  .px-ecg-base {
    opacity: 0 !important;
  }
  /* v18 clips the wordmark while typing — undo so it stays readable */
  .is-v18 .px-word {
    clip-path: none;
  }
  /* ...but DO show the static "fired" underline (PxArtHeroReduced) */
  .px-fired {
    opacity: 1 !important;
  }
}
</style>
