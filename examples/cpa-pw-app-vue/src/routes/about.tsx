import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"

export const meta = {
  title: "About — Pyreon Zero",
  description: "Learn about the Pyreon Zero meta-framework.",
}

export default function About() {
  useHead({
    title: meta.title,
    meta: [{ name: "description", content: meta.description }],
  })

  return (
    <>
      <div class="page-header">
        <h1>About Zero</h1>
        <p>
          A signal-based meta-framework built on Vite — designed for developers who care about
          performance and simplicity.
        </p>
      </div>

      <div class="about-grid">
        <div class="card about-stat">
          <div class="stat-value">0</div>
          <div class="stat-label">Virtual DOM overhead</div>
        </div>
        <div class="card about-stat">
          <div class="stat-value">4</div>
          <div class="stat-label">Rendering strategies</div>
        </div>
        <div class="card about-stat">
          <div class="stat-value">5+</div>
          <div class="stat-label">Deploy adapters</div>
        </div>
      </div>

      <section style="margin-top: var(--space-3xl); max-width: 680px;">
        <h2 style="font-size: 1.3rem; font-weight: 700; margin-bottom: var(--space-md);">
          Why Zero?
        </h2>
        <div style="color: var(--c-text-secondary); line-height: 1.8; display: flex; flex-direction: column; gap: var(--space-lg);">
          <p>
            Most frameworks make you choose between developer experience and runtime performance.
            Zero doesn't. Pyreon's signal-based reactivity means your components compile to surgical
            DOM updates — no diffing, no reconciliation, no wasted work.
          </p>
          <p>
            On top of that, Zero gives you file-based routing, server-side rendering, static
            generation, incremental regeneration, font optimization, image optimization, smart
            caching, link prefetching, and SEO utilities — all built in, all zero-config.
          </p>
          <p>
            Deploy to Node, Bun, Vercel, Cloudflare, Netlify, or export as a static site. One
            codebase, any target.
          </p>
        </div>
      </section>

      <section style="margin-top: var(--space-3xl); max-width: 680px;">
        <h2 style="font-size: 1.3rem; font-weight: 700; margin-bottom: var(--space-md);">
          The Stack
        </h2>
        <div style="display: grid; gap: var(--space-sm);">
          {[
            ["Pyreon", "Signal-based UI framework with JSX"],
            ["Vite", "Lightning-fast dev server and optimized builds"],
            ["File Router", "Drop a file, get a route — layouts, guards, loaders"],
            ["SSR / SSG / ISR", "Every rendering strategy, per-route overrides"],
            ["<Image>", "Lazy loading, responsive srcset, blur-up placeholders"],
            ["<Link>", "Prefetch on hover or viewport entry for instant nav"],
            ["Font Plugin", "Google Fonts optimization, preconnect, font-display:swap"],
            ["Cache MW", "Immutable hashed assets, stale-while-revalidate pages"],
            ["SEO Tools", "Sitemap, robots.txt, JSON-LD structured data"],
          ].map(([name, desc]) => (
            <div
              class="card"
              style="display: flex; align-items: center; gap: var(--space-md); padding: var(--space-md) var(--space-lg);"
            >
              <code style="min-width: 130px; font-weight: 600; color: var(--c-accent);">
                {name}
              </code>
              <span style="color: var(--c-text-secondary); font-size: 0.9rem;">{desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section style="text-align: center; margin-top: var(--space-3xl); padding-bottom: var(--space-xl);">
        <h2 style="font-size: 1.3rem; font-weight: 700; margin-bottom: var(--space-md);">
          Ready to build something?
        </h2>
        <div style="display: flex; gap: var(--space-md); justify-content: center;">
          <Link href="/" class="btn btn-primary">
            Get Started
          </Link>
          <Link href="/counter" class="btn btn-secondary">
            Try the Demo
          </Link>
        </div>
      </section>
    </>
  )
}
