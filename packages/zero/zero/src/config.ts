import type { ZeroConfig } from "./types"

/**
 * Define a Zero configuration.
 * Used in `zero.config.ts` at the project root.
 *
 * @example
 * import { defineConfig } from "@pyreon/zero/config"
 *
 * export default defineConfig({
 *   mode: "ssr",
 *   ssr: { mode: "stream" },
 *   port: 3000,
 * })
 */
export function defineConfig(config: ZeroConfig): ZeroConfig {
  return config
}

/** Merge user config with defaults. */
export function resolveConfig(
  userConfig: ZeroConfig = {},
): Required<Pick<ZeroConfig, "mode" | "base" | "port" | "adapter">> & ZeroConfig {
  return {
    mode: "ssr",
    base: "/",
    port: 3000,
    adapter: "node",
    ...userConfig,
    ssr: {
      mode: "string",
      ...userConfig.ssr,
    },
  }
}
