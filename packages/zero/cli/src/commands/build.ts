import { resolve } from 'node:path'
import { build as viteBuild } from 'vite'

/**
 * `zero build` — run the full production build.
 *
 * ONE Vite build, ONE owner. The `zero()` plugin chain from the
 * project's `vite.config.ts` owns the ENTIRE production pipeline:
 *
 *   - client bundle → `dist/` (the project's `build.outDir`)
 *   - SSR/ISR: server bundle → `dist/server/entry-server.js` (user
 *     `src/entry-server.ts` when present, synthetic entry otherwise) +
 *     `dist/server/template.html` (the built client index.html — the
 *     production SSR template with hashed asset refs)
 *   - SSG (+ hybrid static-first routes): prerendered per-route HTML
 *   - deploy-adapter staging (node / bun / static / vercel /
 *     cloudflare / netlify) into the same `dist/` tree
 *
 * This command is therefore exactly `vite build` — it exists for the
 * scaffolded `bun run build` script and symmetric CLI UX (`zero dev` /
 * `zero build` / `zero preview`), not to add build steps.
 *
 * HISTORY (the 0.43.x defect this shape fixes): the CLI used to run a
 * SECOND owner on top of the plugin — its own `vite build --ssr` pass
 * to `dist/server`, its own prerender pass, and its own
 * `adapter.build()` into `dist/output`, each in a bare swallow-all
 * `catch`. Result: the SSR bundle was built twice into divergent
 * trees, the CLI's `dist/output` staged a server bundle WITHOUT
 * `template.html` (a deployed `dist/output` server fell back to the
 * DEV template + `/src/entry-client.ts` → server-rendered but never
 * hydrated in production), zero-config apps (no user
 * `src/entry-server.ts`) got NO `dist/server` at all, and every one of
 * those failures was swallowed into a green "Build completed" — the
 * catalogued "silent-filter" anti-pattern. The plugin's post-step is
 * the battle-tested path (verify-modes + the ssr-node/isr-node/ssg-*
 * e2e gates exercise it), so the CLI now delegates to it entirely.
 *
 * Failure surfacing: `viteBuild` rejects on any plugin failure —
 * including an explicitly-configured adapter whose `build()` threw
 * (the zero plugins rethrow those; auto-selected adapters stay
 * non-fatal) — and `build()` reports it + exits non-zero.
 *
 * There is deliberately NO `--mode` flag anymore: the render mode
 * comes from `zero({ mode })` in `vite.config.ts` (the plugin
 * instances are constructed from that file — a CLI flag structurally
 * cannot reach them, and the old flag only gated the CLI's own
 * now-deleted duplicate passes while the plugin ran its configured
 * mode regardless).
 */
export async function build(root: string | undefined) {
  try {
    await runBuild(root)
  } catch (error) {
    console.error('Build failed:', (error as Error).message)
    process.exit(1)
  }
}

/** @internal Exported for tests — same pipeline, rejects instead of exiting. */
export async function runBuild(root: string | undefined) {
  const projectRoot = resolve(root ?? '.')
  const start = performance.now()

  await viteBuild({ root: projectRoot })

  const elapsed = Math.round(performance.now() - start)
  console.log(`Build completed in ${elapsed}ms`)
}
