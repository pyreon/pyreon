import { join } from 'node:path'

/**
 * Load the `zero({ ... })` plugin config from a project's `vite.config.ts`.
 *
 * Reads the plugin via Vite's `loadConfigFromFile`, finds the `pyreon-zero`
 * plugin in the resolved plugins array, and pulls its config via the
 * `getZeroPluginConfig` WeakMap accessor exported from `@pyreon/zero/server`.
 *
 * Returns `undefined` if the config can't be loaded (no vite.config.ts,
 * no zero plugin in the chain, or any failure during load). Callers are
 * expected to fall back to defaults — this is a best-effort surface that
 * lets `zero dev` / `zero preview` honour `zero({ port: N })` without
 * forcing the user to also pass `--port` on the CLI.
 */
export async function loadZeroPluginConfig(
  projectRoot: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const { loadConfigFromFile } = await import('vite')
    const { getZeroPluginConfig } = await import('@pyreon/zero/server')
    const configPath = join(projectRoot, 'vite.config.ts')
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, configPath)
    if (!loaded) return undefined

    const plugins = (loaded.config.plugins ?? []) as Array<{ name?: string }>
    const zeroPlugin = plugins.find(
      (p) => p && typeof p === 'object' && 'name' in p && p.name === 'pyreon-zero',
    )
    if (!zeroPlugin) return undefined
    const config = getZeroPluginConfig(zeroPlugin as Parameters<typeof getZeroPluginConfig>[0])
    return config as Record<string, unknown> | undefined
  } catch {
    return undefined
  }
}

/** Convenience: extract just the `port` field from the loaded plugin config. */
export async function loadZeroConfigPort(projectRoot: string): Promise<number | undefined> {
  const config = await loadZeroPluginConfig(projectRoot)
  const port = config?.port
  return typeof port === 'number' ? port : undefined
}
