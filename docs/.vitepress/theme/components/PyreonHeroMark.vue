<!--
  Animated hero lockup — faithful port of the brand handoff's canonical
  reference implementation: design_handoff_pyreon_brand/hero-animations.html.

  ELEVEN production hero-entry variants ship; one is picked at RANDOM per
  visit (every variant gets shown over repeat visits):

    trace      — signal-graph edges trace in, disc ignites, n strokes, word
    pulse      — three-beat cascade: disc · n + glow ring · word + underline
    wave       — an ember wavefront sweeps L→R revealing the hot composition
    particles  — 8 ember particles fly in, the disc materializes on arrival
    fuse       — a single ember bead runs a polyline fuse, lighting the glyph
    term       — a mono `$ pyr show-mark` types on; the lockup fires after
    rings      — 4 concentric rings expand; the glyph solidifies at max r
    orbit      — 8 cyan particles orbit 1.5 turns then snap inward as ember
    split      — three colored wordmark ghosts split, register, then resolve
    spot       — a dim warm radial contracts to a focal point, igniting disc
    ecg        — a vertical cyan scan runs L→R; each layer fills as crossed

  This is the handoff's *state machine, not JS animation* contract (README
  §5 / hero-animations.html):
    · Every variant is gated by `data-state="entering"` on the root.
    · Default (no data-state) = static resting frame — SSR / JS-disabled
      safe, zero hydration mismatch (server and first client render are
      byte-identical: variant defaults to `trace`, no data-state).
    · Trigger once on first paint via requestAnimationFrame, OR via an
      IntersectionObserver (threshold .25, unobserve-after-first) for the
      below-the-fold case. NEVER loops. NO replay-on-click in production.
    · Reduced-motion is built into the CSS: a universal
      `@media (prefers-reduced-motion: reduce)` block snaps every variant
      to its end-state with no animation. Nothing extra shipped.

  The random variant pick happens CLIENT-SIDE after mount (SSG can't do
  per-visit random). The initial render — server and first client paint —
  is always `trace` with no `data-state`, so hydration matches exactly;
  Vue then patches to the chosen variant + sets `data-state` post-mount.

  Theme: colours are the handoff's exact ember/paper/ink/cyan hex with the
  handoff's `[data-theme="light"]` attribute-rewrite overrides (rebased
  onto the docs' `<html data-theme="light">` root, which tokens.css and
  the FOUC script already drive). Dark is the default; light flips with
  no markup changes.

  `noMotion`: render the static resting lockup only — no observer, no
  random pick, no entering state. Used by the footer (a static mark, not
  an animated intro).
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ noMotion?: boolean }>()

const VARIANTS = [
  'trace',
  'pulse',
  'wave',
  'particles',
  'fuse',
  'term',
  'rings',
  'orbit',
  'split',
  'spot',
  'ecg',
] as const
type Variant = (typeof VARIANTS)[number]

const root = ref<HTMLElement | null>(null)
// SSR + first client render = 'trace', no data-state → identical markup,
// no hydration mismatch. Swapped to a random variant after mount.
const variant = ref<Variant>('trace')
const entering = ref(false)
let io: IntersectionObserver | null = null

onMounted(() => {
  if (props.noMotion) return // static resting lockup (footer)
  const el = root.value
  if (!el) return
  if (typeof window === 'undefined') return

  // Optional QA override: ?hero=trace|pulse|… — otherwise random per visit.
  const forced = new URLSearchParams(window.location.search).get('hero')
  variant.value = (VARIANTS as readonly string[]).includes(forced ?? '')
    ? (forced as Variant)
    : VARIANTS[Math.floor(Math.random() * VARIANTS.length)]

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduce) {
    // CSS @media snaps to end-state; still set entering so the resting
    // (pre-animation) defaults don't show through.
    entering.value = true
    return
  }

  const trigger = () => {
    if (entering.value) return
    // requestAnimationFrame so the browser observes the off→on transition.
    requestAnimationFrame(() => {
      entering.value = true
    })
  }

  if (typeof IntersectionObserver === 'undefined') {
    trigger() // first-paint fallback
    return
  }
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          trigger()
          io?.disconnect()
          io = null
          break
        }
      }
    },
    { threshold: 0.25 },
  )
  io.observe(el)
})

onBeforeUnmount(() => {
  io?.disconnect()
  io = null
})
</script>

<template>
  <div
    ref="root"
    class="px-heromark"
    :data-variant="variant"
    :data-state="entering ? 'entering' : null"
    aria-hidden="true"
  >
    <!-- 01 · Stroke-trace · canonical -->
    <svg
      v-if="variant === 'trace'"
      viewBox="0 0 720 360"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="pyr-ember" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#FF1F8C" />
          <stop offset=".55" stop-color="#FF5E1A" />
          <stop offset="1" stop-color="#FFC83D" />
        </linearGradient>
      </defs>
      <g class="pyr-grid">
        <line x1="0" y1="48" x2="720" y2="48" /><line x1="0" y1="76" x2="720" y2="76" />
        <line x1="0" y1="104" x2="720" y2="104" /><line x1="0" y1="132" x2="720" y2="132" />
        <line x1="0" y1="160" x2="720" y2="160" /><line x1="0" y1="188" x2="720" y2="188" />
        <line x1="0" y1="216" x2="720" y2="216" /><line x1="0" y1="244" x2="720" y2="244" />
        <line x1="0" y1="272" x2="720" y2="272" /><line x1="0" y1="300" x2="720" y2="300" />
      </g>
      <line class="pyr-trace-edge" x1="30" y1="90" x2="210" y2="200" stroke="url(#pyr-ember)" stroke-width="1.5" stroke-dasharray="320" stroke-linecap="round" style="--d:0ms" />
      <line class="pyr-trace-edge" x1="60" y1="280" x2="210" y2="200" stroke="url(#pyr-ember)" stroke-width="1.5" stroke-dasharray="320" stroke-linecap="round" style="--d:40ms" />
      <line class="pyr-trace-edge" x1="30" y1="200" x2="210" y2="200" stroke="url(#pyr-ember)" stroke-width="1.5" stroke-dasharray="320" stroke-linecap="round" style="--d:80ms" />
      <line class="pyr-trace-edge" x1="90" y1="40" x2="210" y2="200" stroke="url(#pyr-ember)" stroke-width="1.5" stroke-dasharray="320" stroke-linecap="round" style="--d:120ms" />
      <line class="pyr-trace-edge" x1="210" y1="200" x2="690" y2="180" stroke="url(#pyr-ember)" stroke-width="2" stroke-dasharray="500" stroke-linecap="round" style="--d:760ms; animation-duration:380ms" />
      <g transform="translate(138 72) scale(2)">
        <g style="transform-origin: 36px 64px" class="pyr-trace-disc">
          <circle class="pyr-disc" cx="36" cy="64" r="22" />
        </g>
        <path class="pyr-n pyr-trace-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" />
      </g>
      <text class="pyr-word pyr-trace-word" x="405" y="230">pyreon</text>
    </svg>

    <!-- 02 · Pulse cascade -->
    <svg
      v-else-if="variant === 'pulse'"
      viewBox="0 0 720 360"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="pyr-ember-2" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" />
          <stop offset=".55" stop-color="#FF5E1A" />
          <stop offset="1" stop-color="#FFC83D" />
        </linearGradient>
      </defs>
      <g transform="translate(138 72) scale(2)">
        <g style="transform-origin: 36px 64px" class="pyr-pulse-disc">
          <circle cx="36" cy="64" r="22" fill="url(#pyr-ember-2)" />
        </g>
        <path class="pyr-n pyr-pulse-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" />
        <circle class="pyr-pulse-ring" cx="91" cy="64" r="40" fill="none" stroke="#FF5E1A" stroke-width="2" style="transform-origin:91px 64px" />
      </g>
      <g class="pyr-pulse-word">
        <text class="pyr-word" x="405" y="230">pyreon</text>
        <line class="pyr-pulse-under" x1="405" y1="248" x2="700" y2="248" stroke="url(#pyr-ember-2)" stroke-width="3" style="transform-origin:405px 248px" />
      </g>
    </svg>

    <!-- 03 · Wavefront sweep -->
    <svg
      v-else-if="variant === 'wave'"
      viewBox="0 0 720 360"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="pyr-ember-3" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" />
          <stop offset=".55" stop-color="#FF5E1A" />
          <stop offset="1" stop-color="#FFC83D" />
        </linearGradient>
        <linearGradient id="pyr-wave-bar-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#FF1F8C" stop-opacity="0" />
          <stop offset=".4" stop-color="#FF5E1A" />
          <stop offset=".6" stop-color="#FFC83D" />
          <stop offset="1" stop-color="#FFC83D" stop-opacity="0" />
        </linearGradient>
        <mask id="pyr-wave-mask">
          <rect width="720" height="360" fill="black" />
          <rect class="pyr-wave-mask" height="360" width="800" fill="white" />
        </mask>
      </defs>
      <g transform="translate(138 72) scale(2)" opacity=".22">
        <circle cx="36" cy="64" r="22" fill="#181822" />
        <path class="pyr-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" stroke="#23232E" />
      </g>
      <text class="pyr-word" x="405" y="230" fill="#23232E">pyreon</text>
      <g mask="url(#pyr-wave-mask)">
        <g transform="translate(138 72) scale(2)">
          <circle cx="36" cy="64" r="22" fill="url(#pyr-ember-3)" />
          <path class="pyr-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" />
        </g>
        <text class="pyr-word" x="405" y="230">pyreon</text>
      </g>
      <rect class="pyr-wave-bar" width="48" height="360" fill="url(#pyr-wave-bar-grad)" />
    </svg>

    <!-- 04 · Particles converge -->
    <svg
      v-else-if="variant === 'particles'"
      viewBox="0 0 720 360"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="pyr-disc-radial">
          <stop offset="0" stop-color="#FFC83D" />
          <stop offset=".55" stop-color="#FF5E1A" />
          <stop offset="1" stop-color="#FF1F8C" />
        </radialGradient>
      </defs>
      <circle class="pyr-part" cx="210" cy="200" r="6" fill="#FF1F8C" style="--fx:-40px; --fy:40px;   --d:0ms" />
      <circle class="pyr-part" cx="210" cy="200" r="4" fill="#FFC83D" style="--fx:80px;  --fy:-30px;  --d:60ms" />
      <circle class="pyr-part" cx="210" cy="200" r="5" fill="#FF5E1A" style="--fx:-60px; --fy:320px;  --d:30ms" />
      <circle class="pyr-part" cx="210" cy="200" r="4" fill="#FF5E1A" style="--fx:-30px; --fy:200px;  --d:120ms" />
      <circle class="pyr-part" cx="210" cy="200" r="4" fill="#FF1F8C" style="--fx:400px; --fy:-20px;  --d:90ms" />
      <circle class="pyr-part" cx="210" cy="200" r="3" fill="#FFC83D" style="--fx:380px; --fy:340px;  --d:180ms" />
      <circle class="pyr-part" cx="210" cy="200" r="5" fill="#FF5E1A" style="--fx:-50px; --fy:80px;   --d:220ms" />
      <circle class="pyr-part" cx="210" cy="200" r="4" fill="#FFC83D" style="--fx:420px; --fy:120px;  --d:50ms" />
      <g transform="translate(138 72) scale(2)">
        <g style="transform-origin: 36px 64px" class="pyr-part-disc">
          <circle cx="36" cy="64" r="22" fill="url(#pyr-disc-radial)" />
        </g>
        <path class="pyr-n pyr-part-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" />
      </g>
      <text class="pyr-word pyr-part-word" x="405" y="230">pyreon</text>
    </svg>

    <!-- 05 · Ember bead fuse -->
    <svg
      v-else-if="variant === 'fuse'"
      viewBox="0 0 720 360"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="pyr-ember-5" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" /><stop offset=".55" stop-color="#FF5E1A" /><stop offset="1" stop-color="#FFC83D" />
        </linearGradient>
      </defs>
      <path d="M -20 200 L 130 200 L 210 200 L 282 200 L 282 144 L 348 144 L 348 200 L 740 200" stroke="#23232E" stroke-width="1.5" fill="none" />
      <path class="pyr-fuse-trail" d="M -20 200 L 130 200 L 210 200 L 282 200 L 282 144 L 348 144 L 348 200 L 740 200" stroke="url(#pyr-ember-5)" stroke-width="3" fill="none" stroke-linecap="round" />
      <circle class="pyr-fuse-bead" r="7" fill="url(#pyr-ember-5)" style="offset-path: path('M -20 200 L 130 200 L 210 200 L 282 200 L 282 144 L 348 144 L 348 200 L 740 200'); filter: drop-shadow(0 0 8px rgba(255,94,26,.9))" />
      <g transform="translate(138 72) scale(2)">
        <circle class="pyr-fuse-disc" cx="36" cy="64" r="22" fill="url(#pyr-ember-5)" />
        <path class="pyr-n pyr-fuse-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" />
      </g>
      <text class="pyr-word pyr-fuse-word" x="405" y="230">pyreon</text>
    </svg>

    <!-- 06 · Terminal type-on -->
    <svg
      v-else-if="variant === 'term'"
      viewBox="0 0 720 360"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="pyr-ember-6" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" /><stop offset=".55" stop-color="#FF5E1A" /><stop offset="1" stop-color="#FFC83D" />
        </linearGradient>
      </defs>
      <g transform="translate(405 125)">
        <text x="0" y="0" style="font-family:'JetBrains Mono', monospace; font-size: 18px; fill: #22D3EE">$</text>
        <g class="pyr-term-clip">
          <text x="20" y="0" style="font-family:'JetBrains Mono', monospace; font-size: 18px; fill: #F4EFE6">pyr show-mark</text>
        </g>
        <rect class="pyr-term-cursor" x="20" y="-15" width="3" height="20" fill="#FF5E1A" />
      </g>
      <g transform="translate(138 72) scale(2)">
        <g style="transform-origin: 36px 64px" class="pyr-term-disc">
          <circle cx="36" cy="64" r="22" fill="url(#pyr-ember-6)" />
        </g>
        <path class="pyr-n pyr-term-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" />
      </g>
      <text class="pyr-word pyr-term-word" x="405" y="230">pyreon</text>
    </svg>

    <!-- 07 · Concentric rings -->
    <svg
      v-else-if="variant === 'rings'"
      viewBox="0 0 720 360"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="pyr-ember-7" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" /><stop offset=".55" stop-color="#FF5E1A" /><stop offset="1" stop-color="#FFC83D" />
        </linearGradient>
        <radialGradient id="pyr-ring-grad">
          <stop offset="0" stop-color="#FFC83D" /><stop offset=".55" stop-color="#FF5E1A" /><stop offset="1" stop-color="#FF1F8C" />
        </radialGradient>
      </defs>
      <circle class="pyr-ring" cx="210" cy="200" r="20" fill="none" stroke="url(#pyr-ring-grad)" stroke-width="2" style="--d:0ms" />
      <circle class="pyr-ring" cx="210" cy="200" r="20" fill="none" stroke="url(#pyr-ring-grad)" stroke-width="2" style="--d:80ms" />
      <circle class="pyr-ring" cx="210" cy="200" r="20" fill="none" stroke="url(#pyr-ring-grad)" stroke-width="2" style="--d:160ms" />
      <circle class="pyr-ring" cx="210" cy="200" r="20" fill="none" stroke="url(#pyr-ring-grad)" stroke-width="2" style="--d:240ms" />
      <g transform="translate(138 72) scale(2)">
        <g style="transform-origin: 36px 64px" class="pyr-rings-disc">
          <circle cx="36" cy="64" r="22" fill="url(#pyr-ember-7)" />
        </g>
        <path class="pyr-n pyr-rings-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" />
      </g>
      <text class="pyr-word pyr-rings-word" x="405" y="230">pyreon</text>
    </svg>

    <!-- 08 · Orbit collapse -->
    <svg
      v-else-if="variant === 'orbit'"
      viewBox="0 0 720 360"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="pyr-ember-8" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" /><stop offset=".55" stop-color="#FF5E1A" /><stop offset="1" stop-color="#FFC83D" />
        </linearGradient>
      </defs>
      <circle class="pyr-orbiter" cx="210" cy="200" r="4" fill="#22D3EE" style="transform-origin:210px 200px; --a:0deg;   --d:0ms" />
      <circle class="pyr-orbiter" cx="210" cy="200" r="4" fill="#22D3EE" style="transform-origin:210px 200px; --a:45deg;  --d:25ms" />
      <circle class="pyr-orbiter" cx="210" cy="200" r="4" fill="#22D3EE" style="transform-origin:210px 200px; --a:90deg;  --d:50ms" />
      <circle class="pyr-orbiter" cx="210" cy="200" r="4" fill="#22D3EE" style="transform-origin:210px 200px; --a:135deg; --d:75ms" />
      <circle class="pyr-orbiter" cx="210" cy="200" r="4" fill="#22D3EE" style="transform-origin:210px 200px; --a:180deg; --d:100ms" />
      <circle class="pyr-orbiter" cx="210" cy="200" r="4" fill="#22D3EE" style="transform-origin:210px 200px; --a:225deg; --d:125ms" />
      <circle class="pyr-orbiter" cx="210" cy="200" r="4" fill="#22D3EE" style="transform-origin:210px 200px; --a:270deg; --d:150ms" />
      <circle class="pyr-orbiter" cx="210" cy="200" r="4" fill="#22D3EE" style="transform-origin:210px 200px; --a:315deg; --d:175ms" />
      <g transform="translate(138 72) scale(2)">
        <g style="transform-origin: 36px 64px" class="pyr-orbit-disc">
          <circle cx="36" cy="64" r="22" fill="url(#pyr-ember-8)" />
        </g>
        <path class="pyr-n pyr-orbit-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" />
      </g>
      <text class="pyr-word pyr-orbit-word" x="405" y="230">pyreon</text>
    </svg>

    <!-- 09 · Channel-split resolve -->
    <svg
      v-else-if="variant === 'split'"
      viewBox="0 0 720 360"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="pyr-ember-9" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" /><stop offset=".55" stop-color="#FF5E1A" /><stop offset="1" stop-color="#FFC83D" />
        </linearGradient>
        <text id="pyr-split-word" x="380" y="230" style="font-family:'Space Grotesk', sans-serif; font-weight: 600; font-size: 92px; letter-spacing: -3.6px">pyreon</text>
      </defs>
      <use class="pyr-chan-l" href="#pyr-split-word" fill="#FF1F8C" />
      <use class="pyr-chan-m" href="#pyr-split-word" fill="#22D3EE" />
      <use class="pyr-chan-r" href="#pyr-split-word" fill="#FFC83D" />
      <use class="pyr-split-final" href="#pyr-split-word" fill="#F4EFE6" />
      <g transform="translate(138 72) scale(2)">
        <g style="transform-origin: 36px 64px" class="pyr-split-disc">
          <circle cx="36" cy="64" r="22" fill="url(#pyr-ember-9)" />
        </g>
        <path class="pyr-n pyr-split-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" />
      </g>
    </svg>

    <!-- 10 · Spotlight focus -->
    <svg
      v-else-if="variant === 'spot'"
      viewBox="0 0 720 360"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="pyr-ember-10" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" /><stop offset=".55" stop-color="#FF5E1A" /><stop offset="1" stop-color="#FFC83D" />
        </linearGradient>
        <radialGradient id="pyr-spot-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#FFC83D" stop-opacity="0.6" />
          <stop offset="1" stop-color="#FFC83D" stop-opacity="0" />
        </radialGradient>
      </defs>
      <circle class="pyr-spot" cx="210" cy="200" r="280" fill="url(#pyr-spot-grad)" style="transform-origin: 210px 200px" />
      <g transform="translate(138 72) scale(2)">
        <g style="transform-origin: 36px 64px" class="pyr-spot-disc">
          <circle cx="36" cy="64" r="22" fill="url(#pyr-ember-10)" />
        </g>
        <path class="pyr-n pyr-spot-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" />
      </g>
      <text class="pyr-word pyr-spot-word" x="405" y="230">pyreon</text>
    </svg>

    <!-- 11 · ECG sync sweep -->
    <svg
      v-else
      viewBox="0 0 720 360"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="pyr-ember-11" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" /><stop offset=".55" stop-color="#FF5E1A" /><stop offset="1" stop-color="#FFC83D" />
        </linearGradient>
        <linearGradient id="pyr-ecg-bar" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#22D3EE" stop-opacity="0" />
          <stop offset=".5" stop-color="#22D3EE" stop-opacity=".7" />
          <stop offset="1" stop-color="#22D3EE" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="M 0 200 L 220 200 L 240 180 L 260 220 L 280 200 L 720 200" stroke="#23232E" stroke-width="1.5" fill="none" />
      <g transform="translate(138 72) scale(2)" opacity=".15">
        <circle cx="36" cy="64" r="22" fill="#F4EFE6" />
        <path class="pyr-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" stroke="#F4EFE6" />
      </g>
      <text class="pyr-word" x="405" y="230" fill="#F4EFE6" opacity=".12">pyreon</text>
      <g transform="translate(138 72) scale(2)">
        <g class="pyr-ecg-disc" style="transform-origin: 36px 64px">
          <circle cx="36" cy="64" r="22" fill="url(#pyr-ember-11)" />
        </g>
      </g>
      <path class="pyr-n pyr-ecg-n" transform="translate(138 72) scale(2)" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" />
      <text class="pyr-word pyr-ecg-word" x="405" y="230">pyreon</text>
      <rect class="pyr-ecg-scan" width="6" height="360" fill="url(#pyr-ecg-bar)" />
    </svg>
  </div>
</template>

<!--
  PRODUCTION CSS — verbatim port of hero-animations.html's
  <style id="pyr-hero-css">, with `.pyr-hero` rebased to `.px-heromark`
  and the handoff's `.pyr-hero[data-theme="light"]` overrides rebased to
  the docs' ancestor `[data-theme="light"]` root (driven by tokens.css +
  the FOUC script in config.ts). Class names, keyframes, timings, and
  geometry are unchanged from the handoff. `scoped` is safe here: Vue
  scopes @keyframes consistently and appends the scope attr to the final
  compound selector, so the [data-state]/[data-variant]/stop[stop-color]
  selectors all still match the in-template SVG nodes.
-->
<style scoped>
/* ── Base · the ON glyph + wordmark composition ────────────────── */
.px-heromark {
  position: relative;
  width: 100%;
  max-width: 520px;
  aspect-ratio: 720 / 360;
}
.px-heromark svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.px-heromark .pyr-grid line {
  stroke: #23232e;
  stroke-width: 1;
}
.px-heromark .pyr-grid {
  opacity: 0.3;
}

/* The ON glyph — same path, same coords across every variant. */
.px-heromark .pyr-disc {
  fill: url(#pyr-ember);
}
.px-heromark .pyr-n {
  stroke: #f4efe6;
  stroke-width: 10;
  stroke-linecap: square;
  stroke-linejoin: miter;
  fill: none;
}

/* The wordmark — set in Space Grotesk 600. */
.px-heromark .pyr-word {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 600;
  font-size: 96px;
  letter-spacing: -3.8px;
  fill: #f4efe6;
}

/* ── 01 · Stroke-trace · canonical (recommended) ──────────────── */
.px-heromark[data-variant='trace'][data-state='entering'] .pyr-trace-edge {
  animation: pyr-trace-edge 360ms var(--d, 0ms) cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.px-heromark[data-variant='trace'] .pyr-trace-edge {
  stroke-dashoffset: 320;
  opacity: 0;
}
.px-heromark[data-variant='trace'][data-state='entering'] .pyr-trace-disc {
  animation: pyr-trace-disc 280ms 380ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.px-heromark[data-variant='trace'][data-state='entering'] .pyr-trace-n {
  animation: pyr-trace-n 340ms 580ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.px-heromark[data-variant='trace'] .pyr-trace-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
}
.px-heromark[data-variant='trace'][data-state='entering'] .pyr-trace-word {
  animation: pyr-fade-in 280ms 880ms forwards;
}
.px-heromark[data-variant='trace'] .pyr-trace-word {
  opacity: 0;
}
@keyframes pyr-trace-edge {
  to {
    stroke-dashoffset: 0;
    opacity: 1;
  }
}
@keyframes pyr-trace-disc {
  0% {
    transform: scale(0);
    filter: drop-shadow(0 0 16px rgba(255, 94, 26, 1));
  }
  70% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
    filter: drop-shadow(0 0 0 rgba(255, 94, 26, 0));
  }
}
@keyframes pyr-trace-n {
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes pyr-fade-in {
  to {
    opacity: 1;
  }
}

/* ── 02 · Pulse cascade · 3 beats ──────────────────────────────── */
.px-heromark[data-variant='pulse'][data-state='entering'] .pyr-pulse-disc {
  animation: pyr-pulse-disc 320ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
}
.px-heromark[data-variant='pulse'][data-state='entering'] .pyr-pulse-n {
  animation: pyr-pulse-n 200ms 320ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.px-heromark[data-variant='pulse'] .pyr-pulse-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
}
.px-heromark[data-variant='pulse'][data-state='entering'] .pyr-pulse-ring {
  animation: pyr-pulse-ring 360ms 320ms ease-out forwards;
}
.px-heromark[data-variant='pulse'] .pyr-pulse-ring {
  opacity: 0;
}
.px-heromark[data-variant='pulse'][data-state='entering'] .pyr-pulse-word {
  animation: pyr-fade-in 280ms 640ms forwards;
}
.px-heromark[data-variant='pulse'] .pyr-pulse-word {
  opacity: 0;
}
.px-heromark[data-variant='pulse'][data-state='entering'] .pyr-pulse-under {
  animation: pyr-pulse-under 320ms 640ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
}
@keyframes pyr-pulse-disc {
  0% {
    transform: scale(0.4);
    filter: drop-shadow(0 0 16px rgba(255, 94, 26, 1));
  }
  50% {
    transform: scale(1.18);
  }
  100% {
    transform: scale(1);
    filter: drop-shadow(0 0 0 rgba(255, 94, 26, 0));
  }
}
@keyframes pyr-pulse-n {
  0% {
    stroke-dashoffset: 180;
    filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.7));
  }
  100% {
    stroke-dashoffset: 0;
    filter: drop-shadow(0 0 0 transparent);
  }
}
@keyframes pyr-pulse-ring {
  0% {
    transform: scale(0.4);
    opacity: 0.9;
  }
  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}
@keyframes pyr-pulse-under {
  0% {
    transform: scaleX(0);
  }
  100% {
    transform: scaleX(1);
  }
}

/* ── 03 · Wavefront sweep ─────────────────────────────────────── */
.px-heromark[data-variant='wave'][data-state='entering'] .pyr-wave-mask {
  animation: pyr-wave-sweep 700ms cubic-bezier(0.4, 0, 0.3, 1) forwards;
}
.px-heromark[data-variant='wave'] .pyr-wave-mask {
  transform: translateX(-820px);
}
.px-heromark[data-variant='wave'][data-state='entering'] .pyr-wave-bar {
  animation: pyr-wave-bar 700ms cubic-bezier(0.4, 0, 0.3, 1) forwards;
}
.px-heromark[data-variant='wave'] .pyr-wave-bar {
  transform: translateX(-60px);
  opacity: 0.85;
}
@keyframes pyr-wave-sweep {
  from {
    transform: translateX(-820px);
  }
  to {
    transform: translateX(0);
  }
}
@keyframes pyr-wave-bar {
  from {
    transform: translateX(-60px);
    opacity: 0.85;
  }
  90% {
    opacity: 0.85;
  }
  to {
    transform: translateX(720px);
    opacity: 0;
  }
}

/* ── 04 · Particles converge ──────────────────────────────────── */
.px-heromark[data-variant='particles'][data-state='entering'] .pyr-part {
  animation: pyr-part-fly 500ms var(--d, 0ms) cubic-bezier(0.3, 0.8, 0.2, 1) backwards;
}
.px-heromark[data-variant='particles'][data-state='entering'] .pyr-part-disc {
  animation: pyr-part-disc 220ms 500ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.px-heromark[data-variant='particles'][data-state='entering'] .pyr-part-n {
  animation: pyr-trace-n 280ms 660ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.px-heromark[data-variant='particles'] .pyr-part-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
}
.px-heromark[data-variant='particles'][data-state='entering'] .pyr-part-word {
  animation: pyr-fade-in 260ms 840ms forwards;
}
.px-heromark[data-variant='particles'] .pyr-part-word {
  opacity: 0;
}
@keyframes pyr-part-fly {
  from {
    transform: translate(var(--fx), var(--fy));
    opacity: 0;
  }
  60% {
    opacity: 1;
  }
  to {
    transform: translate(0, 0);
    opacity: 1;
  }
}
@keyframes pyr-part-disc {
  from {
    transform: scale(0);
    filter: drop-shadow(0 0 12px rgba(255, 94, 26, 1));
  }
  to {
    transform: scale(1);
    filter: drop-shadow(0 0 0 rgba(255, 94, 26, 0));
  }
}

/* ── 05 · Fuse · ember bead runs a polyline path ─────────────── */
.px-heromark[data-variant='fuse'][data-state='entering'] .pyr-fuse-trail {
  animation: pyr-fuse-draw 700ms cubic-bezier(0.3, 0.8, 0.2, 1) forwards;
}
.px-heromark[data-variant='fuse'] .pyr-fuse-trail {
  stroke-dasharray: 900;
  stroke-dashoffset: 900;
}
.px-heromark[data-variant='fuse'][data-state='entering'] .pyr-fuse-bead {
  animation: pyr-fuse-bead 700ms cubic-bezier(0.3, 0.8, 0.2, 1) forwards;
}
.px-heromark[data-variant='fuse'] .pyr-fuse-bead {
  offset-distance: 100%;
}
.px-heromark[data-variant='fuse'][data-state='entering'] .pyr-fuse-disc {
  animation: pyr-fade-in 220ms 380ms forwards;
}
.px-heromark[data-variant='fuse'] .pyr-fuse-disc {
  opacity: 0;
}
.px-heromark[data-variant='fuse'][data-state='entering'] .pyr-fuse-n {
  animation: pyr-fade-in 220ms 480ms forwards;
}
.px-heromark[data-variant='fuse'] .pyr-fuse-n {
  opacity: 0;
}
.px-heromark[data-variant='fuse'][data-state='entering'] .pyr-fuse-word {
  animation: pyr-fade-in 280ms 720ms forwards;
}
.px-heromark[data-variant='fuse'] .pyr-fuse-word {
  opacity: 0;
}
@keyframes pyr-fuse-draw {
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes pyr-fuse-bead {
  from {
    offset-distance: 0%;
  }
  to {
    offset-distance: 100%;
  }
}

/* ── 06 · Terminal type-on ─────────────────────────────────────── */
.px-heromark[data-variant='term'][data-state='entering'] .pyr-term-clip {
  animation: pyr-term-clip 600ms 80ms cubic-bezier(0.5, 0, 0.3, 1) forwards;
}
.px-heromark[data-variant='term'] .pyr-term-clip {
  clip-path: inset(0 0 0 0);
}
.px-heromark[data-variant='term'][data-state='entering'] .pyr-term-cursor {
  animation:
    pyr-term-cursor 600ms 80ms cubic-bezier(0.5, 0, 0.3, 1) forwards,
    pyr-blink 0.9s steps(1) infinite;
}
.px-heromark[data-variant='term'] .pyr-term-cursor {
  transform: translateX(160px);
}
.px-heromark[data-variant='term'] .pyr-term-disc {
  opacity: 1;
  transform: scale(1);
}
.px-heromark[data-variant='term'][data-state='entering'] .pyr-term-disc {
  animation: pyr-term-disc 280ms 760ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.px-heromark[data-variant='term'][data-state='entering'] .pyr-term-n {
  animation: pyr-trace-n 280ms 940ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.px-heromark[data-variant='term'] .pyr-term-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
}
.px-heromark[data-variant='term'][data-state='entering'] .pyr-term-word {
  animation: pyr-fade-in 280ms 820ms forwards;
}
.px-heromark[data-variant='term'] .pyr-term-word {
  opacity: 0;
}
@keyframes pyr-term-clip {
  from {
    clip-path: inset(0 100% 0 0);
  }
  to {
    clip-path: inset(0 0% 0 0);
  }
}
@keyframes pyr-term-cursor {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(160px);
  }
}
@keyframes pyr-blink {
  50% {
    opacity: 0;
  }
}
@keyframes pyr-term-disc {
  from {
    opacity: 0;
    transform: scale(0.4);
    filter: drop-shadow(0 0 16px rgba(255, 94, 26, 0.9));
  }
  to {
    opacity: 1;
    transform: scale(1);
    filter: drop-shadow(0 0 0 rgba(255, 94, 26, 0));
  }
}

/* ── 07 · Concentric rings ──────────────────────────────────── */
.px-heromark[data-variant='rings'][data-state='entering'] .pyr-ring {
  animation: pyr-ring 700ms var(--d, 0ms) cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.px-heromark[data-variant='rings'] .pyr-ring {
  opacity: 0;
}
.px-heromark[data-variant='rings'][data-state='entering'] .pyr-rings-disc {
  animation: pyr-trace-disc 300ms 300ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.px-heromark[data-variant='rings'][data-state='entering'] .pyr-rings-n {
  animation: pyr-trace-n 280ms 550ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.px-heromark[data-variant='rings'] .pyr-rings-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
}
.px-heromark[data-variant='rings'][data-state='entering'] .pyr-rings-word {
  animation: pyr-fade-in 280ms 760ms forwards;
}
.px-heromark[data-variant='rings'] .pyr-rings-word {
  opacity: 0;
}
@keyframes pyr-ring {
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

/* ── 08 · Orbit collapse ────────────────────────────────────── */
.px-heromark[data-variant='orbit'][data-state='entering'] .pyr-orbiter {
  animation:
    pyr-orbit 500ms var(--d, 0ms) cubic-bezier(0.5, 0, 0.4, 1) forwards,
    pyr-snap 240ms calc(500ms + var(--d, 0ms)) cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.px-heromark[data-variant='orbit'][data-state='entering'] .pyr-orbit-disc {
  animation: pyr-orbit-disc 200ms 580ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.px-heromark[data-variant='orbit'][data-state='entering'] .pyr-orbit-n {
  animation: pyr-trace-n 240ms 660ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.px-heromark[data-variant='orbit'] .pyr-orbit-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
}
.px-heromark[data-variant='orbit'][data-state='entering'] .pyr-orbit-word {
  animation: pyr-fade-in 280ms 820ms forwards;
}
.px-heromark[data-variant='orbit'] .pyr-orbit-word {
  opacity: 0;
}
@keyframes pyr-orbit {
  from {
    transform: rotate(var(--a)) translateX(80px);
    fill: #22d3ee;
  }
  to {
    transform: rotate(calc(var(--a) + 540deg)) translateX(80px);
    fill: #22d3ee;
  }
}
@keyframes pyr-snap {
  from {
    transform: rotate(calc(var(--a) + 540deg)) translateX(80px);
    fill: #22d3ee;
    opacity: 1;
  }
  to {
    transform: rotate(calc(var(--a) + 540deg)) translateX(0);
    fill: #ff5e1a;
    opacity: 0;
  }
}
@keyframes pyr-orbit-disc {
  from {
    transform: scale(0.3);
    filter: drop-shadow(0 0 16px rgba(255, 94, 26, 0.9));
  }
  to {
    transform: scale(1);
    filter: drop-shadow(0 0 0 rgba(255, 94, 26, 0));
  }
}

/* ── 09 · Channel-split resolve ─────────────────────────────── */
.px-heromark[data-variant='split'][data-state='entering'] .pyr-chan-l {
  animation: pyr-chan-l 900ms cubic-bezier(0.5, 0, 0.3, 1) both;
}
.px-heromark[data-variant='split'][data-state='entering'] .pyr-chan-m {
  animation: pyr-chan-m 900ms cubic-bezier(0.5, 0, 0.3, 1) both;
}
.px-heromark[data-variant='split'][data-state='entering'] .pyr-chan-r {
  animation: pyr-chan-r 900ms cubic-bezier(0.5, 0, 0.3, 1) both;
}
.px-heromark[data-variant='split'] .pyr-chan-l,
.px-heromark[data-variant='split'] .pyr-chan-m,
.px-heromark[data-variant='split'] .pyr-chan-r {
  opacity: 0;
}
.px-heromark[data-variant='split'][data-state='entering'] .pyr-split-final {
  animation: pyr-fade-in 200ms 780ms forwards;
}
.px-heromark[data-variant='split'] .pyr-split-final {
  opacity: 0;
}
.px-heromark[data-variant='split'][data-state='entering'] .pyr-split-disc {
  animation: pyr-term-disc 240ms 880ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.px-heromark[data-variant='split'][data-state='entering'] .pyr-split-n {
  animation: pyr-trace-n 240ms 1020ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.px-heromark[data-variant='split'] .pyr-split-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
}
.px-heromark[data-variant='split'] .pyr-split-disc {
  opacity: 1;
  transform: scale(1);
}
@keyframes pyr-chan-l {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  15% {
    transform: translate(-8px, -3px);
    opacity: 0.9;
  }
  45% {
    transform: translate(-22px, -6px);
    opacity: 0.9;
  }
  65% {
    transform: translate(-22px, -6px);
    opacity: 0.9;
  }
  85% {
    transform: translate(0, 0);
    opacity: 0.6;
  }
  100% {
    opacity: 0;
  }
}
@keyframes pyr-chan-m {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  15% {
    transform: translate(1px, 2px);
    opacity: 0.9;
  }
  45% {
    transform: translate(3px, 6px);
    opacity: 0.9;
  }
  65% {
    transform: translate(3px, 6px);
    opacity: 0.9;
  }
  85% {
    transform: translate(0, 0);
    opacity: 0.6;
  }
  100% {
    opacity: 0;
  }
}
@keyframes pyr-chan-r {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  15% {
    transform: translate(8px, 3px);
    opacity: 0.9;
  }
  45% {
    transform: translate(22px, 6px);
    opacity: 0.9;
  }
  65% {
    transform: translate(22px, 6px);
    opacity: 0.9;
  }
  85% {
    transform: translate(0, 0);
    opacity: 0.6;
  }
  100% {
    opacity: 0;
  }
}

/* ── 10 · Spotlight focus ───────────────────────────────────── */
.px-heromark[data-variant='spot'][data-state='entering'] .pyr-spot {
  animation: pyr-spot 600ms cubic-bezier(0.4, 0, 0.3, 1) forwards;
}
.px-heromark[data-variant='spot'] .pyr-spot {
  transform: scale(0.4);
}
.px-heromark[data-variant='spot'][data-state='entering'] .pyr-spot-disc {
  animation: pyr-spot-disc 240ms 580ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.px-heromark[data-variant='spot'] .pyr-spot-disc {
  opacity: 0;
}
.px-heromark[data-variant='spot'][data-state='entering'] .pyr-spot-n {
  animation: pyr-trace-n 260ms 700ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.px-heromark[data-variant='spot'] .pyr-spot-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
}
.px-heromark[data-variant='spot'][data-state='entering'] .pyr-spot-word {
  animation: pyr-fade-in 260ms 820ms forwards;
}
.px-heromark[data-variant='spot'] .pyr-spot-word {
  opacity: 0;
}
@keyframes pyr-spot {
  from {
    transform: scale(2);
    opacity: 0.6;
  }
  to {
    transform: scale(0.4);
    opacity: 1;
  }
}
@keyframes pyr-spot-disc {
  from {
    opacity: 0;
    transform: scale(0.4);
    filter: drop-shadow(0 0 20px rgba(255, 94, 26, 1));
  }
  to {
    opacity: 1;
    transform: scale(1);
    filter: drop-shadow(0 0 0 rgba(255, 94, 26, 0));
  }
}

/* ── 11 · ECG sync sweep ─────────────────────────────────────── */
.px-heromark[data-variant='ecg'][data-state='entering'] .pyr-ecg-scan {
  animation: pyr-ecg-scan 900ms cubic-bezier(0.5, 0, 0.3, 1) forwards;
}
.px-heromark[data-variant='ecg'] .pyr-ecg-scan {
  transform: translateX(720px);
  opacity: 0;
}
.px-heromark[data-variant='ecg'][data-state='entering'] .pyr-ecg-disc {
  animation: pyr-ecg-disc 200ms 280ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.px-heromark[data-variant='ecg'] .pyr-ecg-disc {
  opacity: 0;
}
.px-heromark[data-variant='ecg'][data-state='entering'] .pyr-ecg-n {
  animation: pyr-trace-n 240ms 460ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.px-heromark[data-variant='ecg'] .pyr-ecg-n {
  stroke-dasharray: 180;
  stroke-dashoffset: 180;
}
.px-heromark[data-variant='ecg'][data-state='entering'] .pyr-ecg-word {
  animation: pyr-fade-in 240ms 720ms forwards;
}
.px-heromark[data-variant='ecg'] .pyr-ecg-word {
  opacity: 0;
}
@keyframes pyr-ecg-scan {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(720px);
    opacity: 0;
  }
}
@keyframes pyr-ecg-disc {
  from {
    opacity: 0;
    transform: scale(1.1);
    filter: drop-shadow(0 0 14px rgba(255, 94, 26, 0.8));
  }
  to {
    opacity: 1;
    transform: scale(1);
    filter: drop-shadow(0 0 0 rgba(255, 94, 26, 0));
  }
}

/* ── Light theme overrides · driven by the docs' <html data-theme="light">
   root (tokens.css + the FOUC script in config.ts). Recolours inline SVG
   fills / strokes / gradient stops via attribute selectors — no markup
   changes. Verbatim palette from the handoff. ─────────────────────── */
[data-theme='light'] .px-heromark .pyr-grid line {
  stroke: #e6dfd2;
}
[data-theme='light'] .px-heromark .pyr-word {
  fill: #14141c;
}
[data-theme='light'] .px-heromark .pyr-n {
  stroke: #14141c;
}
/* Ember palette · desaturated for paper · same role (the "hot" signal) */
[data-theme='light'] .px-heromark stop[stop-color='#FF1F8C'] {
  stop-color: #e40c70;
}
[data-theme='light'] .px-heromark stop[stop-color='#FF5E1A'] {
  stop-color: #e84a0f;
}
[data-theme='light'] .px-heromark stop[stop-color='#FFC83D'] {
  stop-color: #e0a510;
}
[data-theme='light'] .px-heromark [fill='#FF5E1A'] {
  fill: #e84a0f;
}
[data-theme='light'] .px-heromark [fill='#FFC83D'] {
  fill: #e0a510;
}
[data-theme='light'] .px-heromark [fill='#FF1F8C'] {
  fill: #e40c70;
}
[data-theme='light'] .px-heromark [stroke='#FF5E1A'] {
  stroke: #e84a0f;
}
/* Cyan · AA-darkened for body-text contrast on paper */
[data-theme='light'] .px-heromark stop[stop-color='#22D3EE'] {
  stop-color: #0891b2;
}
[data-theme='light'] .px-heromark [fill='#22D3EE'] {
  fill: #0891b2;
}
[data-theme='light'] .px-heromark .pyr-orbiter {
  fill: #0891b2;
}
/* Cold underlayer · paper tones replace inky ones */
[data-theme='light'] .px-heromark [fill='#23232E'] {
  fill: #e6dfd2;
}
[data-theme='light'] .px-heromark [fill='#181822'] {
  fill: #ede6d6;
}
[data-theme='light'] .px-heromark [stroke='#23232E'] {
  stroke: #e6dfd2;
}
[data-theme='light'] .px-heromark [stroke='#2E2E3B'] {
  stroke: #e6dfd2;
}
[data-theme='light'] .px-heromark path[stroke='#23232E'] {
  stroke: #c9c4b8;
}
[data-theme='light'] .px-heromark [fill='#F4EFE6'] {
  fill: #14141c;
}
[data-theme='light'] .px-heromark [stroke='#F4EFE6'] {
  stroke: #14141c;
}

/* ── Universal · reduced motion · hero variants ─────────────────
   Snaps every animated element to its end-state with no animation.
   Verbatim from the handoff. ────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .px-heromark * {
    animation: none !important;
    transition: none !important;
  }
  .px-heromark .pyr-trace-edge,
  .px-heromark .pyr-trace-n,
  .px-heromark .pyr-pulse-n,
  .px-heromark .pyr-part-n,
  .px-heromark .pyr-rings-n,
  .px-heromark .pyr-orbit-n,
  .px-heromark .pyr-spot-n,
  .px-heromark .pyr-ecg-n,
  .px-heromark .pyr-fuse-trail {
    stroke-dashoffset: 0 !important;
    opacity: 1 !important;
  }
  .px-heromark .pyr-trace-word,
  .px-heromark .pyr-pulse-word,
  .px-heromark .pyr-pulse-ring,
  .px-heromark .pyr-part-word,
  .px-heromark .pyr-rings-word,
  .px-heromark .pyr-orbit-word,
  .px-heromark .pyr-spot-word,
  .px-heromark .pyr-ecg-word,
  .px-heromark .pyr-fuse-disc,
  .px-heromark .pyr-fuse-n,
  .px-heromark .pyr-fuse-word,
  .px-heromark .pyr-split-final {
    opacity: 1 !important;
  }
  .px-heromark .pyr-wave-mask,
  .px-heromark .pyr-wave-bar,
  .px-heromark .pyr-ecg-scan {
    transform: translateX(0) !important;
    opacity: 0 !important;
  }
  .px-heromark .pyr-trace-disc,
  .px-heromark .pyr-part-disc,
  .px-heromark .pyr-rings-disc,
  .px-heromark .pyr-orbit-disc,
  .px-heromark .pyr-spot-disc,
  .px-heromark .pyr-ecg-disc {
    opacity: 1 !important;
    transform: scale(1) !important;
  }
  .px-heromark .pyr-pulse-under {
    transform: scaleX(1) !important;
  }
  .px-heromark .pyr-term-clip {
    clip-path: inset(0 0 0 0) !important;
  }
  .px-heromark .pyr-term-cursor {
    opacity: 0 !important;
  }
  .px-heromark .pyr-term-disc {
    opacity: 1 !important;
    transform: scale(1) !important;
  }
  .px-heromark .pyr-term-n,
  .px-heromark .pyr-term-word {
    opacity: 1 !important;
    stroke-dashoffset: 0 !important;
  }
  .px-heromark .pyr-fuse-bead {
    opacity: 0 !important;
  }
  .px-heromark .pyr-spot {
    transform: scale(0.4) !important;
    opacity: 0 !important;
  }
  .px-heromark .pyr-orbiter {
    opacity: 0 !important;
  }
  .px-heromark .pyr-ring {
    opacity: 0 !important;
  }
  .px-heromark .pyr-chan-l,
  .px-heromark .pyr-chan-m,
  .px-heromark .pyr-chan-r {
    opacity: 0 !important;
  }
  .px-heromark .pyr-split-disc {
    opacity: 1 !important;
    transform: scale(1) !important;
  }
  .px-heromark .pyr-split-n {
    stroke-dashoffset: 0 !important;
    opacity: 1 !important;
  }
}
</style>
