import type { Adapter, AdapterBuildOptions, AdapterRevalidateResult } from '../types'

/**
 * Static adapter — just copies the client build output.
 * Used with SSG mode where all pages are pre-rendered at build time.
 */
export function staticAdapter(): Adapter {
  return {
    name: 'static',
    async build(options: AdapterBuildOptions) {
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
