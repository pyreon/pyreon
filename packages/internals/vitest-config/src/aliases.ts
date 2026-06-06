import { resolve } from 'node:path'

/**
 * Pyreon workspace alias map. Resolves every `@pyreon/*` (and subpath
 * exports) to the package's `src/index.ts` under the `bun` condition.
 *
 * Subpath exports come BEFORE their parent package — Vite resolves
 * aliases in array order, first match wins. Reordering would silently
 * break subpath consumers (e.g. `@pyreon/core/jsx-runtime` would resolve
 * to the package root, not the JSX runtime).
 */

const corePackages = [
  'compiler',
  'core',
  'head',
  'reactivity',
  'router',
  'runtime-dom',
  'runtime-server',
  'server',
] as const

const toolsPackages = [
  'cli',
  'lint',
  'mcp',
  'preact-compat',
  'react-compat',
  'solid-compat',
  'vite-plugin',
  'storybook',
  'vue-compat',
] as const

const fundamentalsPackages = [
  'charts',
  'code',
  'dnd',
  'document',
  'feature',
  'flow',
  'form',
  'hooks',
  'hotkeys',
  'i18n',
  'machine',
  'permissions',
  'query',
  'rx',
  'state-tree',
  'storage',
  'store',
  'table',
  'toast',
  'validation',
  'url-state',
  'virtual',
] as const

const uiPackages = [
  'attrs',
  'connector-document',
  'coolgrid',
  'document-primitives',
  'elements',
  'kinetic',
  'kinetic-presets',
  'rocketstyle',
  'styler',
  'ui-core',
  'unistyle',
] as const

const uiLibPackages = ['ui-theme', 'ui-primitives', 'ui-components'] as const

const zeroPackages = ['zero', 'meta'] as const

export type AliasEntry = { find: string | RegExp; replacement: string }

/**
 * Build the alias array. `repoRoot` is the absolute path to the monorepo
 * root — every alias replacement is resolved against it. The root is a
 * parameter (not a module-load-time constant) so the package works under
 * both the workspace `bun` condition (loaded from src) and future build
 * artifacts (loaded from lib) without needing a build-time path bake.
 */
export function buildAliases(repoRoot: string): AliasEntry[] {
  const alias: AliasEntry[] = []

  // Subpath exports must come BEFORE their parent package to avoid prefix
  // matching. Vite resolves aliases in array order — first match wins.
  const subpaths: [string, string][] = [
    ['@pyreon/core/jsx-runtime', 'packages/core/core/src/jsx-runtime.ts'],
    ['@pyreon/core/jsx-dev-runtime', 'packages/core/core/src/jsx-dev-runtime.ts'],
    ['@pyreon/head/ssr', 'packages/core/head/src/ssr.ts'],
    ['@pyreon/server/client', 'packages/core/server/src/client.ts'],
    ['@pyreon/zero/server', 'packages/zero/zero/src/server.ts'],
    ['@pyreon/zero/client', 'packages/zero/zero/src/client.ts'],
    ['@pyreon/preact-compat/hooks', 'packages/tools/preact-compat/src/hooks.ts'],
    ['@pyreon/preact-compat/signals', 'packages/tools/preact-compat/src/signals.ts'],
    ['@pyreon/react-compat/dom', 'packages/tools/react-compat/src/dom.ts'],
    ['@pyreon/storybook/preset', 'packages/tools/storybook/src/preset.ts'],
    ['@pyreon/storybook/preview', 'packages/tools/storybook/src/preview.ts'],
    ['@pyreon/validation/zod', 'packages/fundamentals/validation/src/zod.ts'],
    ['@pyreon/validation/valibot', 'packages/fundamentals/validation/src/valibot.ts'],
    ['@pyreon/validation/arktype', 'packages/fundamentals/validation/src/arktype.ts'],
    ['@pyreon/charts/manual', 'packages/fundamentals/charts/src/manual.ts'],
    ['@pyreon/i18n/core', 'packages/fundamentals/i18n/src/core.ts'],
  ]
  for (const [find, replacement] of subpaths) {
    alias.push({ find, replacement: resolve(repoRoot, replacement) })
  }

  for (const pkg of corePackages) {
    alias.push({
      find: `@pyreon/${pkg}`,
      replacement: resolve(repoRoot, `packages/core/${pkg}/src/index.ts`),
    })
  }
  for (const pkg of toolsPackages) {
    alias.push({
      find: `@pyreon/${pkg}`,
      replacement: resolve(repoRoot, `packages/tools/${pkg}/src/index.ts`),
    })
  }
  for (const pkg of fundamentalsPackages) {
    alias.push({
      find: `@pyreon/${pkg}`,
      replacement: resolve(repoRoot, `packages/fundamentals/${pkg}/src/index.ts`),
    })
  }
  for (const pkg of uiPackages) {
    alias.push({
      find: `@pyreon/${pkg}`,
      replacement: resolve(repoRoot, `packages/ui-system/${pkg}/src/index.ts`),
    })
  }
  for (const pkg of uiLibPackages) {
    const shortName = pkg.replace('ui-', '')
    alias.push({
      find: `@pyreon/${pkg}`,
      replacement: resolve(repoRoot, `packages/ui/${shortName}/src/index.ts`),
    })
  }
  for (const pkg of zeroPackages) {
    alias.push({
      find: `@pyreon/${pkg}`,
      replacement: resolve(repoRoot, `packages/zero/${pkg}/src/index.ts`),
    })
  }

  return alias
}
