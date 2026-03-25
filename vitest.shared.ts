import { resolve } from "node:path"
import type { UserConfig } from "vite"

const root = import.meta.dirname

const corePackages = [
  "cli",
  "compiler",
  "core",
  "head",
  "preact-compat",
  "react-compat",
  "reactivity",
  "router",
  "runtime-dom",
  "runtime-server",
  "server",
  "solid-compat",
  "vite-plugin",
  "vue-compat",
] as const

const toolsPackages = ["mcp"] as const

const alias: Record<string, string> = {}
for (const pkg of corePackages) {
  alias[`@pyreon/${pkg}`] = resolve(root, `packages/core/${pkg}/src/index.ts`)
}
for (const pkg of toolsPackages) {
  alias[`@pyreon/${pkg}`] = resolve(root, `packages/tools/${pkg}/src/index.ts`)
}

// Also map subpath exports
alias["@pyreon/core/jsx-runtime"] = resolve(root, "packages/core/core/src/jsx-runtime.ts")
alias["@pyreon/core/jsx-dev-runtime"] = resolve(root, "packages/core/core/src/jsx-dev-runtime.ts")
alias["@pyreon/preact-compat/hooks"] = resolve(root, "packages/core/preact-compat/src/hooks.ts")
alias["@pyreon/preact-compat/signals"] = resolve(root, "packages/core/preact-compat/src/signals.ts")
alias["@pyreon/react-compat/dom"] = resolve(root, "packages/core/react-compat/src/dom.ts")
alias["@pyreon/server/client"] = resolve(root, "packages/core/server/src/client.ts")

export const sharedConfig: UserConfig = {
  resolve: { alias },
}
