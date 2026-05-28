// webServer entry helpers — the per-config `webServer` array is the one
// genuinely-varying part of each Playwright config (port, package filter,
// build/serve shape). `definePlaywrightConfig` injects the shared bits
// (`reuseExistingServer`, default timeout); these helpers build the
// `command` for the recurring shapes so individual configs don't re-spell
// the `bun run --filter=… dev -- --port … --strictPort` template.

/**
 * A Playwright `webServer` entry, minus the boilerplate
 * (`reuseExistingServer`, default `timeout`) that
 * {@link definePlaywrightConfig} injects.
 */
export interface E2eWebServer {
  /** Shell command that boots the server (stays alive). */
  command: string
  /** Port Playwright waits on before running specs. */
  port: number
  /** Working directory for `command` (rarely needed — only the bespoke
   * `node …/vite` boots use it). Relative to the repo root. */
  cwd?: string
  /** Boot timeout in ms. Default `120_000`; build-then-serve shapes
   * (SSG) typically need `180_000`. */
  timeout?: number
  /** Extra environment variables for the server process (e.g. the
   * zero-hmr gate's `PYREON_HMR_TEST` flag). */
  env?: Record<string, string>
}

/**
 * The dominant webServer shape (8 of the repo's configs):
 * `bun run --filter=<filter> dev -- --port <port> --strictPort`.
 *
 * `--strictPort` makes Vite fail fast on a taken port instead of silently
 * picking another (which would route specs to the wrong / a stale server).
 * Pass `strictPort: false` for the few configs that deliberately omit it.
 *
 * @param filter  the `bun run --filter` target — the FULL workspace name
 *                (e.g. `@pyreon/playground`, `cpa-pw-app`); naming is not
 *                uniform across examples, so it's passed verbatim.
 */
export function viteDevServer(
  filter: string,
  port: number,
  opts: { strictPort?: boolean; timeout?: number } = {},
): E2eWebServer {
  const strict = opts.strictPort !== false
  return {
    command: `bun run --filter=${filter} dev -- --port ${port}${strict ? ' --strictPort' : ''}`,
    port,
    ...(opts.timeout !== undefined ? { timeout: opts.timeout } : {}),
  }
}
