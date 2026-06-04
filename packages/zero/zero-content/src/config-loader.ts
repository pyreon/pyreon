import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ContentConfig } from './types'

// ─── content.config.ts loader ─────────────────────────────────────────────
//
// Loads the user's `content.config.ts` (or `.js` / `.mjs`) at build time.
// Used by the Vite plugin in `configResolved` so the rest of the plugin
// has the collection map ready before any `.md` file is transformed.
//
// Resolution: walks for the FIRST matching file under `<root>`:
//   1. content.config.ts
//   2. content.config.mts
//   3. content.config.js
//   4. content.config.mjs
//
// Returns `null` when no config is found — apps without collections
// still work for the markdown pipeline + virtual:zero-content/components,
// but `getCollection` will throw.

const CANDIDATE_FILES = [
  'content.config.ts',
  'content.config.mts',
  'content.config.js',
  'content.config.mjs',
]

export interface LoadedConfig {
  config: ContentConfig
  /** Absolute path to the loaded config file. Used for HMR + sourcemap. */
  configFile: string
}

/**
 * Locate `content.config.{ts,mts,js,mjs}` under `<root>`. Returns the
 * absolute path of the first match, or `null` when none exist.
 *
 * @internal exported for testing
 */
export async function findConfigFile(root: string): Promise<string | null> {
  for (const candidate of CANDIDATE_FILES) {
    const abs = path.join(root, candidate)
    try {
      const stat = await fs.stat(abs)
      if (stat.isFile()) return abs
    } catch {
      // Not present — try the next candidate.
    }
  }
  return null
}

/**
 * Load + validate the user's `content.config.{ts,...}`. Returns the
 * config object PLUS the resolved file path (for HMR).
 *
 * For `.ts` / `.mts` files we route through Vite's `ssrLoadModule` to
 * apply the user's transforms (TypeScript, esbuild, etc.). For `.js` /
 * `.mjs` files we use direct dynamic `import()`.
 *
 * Throws when the config file exists but has no default export, or
 * when the default export is missing a `collections` map.
 */
export async function loadConfig(
  root: string,
  // Vite's ssrLoadModule is the canonical TS loader, but threading the
  // dev-server reference into a node-only helper is ergonomically
  // poor. The plugin passes a loader callback instead so this module
  // stays SSR-loader-agnostic.
  loader: (file: string) => Promise<{ default?: unknown }>,
): Promise<LoadedConfig | null> {
  const configFile = await findConfigFile(root)
  if (configFile === null) return null
  const mod = await loader(configFile)
  if (!mod.default) {
    throw new Error(
      `[@pyreon/zero-content] ${path.relative(root, configFile)} has no default export. Export your defineConfig({...}) result as default.`,
    )
  }
  const config = mod.default
  validateConfigShape(config, configFile, root)
  return { config: config as ContentConfig, configFile }
}

/**
 * Sanity-check the config object's shape. Doesn't run zod schemas —
 * just the structural assertions any consumer would expect.
 *
 * @internal exported for testing
 */
export function validateConfigShape(
  config: unknown,
  configFile: string,
  root: string,
): asserts config is ContentConfig {
  const where = path.relative(root, configFile)
  if (config === null || typeof config !== 'object') {
    throw new Error(
      `[@pyreon/zero-content] ${where}: defineConfig must return an object.`,
    )
  }
  const collections = (config as { collections?: unknown }).collections
  if (
    collections === null ||
    typeof collections !== 'object' ||
    Array.isArray(collections)
  ) {
    throw new Error(
      `[@pyreon/zero-content] ${where}: defineConfig must include a "collections" map.`,
    )
  }
  for (const [name, def] of Object.entries(collections)) {
    if (def === null || typeof def !== 'object') {
      throw new Error(
        `[@pyreon/zero-content] ${where}: collection "${name}" must be a defineCollection({...}) call.`,
      )
    }
    const type = (def as { type?: unknown }).type
    if (type !== 'pages' && type !== 'data') {
      throw new Error(
        `[@pyreon/zero-content] ${where}: collection "${name}" has invalid type "${String(type)}"; expected 'pages' or 'data'.`,
      )
    }
    if (!(def as { schema?: unknown }).schema) {
      throw new Error(
        `[@pyreon/zero-content] ${where}: collection "${name}" is missing a schema.`,
      )
    }
  }
}

/**
 * Default-import a node-loadable config file via `import()`. Used as the
 * fallback loader when no SSR-aware loader is supplied (tests, scripts).
 *
 * Bun's dynamic-import resolver only accepts absolute file URLs OR paths
 * RELATIVE to the calling module — never an absolute path with a
 * `file://` scheme that points outside the workspace. Use the URL form
 * for Node compatibility and let the runtime resolve.
 *
 * @internal exported for testing
 */
export async function defaultLoader(
  file: string,
): Promise<{ default?: unknown }> {
  // `pathToFileURL` produces a `file://` URL Node accepts natively. Bun
  // accepts the same shape via its esm import path.
  const url = pathToFileURL(file).href
  return (await import(/* @vite-ignore */ url)) as { default?: unknown }
}
