import { resolve } from "node:path"
import type { UserConfig } from "vite"

const root = import.meta.dirname

const corePackages = [
  "compiler",
  "core",
  "head",
  "reactivity",
  "router",
  "runtime-dom",
  "runtime-server",
  "server",
] as const

const toolsPackages = [
  "cli",
  "mcp",
  "preact-compat",
  "react-compat",
  "solid-compat",
  "vite-plugin",
  "storybook",
  "vue-compat",
] as const

const fundamentalsPackages = [
  "charts",
  "code",
  "document",
  "feature",
  "flow",
  "form",
  "hotkeys",
  "i18n",
  "machine",
  "permissions",
  "query",
  "state-tree",
  "storage",
  "store",
  "table",
  "validation",
  "virtual",
] as const

const uiPackages = [
  "attrs",
  "connector-document",
  "coolgrid",
  "document-primitives",
  "elements",
  "hooks",
  "kinetic",
  "kinetic-presets",
  "rocketstyle",
  "styler",
  "ui-core",
  "unistyle",
] as const

// Subpath exports must come BEFORE their parent package to avoid prefix matching.
// Vite resolves aliases in array order — first match wins.
type AliasEntry = { find: string | RegExp; replacement: string }
const alias: AliasEntry[] = []

// Subpath exports (must be first — exact match before prefix match on parent)
const subpaths: [string, string][] = [
  ["@pyreon/core/jsx-runtime", "packages/core/core/src/jsx-runtime.ts"],
  ["@pyreon/core/jsx-dev-runtime", "packages/core/core/src/jsx-dev-runtime.ts"],
  ["@pyreon/head/ssr", "packages/core/head/src/ssr.ts"],
  ["@pyreon/server/client", "packages/core/server/src/client.ts"],
  ["@pyreon/preact-compat/hooks", "packages/tools/preact-compat/src/hooks.ts"],
  ["@pyreon/preact-compat/signals", "packages/tools/preact-compat/src/signals.ts"],
  ["@pyreon/react-compat/dom", "packages/tools/react-compat/src/dom.ts"],
  ["@pyreon/storybook/preset", "packages/tools/storybook/src/preset.ts"],
  ["@pyreon/storybook/preview", "packages/tools/storybook/src/preview.ts"],
  ["@pyreon/validation/zod", "packages/fundamentals/validation/src/zod.ts"],
  ["@pyreon/validation/valibot", "packages/fundamentals/validation/src/valibot.ts"],
  ["@pyreon/validation/arktype", "packages/fundamentals/validation/src/arktype.ts"],
  ["@pyreon/charts/manual", "packages/fundamentals/charts/src/manual.ts"],
]
for (const [find, replacement] of subpaths) {
  alias.push({ find, replacement: resolve(root, replacement) })
}

// Package-level aliases (index.ts)
for (const pkg of corePackages) {
  alias.push({ find: `@pyreon/${pkg}`, replacement: resolve(root, `packages/core/${pkg}/src/index.ts`) })
}
for (const pkg of toolsPackages) {
  alias.push({ find: `@pyreon/${pkg}`, replacement: resolve(root, `packages/tools/${pkg}/src/index.ts`) })
}
for (const pkg of fundamentalsPackages) {
  alias.push({ find: `@pyreon/${pkg}`, replacement: resolve(root, `packages/fundamentals/${pkg}/src/index.ts`) })
}
for (const pkg of uiPackages) {
  alias.push({ find: `@pyreon/${pkg}`, replacement: resolve(root, `packages/ui-system/${pkg}/src/index.ts`) })
}

export const sharedConfig: UserConfig = {
  resolve: { alias, conditions: ["bun"] },
}
