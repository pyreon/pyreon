<!--
  Animated hero lockup — brand handoff §5 ("One path-trace pulse in the
  docs hero on first scroll into view") + hero-variant 17 (Path-trace /
  Fuse). An ember bead runs a fuse through the ON glyph, drawing an ember
  trail; the glyph resolves solid behind it, then the wordmark settles.
  Total ≤ 1s, plays ONCE on first scroll into view.

  Progressive enhancement: the *final* state (solid glyph + wordmark) is
  the default render, so SSR / no-JS / reduced-motion show a correct
  static logo. The intro only plays when JS is present, the element
  scrolls into view, and the user has not requested reduced motion.

  Colour is 100% CSS variables from tokens.css — no raw hex — so it
  flips correctly under the paired light theme too.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

// The ON glyph construction is fixed by the handoff (viewBox 120×120,
// o = circle r22 @ 36,64 · n = the bracket path).
const N_PATH = 'M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86'
// Fuse: enters left, through the disc centre, up the n vertical, exits right.
const FUSE = 'M -40 130 L 96 130 L 168 130 L 168 90 L 204 90 L 204 130 L 760 130'

const root = ref<HTMLElement | null>(null)
const playing = ref(false)
let io: IntersectionObserver | null = null

onMounted(() => {
  const el = root.value
  if (!el) return
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduce || typeof IntersectionObserver === 'undefined') return // stay static-final
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
  <div ref="root" class="px-heromark" :class="{ 'is-playing': playing }" aria-hidden="true">
    <svg viewBox="0 0 760 200" class="px-heromark-svg" role="img">
      <defs>
        <linearGradient id="px-fuse-grad" x1="0" x2="1">
          <stop offset="0" stop-color="var(--ember-plasma)" />
          <stop offset="0.55" stop-color="var(--ember-core)" />
          <stop offset="1" stop-color="var(--ember-warm)" />
        </linearGradient>
      </defs>

      <!-- cold fuse guide -->
      <path :d="FUSE" class="px-fuse-guide" fill="none" />
      <!-- ember trail drawn behind the bead -->
      <path :d="FUSE" class="px-fuse-trail" fill="none" stroke-linecap="round" />
      <!-- the running bead -->
      <circle r="6" class="px-fuse-bead" />

      <!-- ON glyph -->
      <g class="px-glyph" transform="translate(108 36) scale(1.0)">
        <circle cx="36" cy="64" r="22" class="px-disc" />
        <path
          :d="N_PATH"
          class="px-n"
          stroke-width="10"
          stroke-linecap="square"
          stroke-linejoin="miter"
          fill="none"
        />
      </g>

      <!-- wordmark — "pyre" paper + ember "on" (handoff §2, one ember/page) -->
      <text x="250" y="132" class="px-word">
        pyre<tspan class="px-word-on">on</tspan>
      </text>
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
}

/* Default = FINAL state (SSR / no-JS / reduced-motion render this) */
.px-fuse-guide {
  stroke: var(--ink-4);
  stroke-width: 1.5;
}
.px-fuse-trail {
  stroke: url(#px-fuse-grad);
  stroke-width: 3;
  stroke-dasharray: 900;
  stroke-dashoffset: 0;
}
.px-fuse-bead {
  fill: url(#px-fuse-grad);
  opacity: 0;
}
.px-disc {
  fill: var(--ember-core);
}
.px-n {
  stroke: var(--paper-1);
}
.px-word {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 92px;
  letter-spacing: -0.04em;
  fill: var(--paper-1);
}
.px-word-on {
  fill: var(--ember-core);
}

/* Intro — only when JS adds .is-playing (in-view + motion allowed) */
.is-playing .px-fuse-trail {
  animation: px-fz-draw 700ms cubic-bezier(0.3, 0.8, 0.2, 1) backwards;
}
.is-playing .px-fuse-bead {
  offset-path: path('M -40 130 L 96 130 L 168 130 L 168 90 L 204 90 L 204 130 L 760 130');
  animation: px-fz-bead 700ms cubic-bezier(0.3, 0.8, 0.2, 1) backwards;
}
.is-playing .px-glyph {
  transform-box: fill-box;
  transform-origin: center;
  animation: px-fz-reveal 240ms 360ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.is-playing .px-word {
  animation: px-fz-word 280ms 640ms ease-out backwards;
}

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
@keyframes px-fz-reveal {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes px-fz-word {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Hard guarantee: reduced-motion never animates, always final state.
   (JS already avoids adding .is-playing, this is belt-and-suspenders.) */
@media (prefers-reduced-motion: reduce) {
  .px-heromark * {
    animation: none !important;
  }
  .px-fuse-bead {
    opacity: 0 !important;
  }
}
</style>
