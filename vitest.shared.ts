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

const alias: Record<string, string> = {}
for (const pkg of corePackages) {
  alias[`@pyreon/${pkg}`] = resolve(root, `packages/core/${pkg}/src/index.ts`)
}
for (const pkg of toolsPackages) {
  alias[`@pyreon/${pkg}`] = resolve(root, `packages/tools/${pkg}/src/index.ts`)
}
for (const pkg of fundamentalsPackages) {
  alias[`@pyreon/${pkg}`] = resolve(root, `packages/fundamentals/${pkg}/src/index.ts`)
}
for (const pkg of uiPackages) {
  alias[`@pyreon/${pkg}`] = resolve(root, `packages/ui-system/${pkg}/src/index.ts`)
}

// Also map subpath exports
alias["@pyreon/core/jsx-runtime"] = resolve(root, "packages/core/core/src/jsx-runtime.ts")
alias["@pyreon/core/jsx-dev-runtime"] = resolve(root, "packages/core/core/src/jsx-dev-runtime.ts")

alias["@pyreon/preact-compat/hooks"] = resolve(root, "packages/tools/preact-compat/src/hooks.ts")
alias["@pyreon/preact-compat/signals"] = resolve(root, "packages/tools/preact-compat/src/signals.ts")
alias["@pyreon/react-compat/dom"] = resolve(root, "packages/tools/react-compat/src/dom.ts")
alias["@pyreon/server/client"] = resolve(root, "packages/core/server/src/client.ts")

// Fundamentals subpath exports
alias["@pyreon/validation/zod"] = resolve(root, "packages/fundamentals/validation/src/zod.ts")
alias["@pyreon/validation/valibot"] = resolve(root, "packages/fundamentals/validation/src/valibot.ts")
alias["@pyreon/validation/arktype"] = resolve(root, "packages/fundamentals/validation/src/arktype.ts")
alias["@pyreon/charts/manual"] = resolve(root, "packages/fundamentals/charts/src/manual.ts")
alias["@pyreon/storybook/preset"] = resolve(root, "packages/tools/storybook/src/preset.ts")
alias["@pyreon/storybook/preview"] = resolve(root, "packages/tools/storybook/src/preview.ts")

export const sharedConfig: UserConfig = {
  resolve: { alias, conditions: ["bun"] },
}
