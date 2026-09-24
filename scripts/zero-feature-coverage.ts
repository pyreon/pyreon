/**
 * Registry: every feature documented in `docs/src/content/docs/zero.md` →
 * the REAL-BUILD test that exercises it.
 *
 * Why: most of the 2026-09 zero audit findings (actions that could never
 * work, config that never reached the server, ISR that never cached) hid
 * in features that were documented, typed and unit-tested but never run
 * through a built app. A unit test calls the exported function; this
 * registry insists on a test that runs what users deploy — an e2e spec or
 * a `scripts/verify-modes.ts` cell.
 *
 * Keys are the doc's `##`/`###`/`####` heading texts, verbatim. The gate
 * (`scripts/check-zero-feature-coverage.ts`) fails when:
 *   - a heading is in neither this registry nor the uncovered allowlist
 *     (`scripts/zero-feature-uncovered.json`) nor `NON_FEATURE_SECTIONS`;
 *   - a registry entry names a spec/cell that does not exist, or whose
 *     `evidence` string does not appear in it (a moved/deleted assertion);
 *   - a registry key or allowlist key no longer matches a heading (stale);
 *   - a feature is both covered and allowlisted (move it out — the
 *     allowlist can only shrink);
 *   - the allowlist grew relative to `origin/main` (ratchet).
 *
 * `evidence` is a substring that must occur in the named file — for an e2e
 * spec, pick text from the test title or its key assertion, so deleting the
 * test (not just the file) fails the gate.
 */

export type Coverage =
  | {
      kind: 'e2e'
      /** Repo-relative spec path. */
      spec: string
      /** Substring that must appear in the spec. */
      evidence: string
    }
  | {
      kind: 'verify-modes'
      /** `examples/<example>` of the cell. */
      example: string
      /** The cell's `mode`. */
      mode: 'ssr' | 'ssg' | 'spa' | 'isr' | 'auto'
      /** Substring that must appear in `scripts/verify-modes.ts`. */
      evidence: string
    }

/**
 * Headings that are documentation STRUCTURE, not a feature a user could
 * observe being broken — a container whose children are features, install
 * prose, or an index. Each carries the reason it is exempt.
 */
export const NON_FEATURE_SECTIONS: Record<string, string> = {
  Installation: 'install instructions',
  'Quick Start': 'walkthrough; every step is a feature covered below',
  Configuration: 'container; options are covered individually',
  'ZeroConfig Options': 'index table of options; each option is its own feature below',
  'Rendering Modes': 'container of the SSR/SSG/SPA/ISR subsections',
  Components: 'container of Link/Image/Script/Icon/Meta',
  'Environment Variables': 'container of the env subsections',
  'App Assembly APIs': 'container of createApp/createServer/startClient',
  'Why you would want it': 'prose under HTTPS in Development',
  Options: 'option table under HTTPS in Development',
  'Where the certificate comes from': 'prose under HTTPS in Development',
  'Custom domains': 'prose under HTTPS in Development',
  Limits: 'prose under HTTPS in Development',
  'Subpath Exports': 'index table of entry points',
  'Next Steps': 'links',
}

export const ZERO_FEATURE_COVERAGE: Record<string, Coverage> = {
  'Client-Safe vs Server-Only Entry Points': {
    kind: 'e2e',
    spec: 'e2e/ssr-node.spec.ts',
    evidence: 'the client bundle excludes it',
  },
  'Build Output': {
    kind: 'verify-modes',
    example: 'ssr-showcase',
    mode: 'ssr',
    evidence: "join(dist, 'server', 'entry-server.js')",
  },
  'File-System Routing': {
    kind: 'e2e',
    spec: 'e2e/ssr-node.spec.ts',
    evidence: 'dynamic [id] route',
  },
  'Special Files': {
    kind: 'e2e',
    spec: 'e2e/ssr-showcase.spec.ts',
    evidence: 'runtime SSR 404 wraps not-found in layout chrome',
  },
  'Route Module Exports': {
    kind: 'e2e',
    spec: 'e2e/ssr-node.spec.ts',
    evidence: 'is server-rendered FROM ITS LOADER',
  },
  'Loader Context': {
    kind: 'e2e',
    spec: 'e2e/cpa-dash.spec.ts',
    evidence: 'redirect(url, 308) preserves the custom permanent-redirect status',
  },
  'SSR (Server-Side Rendering)': {
    kind: 'e2e',
    spec: 'e2e/ssr-node.spec.ts',
    evidence: 'is SERVER-RENDERED, not the empty template shell',
  },
  'SSG (Static Site Generation)': {
    kind: 'e2e',
    spec: 'e2e/ssg-subpath.spec.ts',
    evidence: 'renders home page without console errors',
  },
  'SPA (Single-Page Application)': {
    kind: 'verify-modes',
    example: 'app-showcase',
    mode: 'spa',
    evidence: "example: 'app-showcase'",
  },
  'ISR (Incremental Static Regeneration — runtime)': {
    kind: 'e2e',
    spec: 'e2e/isr-node.spec.ts',
    evidence: 'second request is a HIT',
  },
  'Per-route render modes (hybrid rendering)': {
    kind: 'verify-modes',
    example: 'ssr-showcase',
    mode: 'ssr',
    evidence: "join(dist, 'hybrid-spa', 'index.html')",
  },
  'Server Islands': {
    kind: 'e2e',
    spec: 'e2e/ssr-node.spec.ts',
    evidence: 'server island: the PAGE carries only the marker',
  },
  'Server Loaders': {
    kind: 'e2e',
    spec: 'e2e/ssr-node.spec.ts',
    evidence: 'server loader: SSR runs it in-process',
  },
  Link: {
    kind: 'e2e',
    spec: 'e2e/ssr-node.spec.ts',
    evidence: 'hovering a <Link> warms the route',
  },
  Image: {
    kind: 'e2e',
    spec: 'e2e/ssr-showcase.spec.ts',
    evidence: 'fetchpriority="high"',
  },
  Meta: {
    kind: 'e2e',
    spec: 'e2e/ssr-showcase.spec.ts',
    evidence: 'meta tags in source',
  },
  'Theme System': {
    kind: 'e2e',
    spec: 'e2e/ssr-showcase.spec.ts',
    evidence: 'theme toggle changes data-theme',
  },
  Middleware: {
    kind: 'e2e',
    spec: 'e2e/ssr-node.spec.ts',
    evidence: 'route middleware gates the page',
  },
  'API Routes': {
    kind: 'e2e',
    spec: 'e2e/ssr-node.spec.ts',
    evidence: 'an API POST reaches its handler with its body',
  },
  SEO: {
    kind: 'e2e',
    spec: 'e2e/ssg-i18n.spec.ts',
    evidence: 'hreflang sitemap.xml',
  },
  'Font Optimization': {
    kind: 'e2e',
    spec: 'e2e/ssr-showcase.spec.ts',
    evidence: 'font preloads are present in the initial HTML response',
  },
  '`usePreloadFont` — per-route runtime preload': {
    kind: 'e2e',
    spec: 'e2e/ssr-showcase.spec.ts',
    evidence: 'two usePreloadFont calls with the same href emit ONE preload',
  },
  'Public env — `publicEnv()` (works in the browser)': {
    kind: 'e2e',
    spec: 'e2e/public-env.spec.ts',
    evidence: 'ZERO_PUBLIC_ value reaches the browser',
  },
  createApp: {
    kind: 'e2e',
    spec: 'e2e/ssr-node.spec.ts',
    evidence: 'hydrates + client-side navigation works',
  },
  createServer: {
    kind: 'e2e',
    spec: 'e2e/ssr-node.spec.ts',
    evidence: 'is SERVER-RENDERED, not the empty template shell',
  },
  startClient: {
    kind: 'e2e',
    spec: 'e2e/zero-islands.spec.ts',
    evidence: 'hydrates with no manual wiring',
  },
  'Base Path': {
    kind: 'e2e',
    spec: 'e2e/ssg-subpath.spec.ts',
    evidence: 'asset URLs are served correctly under /blog/ prefix',
  },
  'Deployment Adapters': {
    kind: 'verify-modes',
    example: 'ssr-showcase',
    mode: 'ssr',
    evidence: "assertSsrFunctionRenders(dist, '_worker.js', 'cloudflare')",
  },
  'SSR/ISR build': {
    kind: 'e2e',
    spec: 'e2e/isr-node.spec.ts',
    evidence: 'GET / is server-rendered and cache-consistent across requests',
  },
  'ISR Handler (runtime)': {
    kind: 'e2e',
    spec: 'e2e/isr-node.spec.ts',
    evidence: 'the ISR cache is actually active',
  },
  'HTTPS in Development': {
    kind: 'e2e',
    spec: 'e2e/https-dev.spec.ts',
    evidence: 'serves over TLS and the browser reports a secure context',
  },
  i18n: {
    kind: 'e2e',
    spec: 'e2e/ssg-i18n.spec.ts',
    evidence: 'non-default-locale path /de/about renders the duplicated route',
  },
}
