import type { AdapterBuildOptions } from '../types'

/**
 * Validate that SSR-mode adapter build inputs exist before copying.
 * Throws with a clear error message if directories are missing.
 *
 * SSG-mode passes through unchanged — the SSG branch doesn't need a
 * server entry (every page is prerendered) and `outDir` IS the dist
 * directory the SSG plugin already populated. Validating it here would
 * be redundant.
 *
 * @internal
 */
export async function validateBuildInputs(options: AdapterBuildOptions): Promise<void> {
  if (options.kind !== 'ssr') return
  const { existsSync } = await import('node:fs')
  if (!existsSync(options.clientOutDir)) {
    throw new Error(
      `[Pyreon] Client build output not found: ${options.clientOutDir}. Run "vite build" first.`,
    )
  }
  if (!existsSync(options.serverEntry)) {
    throw new Error(
      `[Pyreon] Server entry not found: ${options.serverEntry}. Run "vite build --ssr" first.`,
    )
  }
}
