import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build as viteBuild } from 'vite'

export interface BuildOptions {
  mode?: string
}

/** Extract zero plugin config from a Vite config file. */
async function loadZeroConfig(configPath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const { loadConfigFromFile } = await import('vite')
    const { getZeroPluginConfig } = await import('@pyreon/zero/server')
    const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, configPath)
    if (!loaded) return undefined

    const plugins = (loaded.config.plugins ?? []) as Array<{ name?: string }>
    const zeroPlugin = plugins.find(
      (p) => p && typeof p === 'object' && 'name' in p && p.name === 'pyreon-zero',
    )
    if (!zeroPlugin) return undefined
    // `getZeroPluginConfig` reads from a WeakMap keyed by plugin
    // identity (set inside `zeroPlugin()` when the user constructed it).
    // No `_zeroConfig` property reflection — internal coordination state
    // doesn't leak onto the public Plugin object.
    const config = getZeroPluginConfig(zeroPlugin as Parameters<typeof getZeroPluginConfig>[0])
    return config as Record<string, unknown> | undefined
  } catch {
    // Config loading is optional — fall back to defaults
  }
  return undefined
}

/** Run SSG prerendering pass if configured. */
async function prerenderIfNeeded(
  projectRoot: string,
  zeroConfig: Record<string, unknown> | undefined,
) {
  const serverEntry = join(projectRoot, 'dist/server/entry-server.js')
  if (!existsSync(serverEntry)) return

  try {
    const { prerender } = await import('@pyreon/server')
    const serverModule = await import(serverEntry)

    const paths = await resolveSsgPaths(zeroConfig)
    const result = await prerender({
      handler: serverModule.default,
      paths,
      outDir: join(projectRoot, 'dist/client'),
    })

    for (const err of result.errors) {
      console.warn('Prerender error:', err)
    }
  } catch {
    // Prerender is best-effort — build continues without it
  }
}

/** Resolve SSG paths from config (static array or async function). */
async function resolveSsgPaths(zeroConfig: Record<string, unknown> | undefined): Promise<string[]> {
  const ssgConfig = zeroConfig?.ssg as
    | { paths?: string[] | (() => string[] | Promise<string[]>) }
    | undefined
  if (!ssgConfig?.paths) return ['/']
  return typeof ssgConfig.paths === 'function' ? await ssgConfig.paths() : ssgConfig.paths
}

/** Run the deploy adapter build step. */
async function runAdapter(projectRoot: string, zeroConfig: Record<string, unknown>) {
  try {
    const { resolveAdapter } = await import('@pyreon/zero/server')
    const adapter = resolveAdapter(zeroConfig)
    await adapter.build({
      kind: 'ssr',
      serverEntry: join(projectRoot, 'dist/server/entry-server.js'),
      clientOutDir: join(projectRoot, 'dist/client'),
      outDir: join(projectRoot, 'dist/output'),
      config: zeroConfig,
    })
  } catch {
    // Adapter build is optional — output may not need it
  }
}

export async function build(root: string | undefined, options: BuildOptions) {
  try {
    await runBuild(root, options)
  } catch (error) {
    console.error('Build failed:', (error as Error).message)
    process.exit(1)
  }
}

async function runBuild(root: string | undefined, options: BuildOptions) {
  const projectRoot = resolve(root ?? '.')
  const start = performance.now()

  // Load zero config FIRST so we know whether SPA mode applies (which
  // skips the server build — SPA apps have no `entry-server.ts`).
  const configPath = join(projectRoot, 'vite.config.ts')
  const zeroConfig = await loadZeroConfig(configPath)
  const renderMode = (zeroConfig?.mode as string) ?? options.mode ?? 'ssr'

  // Client build
  await viteBuild({
    root: projectRoot,
    build: { outDir: 'dist/client', ssrManifest: true },
  })

  // Server build — skipped for SPA mode (no entry-server.ts), and skipped
  // for any mode when the file doesn't exist (defensive — lets SPA apps
  // not declare the mode explicitly).
  const serverEntryPath = join(projectRoot, 'src/entry-server.ts')
  const hasServerEntry = existsSync(serverEntryPath)
  if (renderMode !== 'spa' && hasServerEntry) {
    await viteBuild({
      root: projectRoot,
      build: {
        outDir: 'dist/server',
        ssr: 'src/entry-server.ts',
        rollupOptions: { input: 'src/entry-server.ts' },
      },
    })
  }

  if (renderMode === 'ssg' || renderMode === 'isr') {
    await prerenderIfNeeded(projectRoot, zeroConfig)
  }

  await runAdapter(projectRoot, zeroConfig ?? {})

  const elapsed = Math.round(performance.now() - start)
  console.log(`Build completed in ${elapsed}ms`)
}
