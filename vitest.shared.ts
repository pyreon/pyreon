import { resolve } from "node:path"
import type { UserConfig } from "vite"

const root = import.meta.dirname

const packages = [
  "compiler",
  "core",
  "head",
  "model",
  "preact-compat",
  "react-compat",
  "reactivity",
  "router",
  "runtime-dom",
  "runtime-server",
  "server",
  "solid-compat",
  "store",
  "vite-plugin",
  "vue-compat",
] as const

const alias: Record<string, string> = {}
for (const pkg of packages) {
  alias[`@pyreon/${pkg}`] = resolve(root, `packages/${pkg}/src/index.ts`)
}

// Also map subpath exports
alias["@pyreon/core/jsx-runtime"] = resolve(root, "packages/core/src/jsx-runtime.ts")
alias["@pyreon/core/jsx-dev-runtime"] = resolve(root, "packages/core/src/jsx-dev-runtime.ts")
alias["@pyreon/preact-compat/hooks"] = resolve(root, "packages/preact-compat/src/hooks.ts")
alias["@pyreon/preact-compat/signals"] = resolve(root, "packages/preact-compat/src/signals.ts")
alias["@pyreon/react-compat/dom"] = resolve(root, "packages/react-compat/src/dom.ts")
alias["@pyreon/server/client"] = resolve(root, "packages/server/src/client.ts")

export const sharedConfig: UserConfig = {
  resolve: { alias },
}
