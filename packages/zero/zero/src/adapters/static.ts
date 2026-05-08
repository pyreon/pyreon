import type { Adapter, AdapterBuildOptions, AdapterRevalidateResult } from '../types'

/**
 * Static adapter — just copies the client build output.
 * Used with SSG mode where all pages are pre-rendered at build time.
 *
 * **SSG mode (PR J)**: no-op — `outDir` already IS the dist directory
 * the SSG plugin produced. Copying it onto itself would only fail. The
 * static adapter is the canonical zero-overhead deploy target for
 * pure-static sites.
 *
 * **SSR mode**: copies clientOutDir → outDir. Calling `static` with SSR
 * mode is unusual — the static adapter doesn't support server-side
 * execution — but preserved as a "client-only output packager".
 */
export function staticAdapter(): Adapter {
  return {
    name: 'static',
    async build(options: AdapterBuildOptions) {
      if (options.kind === 'ssg') {
        // SSG dist is already at outDir — nothing to copy or rewrite.
        return
      }
      const { cp, mkdir } = await import('node:fs/promises')

      await mkdir(options.outDir, { recursive: true })
      await cp(options.clientOutDir, options.outDir, { recursive: true })
    },
    async revalidate(_path: string): Promise<AdapterRevalidateResult> {
      // Static hosts have no platform-driven ISR. Revalidation requires
      // a full rebuild + redeploy. Returns `regenerated: false` so user
      // code can branch on the no-op shape and degrade gracefully when
      // migrating between adapters.
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[Pyreon] staticAdapter.revalidate() is a no-op — static hosts require a full rebuild + redeploy to refresh prerendered pages. Use vercelAdapter / cloudflareAdapter / netlifyAdapter for platform-driven ISR.',
        )
      }
      return { regenerated: false }
    },
  }
}
