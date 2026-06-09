import { onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * Animated hero lockup — faithful 1:1 port of the brand handoff's
 * PyreonHeroMark.vue (1289 LOC). ELEVEN production hero-entry variants
 * ship; one is picked at RANDOM per visit (every variant gets shown
 * over repeat visits):
 *
 *   trace      — signal-graph edges trace in, disc ignites, n strokes, word
 *   pulse      — three-beat cascade: disc · n + glow ring · word + underline
 *   wave       — an ember wavefront sweeps L→R revealing the hot composition
 *   particles  — 8 ember particles fly in, the disc materializes on arrival
 *   fuse       — a single ember bead runs a polyline fuse, lighting the glyph
 *   term       — a mono `$ pyr show-mark` types on; the lockup fires after
 *   rings      — 4 concentric rings expand; the glyph solidifies at max r
 *   orbit      — 8 cyan particles orbit 1.5 turns then snap inward as ember
 *   split      — three colored wordmark ghosts split, register, then resolve
 *   spot       — a dim warm radial contracts to a focal point, igniting disc
 *   ecg        — a vertical cyan scan runs L→R; each layer fills as crossed
 *
 * State machine, not JS animation (handoff README §5):
 *   - Every variant is gated by `data-state="entering"` on the root.
 *   - Default (no data-state) = static resting frame — SSR / JS-disabled
 *     safe, zero hydration mismatch.
 *   - Trigger once on first paint via requestAnimationFrame, OR via an
 *     IntersectionObserver (threshold .25, unobserve-after-first). Never
 *     loops, no replay on click.
 *   - Reduced-motion is built into the CSS (universal `@media
 *     (prefers-reduced-motion: reduce)` block snaps every variant to
 *     its end-state).
 *
 * Random variant pick happens CLIENT-SIDE after mount (SSG can't do
 * per-visit random). Initial render — server + first client paint —
 * is always `trace` with no `data-state`, so hydration matches.
 *
 * `noMotion`: render the static resting lockup only — used by the
 * footer (a static mark, not an animated intro).
 *
 * QA override: `?hero=trace|pulse|…` URL param forces a specific variant.
 */
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

interface HeroMarkProps {
  noMotion?: boolean
}

export function PyreonHeroMark(props: HeroMarkProps) {
  // SSR + first client render = 'trace', no data-state → identical
  // markup, no hydration mismatch. Swapped after mount.
  const variant = signal<Variant>('trace')
  const entering = signal(false)
  let observer: IntersectionObserver | null = null
  let rootEl: HTMLElement | null = null
  const setRoot = (el: HTMLElement | null) => {
    rootEl = el
  }

  onMount(() => {
    if (props.noMotion) return // static resting lockup (footer)
    if (typeof window === 'undefined') return
    const el = rootEl
    if (!el) return

    // Optional QA override: ?hero=trace|pulse|… — otherwise random.
    const forced = new URLSearchParams(window.location.search).get('hero')
    if (forced && (VARIANTS as readonly string[]).includes(forced)) {
      variant.set(forced as Variant)
    } else {
      variant.set(VARIANTS[Math.floor(Math.random() * VARIANTS.length)]!)
    }

    const reduce = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches
    if (reduce) {
      // CSS @media snaps to end-state; still set entering so resting
      // (pre-animation) defaults don't show through.
      entering.set(true)
      return
    }

    const trigger = () => {
      if (entering()) return
      requestAnimationFrame(() => entering.set(true))
    }

    if (typeof IntersectionObserver === 'undefined') {
      trigger()
      return
    }
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            trigger()
            observer?.disconnect()
            observer = null
            break
          }
        }
      },
      { threshold: 0.25 },
    )
    observer.observe(el)
  })

  onUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return (
    <div
      ref={setRoot}
      class="px-heromark"
      {...{ 'data-variant': () => variant() }}
      {...{ 'data-state': () => (entering() ? 'entering' : '') }}
      aria-hidden="true"
    >
      {() => {
        const v = variant()
        if (v === 'trace') return <TraceVariant />
        if (v === 'pulse') return <PulseVariant />
        if (v === 'wave') return <WaveVariant />
        if (v === 'particles') return <ParticlesVariant />
        if (v === 'fuse') return <FuseVariant />
        if (v === 'term') return <TermVariant />
        if (v === 'rings') return <RingsVariant />
        if (v === 'orbit') return <OrbitVariant />
        if (v === 'split') return <SplitVariant />
        if (v === 'spot') return <SpotVariant />
        return <EcgVariant />
      }}
    </div>
  )
}

// ── 01 · Stroke-trace · canonical ───────────────────────────────────────
function TraceVariant() {
  return (
    <svg viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="pyr-ember" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#FF1F8C" />
          <stop offset=".55" stop-color="#FF5E1A" />
          <stop offset="1" stop-color="#FFC83D" />
        </linearGradient>
      </defs>
      <g class="pyr-grid">
        <line x1="0" y1="48" x2="720" y2="48" />
        <line x1="0" y1="76" x2="720" y2="76" />
        <line x1="0" y1="104" x2="720" y2="104" />
        <line x1="0" y1="132" x2="720" y2="132" />
        <line x1="0" y1="160" x2="720" y2="160" />
        <line x1="0" y1="188" x2="720" y2="188" />
        <line x1="0" y1="216" x2="720" y2="216" />
        <line x1="0" y1="244" x2="720" y2="244" />
        <line x1="0" y1="272" x2="720" y2="272" />
        <line x1="0" y1="300" x2="720" y2="300" />
      </g>
      <line
        class="pyr-trace-edge"
        x1="30" y1="90" x2="210" y2="200"
        stroke="url(#pyr-ember)" stroke-width="1.5" stroke-dasharray="320" stroke-linecap="round"
        style="--d:0ms"
      />
      <line
        class="pyr-trace-edge"
        x1="60" y1="280" x2="210" y2="200"
        stroke="url(#pyr-ember)" stroke-width="1.5" stroke-dasharray="320" stroke-linecap="round"
        style="--d:40ms"
      />
      <line
        class="pyr-trace-edge"
        x1="30" y1="200" x2="210" y2="200"
        stroke="url(#pyr-ember)" stroke-width="1.5" stroke-dasharray="320" stroke-linecap="round"
        style="--d:80ms"
      />
      <line
        class="pyr-trace-edge"
        x1="90" y1="40" x2="210" y2="200"
        stroke="url(#pyr-ember)" stroke-width="1.5" stroke-dasharray="320" stroke-linecap="round"
        style="--d:120ms"
      />
      <line
        class="pyr-trace-edge"
        x1="210" y1="200" x2="690" y2="180"
        stroke="url(#pyr-ember)" stroke-width="2" stroke-dasharray="500" stroke-linecap="round"
        style="--d:760ms; animation-duration:380ms"
      />
      <g transform="translate(138 72) scale(2)">
        <g style="transform-origin: 36px 64px" class="pyr-trace-disc">
          <circle class="pyr-disc" cx="36" cy="64" r="22" />
        </g>
        <path class="pyr-n pyr-trace-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" />
      </g>
      <text class="pyr-word pyr-trace-word" x="405" y="230">pyreon</text>
    </svg>
  )
}

// ── 02 · Pulse cascade ────────────────────────────────────────────────
function PulseVariant() {
  return (
    <svg viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet">
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
        <circle
          class="pyr-pulse-ring"
          cx="91" cy="64" r="40" fill="none" stroke="#FF5E1A" stroke-width="2"
          style="transform-origin:91px 64px"
        />
      </g>
      <g class="pyr-pulse-word">
        <text class="pyr-word" x="405" y="230">pyreon</text>
        <line
          class="pyr-pulse-under"
          x1="405" y1="248" x2="700" y2="248"
          stroke="url(#pyr-ember-2)" stroke-width="3"
          style="transform-origin:405px 248px"
        />
      </g>
    </svg>
  )
}

// ── 03 · Wavefront sweep ──────────────────────────────────────────────
function WaveVariant() {
  return (
    <svg viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet">
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
      <g {...{ mask: 'url(#pyr-wave-mask)' }}>
        <g transform="translate(138 72) scale(2)">
          <circle cx="36" cy="64" r="22" fill="url(#pyr-ember-3)" />
          <path class="pyr-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" />
        </g>
        <text class="pyr-word" x="405" y="230">pyreon</text>
      </g>
      <rect class="pyr-wave-bar" width="48" height="360" fill="url(#pyr-wave-bar-grad)" />
    </svg>
  )
}

// ── 04 · Particles converge ───────────────────────────────────────────
function ParticlesVariant() {
  return (
    <svg viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet">
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
  )
}

// ── 05 · Ember bead fuse ──────────────────────────────────────────────
function FuseVariant() {
  return (
    <svg viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="pyr-ember-5" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" />
          <stop offset=".55" stop-color="#FF5E1A" />
          <stop offset="1" stop-color="#FFC83D" />
        </linearGradient>
      </defs>
      <path d="M -20 200 L 130 200 L 210 200 L 282 200 L 282 144 L 348 144 L 348 200 L 740 200" stroke="#23232E" stroke-width="1.5" fill="none" />
      <path class="pyr-fuse-trail" d="M -20 200 L 130 200 L 210 200 L 282 200 L 282 144 L 348 144 L 348 200 L 740 200" stroke="url(#pyr-ember-5)" stroke-width="3" fill="none" stroke-linecap="round" />
      <circle class="pyr-fuse-bead" r="7" fill="url(#pyr-ember-5)" style={"offset-path: path('M -20 200 L 130 200 L 210 200 L 282 200 L 282 144 L 348 144 L 348 200 L 740 200'); filter: drop-shadow(0 0 8px rgba(255,94,26,.9))"} />
      <g transform="translate(138 72) scale(2)">
        <circle class="pyr-fuse-disc" cx="36" cy="64" r="22" fill="url(#pyr-ember-5)" />
        <path class="pyr-n pyr-fuse-n" d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" />
      </g>
      <text class="pyr-word pyr-fuse-word" x="405" y="230">pyreon</text>
    </svg>
  )
}

// ── 06 · Terminal type-on ─────────────────────────────────────────────
function TermVariant() {
  return (
    <svg viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="pyr-ember-6" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" />
          <stop offset=".55" stop-color="#FF5E1A" />
          <stop offset="1" stop-color="#FFC83D" />
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
  )
}

// ── 07 · Concentric rings ─────────────────────────────────────────────
function RingsVariant() {
  return (
    <svg viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="pyr-ember-7" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" />
          <stop offset=".55" stop-color="#FF5E1A" />
          <stop offset="1" stop-color="#FFC83D" />
        </linearGradient>
        <radialGradient id="pyr-ring-grad">
          <stop offset="0" stop-color="#FFC83D" />
          <stop offset=".55" stop-color="#FF5E1A" />
          <stop offset="1" stop-color="#FF1F8C" />
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
  )
}

// ── 08 · Orbit collapse ───────────────────────────────────────────────
function OrbitVariant() {
  return (
    <svg viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="pyr-ember-8" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" />
          <stop offset=".55" stop-color="#FF5E1A" />
          <stop offset="1" stop-color="#FFC83D" />
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
  )
}

// ── 09 · Channel-split resolve ────────────────────────────────────────
function SplitVariant() {
  return (
    <svg viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="pyr-ember-9" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" />
          <stop offset=".55" stop-color="#FF5E1A" />
          <stop offset="1" stop-color="#FFC83D" />
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
  )
}

// ── 10 · Spotlight focus ──────────────────────────────────────────────
function SpotVariant() {
  return (
    <svg viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="pyr-ember-10" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" />
          <stop offset=".55" stop-color="#FF5E1A" />
          <stop offset="1" stop-color="#FFC83D" />
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
  )
}

// ── 11 · ECG sync sweep ───────────────────────────────────────────────
function EcgVariant() {
  return (
    <svg viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="pyr-ember-11" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" />
          <stop offset=".55" stop-color="#FF5E1A" />
          <stop offset="1" stop-color="#FFC83D" />
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
  )
}
