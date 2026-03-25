import { existsSync } from "node:fs"
import { resolve } from "node:path"
import pyreon from "@pyreon/vite-plugin"
import type { Plugin } from "vite"
import { defineConfig } from "vite"

const pkgs = resolve(__dirname, "../../packages")
const framework = resolve(__dirname, "../../../pyreon/packages")

// Map workspace UI packages to their TypeScript source
const uiPackages = [
  "attrs",
  "coolgrid",
  "elements",
  "hooks",
  "kinetic",
  "kinetic-presets",
  "rocketstyle",
  "styler",
  "ui-core",
  "unistyle",
]

// Map framework packages to their built lib (avoids bun condition → raw .ts)
const frameworkPackages = ["core", "reactivity", "runtime-dom"]

const alias = [
  // JSX runtime — must be before @pyreon/core to avoid prefix match
  {
    find: "@pyreon/core/jsx-runtime",
    replacement: resolve(framework, "core/dist/jsx-runtime.js"),
  },
  {
    find: "@pyreon/core/jsx-dev-runtime",
    replacement: resolve(framework, "core/dist/jsx-dev-runtime.js"),
  },
  // UI workspace packages → TypeScript source
  ...uiPackages.map((pkg) => ({
    find: `@pyreon/${pkg}`,
    replacement: resolve(pkgs, `${pkg}/src/index.ts`),
  })),
  // Framework packages → built lib (avoids bun condition → raw .ts with syntax errors)
  ...frameworkPackages.map((pkg) => ({
    find: `@pyreon/${pkg}`,
    replacement: resolve(framework, `${pkg}/lib/index.js`),
  })),
]

/**
 * Resolve `~/...` imports within workspace packages.
 * Each package uses `~` as an alias for its own `src/` directory.
 */
const extensions = [".ts", ".tsx", "/index.ts", "/index.tsx", ""]

function tildePaths(): Plugin {
  return {
    name: "tilde-paths",
    resolveId(source, importer) {
      if (!source.startsWith("~/") || !importer) return null
      const parts = importer.split("/src/")
      if (parts.length < 2) return null
      const base = resolve(`${parts[0]}/src`, source.slice(2))
      for (const ext of extensions) {
        const candidate = `${base}${ext}`
        if (existsSync(candidate)) return candidate
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [tildePaths(), pyreon()],
  resolve: { alias },
})
