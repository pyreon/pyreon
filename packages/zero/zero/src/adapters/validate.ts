import type { AdapterBuildOptions } from '../types'

/**
 * Validate that adapter build inputs exist before copying.
 * Throws with a clear error message if directories are missing.
 * @internal
 */
export async function validateBuildInputs(options: AdapterBuildOptions): Promise<void> {
  const { existsSync } = await import('node:fs')
  if (!existsSync(options.clientOutDir)) {
    throw new Error(`[Pyreon] Client build output not found: ${options.clientOutDir}. Run "vite build" first.`)
  }
  if (!existsSync(options.serverEntry)) {
    throw new Error(`[Pyreon] Server entry not found: ${options.serverEntry}. Run "vite build --ssr" first.`)
  }
}
