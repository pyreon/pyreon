import { RouterLink } from '@pyreon/router'

// Landing page — minimal hero + a link to the docs. The full landing
// content will be ported in a follow-up PR; this scaffold gets the
// routing + content pipeline running end-to-end.
export default function HomePage() {
  return (
    <section class="docs-hero">
      <h1>Pyreon</h1>
      <p>A signal-based UI framework with SSR, SSG, islands, and SPA support.</p>
      <RouterLink to="/docs/getting-started" class="docs-cta">
        Get started →
      </RouterLink>
    </section>
  )
}
