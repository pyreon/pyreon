// Branded 404 — ported from
// docs/.vitepress/theme/components/PyreonNotFound.vue.
// Same SVG graph + same copy + same semantic-token CSS.
export function PyreonNotFound() {
  return (
    <div class="px-nf">
      <p class="pyreon-eyebrow">404 · signal not found</p>

      <svg
        class="px-nf-graph"
        viewBox="0 0 280 120"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="32" cy="60" r="5" class="px-nf-src" />
        <line x1="38" y1="60" x2="104" y2="60" class="px-nf-edge-live" />
        <line x1="104" y1="60" x2="156" y2="60" class="px-nf-edge-break" />
        <circle cx="130" cy="60" r="13" class="px-nf-miss-ring" />
        <text x="130" y="65" text-anchor="middle" class="px-nf-q">
          ?
        </text>
        <line x1="156" y1="60" x2="242" y2="60" class="px-nf-edge-cold" />
        <circle cx="248" cy="60" r="5" class="px-nf-caller" />
        <text x="32" y="88" text-anchor="middle" class="px-nf-lbl">
          source
        </text>
        <text x="130" y="30" text-anchor="middle" class="px-nf-lbl px-nf-lbl--ember">
          missing
        </text>
        <text x="248" y="88" text-anchor="middle" class="px-nf-lbl px-nf-lbl--dim">
          caller
        </text>
      </svg>

      <h1 class="px-nf-h1">This path has no readers.</h1>
      <p class="px-nf-body">
        The page you asked for either was never defined, or this route
        doesn't subscribe to it. Check the spelling, the imports, the scope.
      </p>
      <div class="px-nf-cta">
        <a class="px-nf-btn" href="/docs/">
          ↗ docs index
        </a>
        <a class="px-nf-link" href="/">
          back to home
        </a>
      </div>
    </div>
  )
}
