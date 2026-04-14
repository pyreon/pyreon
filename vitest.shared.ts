import { resolve } from 'node:path'
// vitest 4.x renamed `UserConfig` → `ViteUserConfig` (the re-export from
// vite). Keeping the local alias name `VitestUserConfig` for stability.
import type { ViteUserConfig as VitestUserConfig } from 'vitest/config'

const root = import.meta.dirname

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

// Subpath exports must come BEFORE their parent package to avoid prefix matching.
// Vite resolves aliases in array order — first match wins.
type AliasEntry = { find: string | RegExp; replacement: string }
const alias: AliasEntry[] = []

// Subpath exports (must be first — exact match before prefix match on parent)
const subpaths: [string, string][] = [
  ['@pyreon/core/jsx-runtime', 'packages/core/core/src/jsx-runtime.ts'],
  ['@pyreon/core/jsx-dev-runtime', 'packages/core/core/src/jsx-dev-runtime.ts'],
  ['@pyreon/head/ssr', 'packages/core/head/src/ssr.ts'],
  ['@pyreon/server/client', 'packages/core/server/src/client.ts'],
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
  alias.push({ find, replacement: resolve(root, replacement) })
}

// Package-level aliases (index.ts)
for (const pkg of corePackages) {
  alias.push({
    find: `@pyreon/${pkg}`,
    replacement: resolve(root, `packages/core/${pkg}/src/index.ts`),
  })
}
for (const pkg of toolsPackages) {
  alias.push({
    find: `@pyreon/${pkg}`,
    replacement: resolve(root, `packages/tools/${pkg}/src/index.ts`),
  })
}
for (const pkg of fundamentalsPackages) {
  alias.push({
    find: `@pyreon/${pkg}`,
    replacement: resolve(root, `packages/fundamentals/${pkg}/src/index.ts`),
  })
}
for (const pkg of uiPackages) {
  alias.push({
    find: `@pyreon/${pkg}`,
    replacement: resolve(root, `packages/ui-system/${pkg}/src/index.ts`),
  })
}
for (const pkg of uiLibPackages) {
  const shortName = pkg.replace('ui-', '')
  alias.push({
    find: `@pyreon/${pkg}`,
    replacement: resolve(root, `packages/ui/${shortName}/src/index.ts`),
  })
}
for (const pkg of zeroPackages) {
  alias.push({
    find: `@pyreon/${pkg}`,
    replacement: resolve(root, `packages/zero/${pkg}/src/index.ts`),
  })
}

export const sharedConfig: VitestUserConfig = {
  resolve: { alias, conditions: ['bun'] },
}

// Packages that also run browser tests via `vitest.browser.config.ts` must
// extend their regular vitest config with this to exclude `.browser.test.*`
// from the default Node/happy-dom runner. Kept separate from `sharedConfig`
// because `mergeConfig` appends array fields, so a shared exclude would leak
// into the browser config and re-exclude the browser tests.
export const nodeExcludeBrowserTests = {
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/lib/**',
      '**/*.browser.test.{ts,tsx}',
    ],
  },
} satisfies VitestUserConfig
