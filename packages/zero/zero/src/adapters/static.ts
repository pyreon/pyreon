import type { Adapter, AdapterBuildOptions } from "../types"

/**
 * Static adapter — just copies the client build output.
 * Used with SSG mode where all pages are pre-rendered at build time.
 */
export function staticAdapter(): Adapter {
  return {
    name: "static",
    async build(options: AdapterBuildOptions) {
      const { cp, mkdir } = await import("node:fs/promises")

      await mkdir(options.outDir, { recursive: true })
      await cp(options.clientOutDir, options.outDir, { recursive: true })
    },
  }
}
