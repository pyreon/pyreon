import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"

export const meta = {
  title: "Pyreon Zero",
  description: "The signal-based meta-framework. Build fast, stay fast.",
}

export default function Home() {
  useHead({
    title: "Pyreon Zero — The Signal-Based Meta-Framework",
    meta: [{ name: "description", content: meta.description }],
  })

  return (
    <>
      <section class="hero">
        <span class="badge">Open Source</span>
        <h1>
          Build fast.
          <br />
          <span class="gradient">Stay fast.</span>
        </h1>
        <p>
          Pyreon Zero is a signal-based full-stack framework powered by Vite. File-based routing,
          SSR, SSG, ISR — everything you need, nothing you don't.
        </p>
        <div class="hero-actions">
          <Link href="/counter" class="btn btn-primary">
            See it in action
          </Link>
          <a
            href="https://github.com/pyreon/zero"
            class="btn btn-secondary"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>

        <div class="code-block">
          <div class="code-block-header">
            <span>terminal</span>
          </div>
          <pre>
            <code>
              <span class="cm"># Create a new project in seconds</span>
              <span class="fn">bun</span> create zero my-app
              <span class="fn">cd</span> my-app
              <span class="fn">bun</span> install
              <span class="fn">bun</span> run dev
            </code>
          </pre>
        </div>
      </section>

      <section class="features">
        <div class="card feature">
          <div class="feature-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <h3>Signal-Based Reactivity</h3>
          <p>
            Fine-grained reactivity with zero virtual DOM overhead. Only the exact DOM nodes that
            need updating are touched.
          </p>
        </div>

        <div class="card feature">
          <div class="feature-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <h3>File-Based Routing</h3>
          <p>
            Drop a file in <code>src/routes/</code> and it's a route. Layouts, dynamic params,
            catch-alls, and route groups built in.
          </p>
        </div>

        <div class="card feature">
          <div class="feature-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <h3>SSR / SSG / ISR / SPA</h3>
          <p>
            Every rendering strategy out of the box. Per-route overrides let you mix SSR pages with
            static marketing pages.
          </p>
        </div>

        <div class="card feature">
          <div class="feature-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </div>
          <h3>Font & Image Optimization</h3>
          <p>
            Automatic Google Fonts inlining, font-display swap, and an <code>{"<Image>"}</code>{" "}
            component with lazy loading and blur-up placeholders.
          </p>
        </div>

        <div class="card feature">
          <div class="feature-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h3>Smart Caching & Security</h3>
          <p>
            Built-in middleware for immutable asset caching, stale-while-revalidate, security
            headers, and compression hints.
          </p>
        </div>

        <div class="card feature">
          <div class="feature-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <h3>Deploy Anywhere</h3>
          <p>
            Adapters for Node, Bun, Vercel, Cloudflare, and Netlify. Or export as a fully static
            site.
          </p>
        </div>
      </section>

      <section style="text-align: center; margin-top: var(--space-3xl); padding-bottom: var(--space-xl);">
        <h2 style="font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: var(--space-sm);">
          Ready to build?
        </h2>
        <p style="color: var(--c-text-secondary); margin-bottom: var(--space-xl);">
          Explore the demo pages to see Zero's features in action.
        </p>
        <div style="display: flex; gap: var(--space-md); justify-content: center; flex-wrap: wrap;">
          <Link href="/counter" class="btn btn-secondary">
            Signal Reactivity
          </Link>
          <Link href="/posts" class="btn btn-secondary">
            Data Loading
          </Link>
          <Link href="/about" class="btn btn-secondary">
            About Zero
          </Link>
        </div>
      </section>
    </>
  )
}
