// Declarations for the two bench-only third-party modules that ship no types
// and have no `@types/*` package. Only the surface the benches call is
// declared, so a bench that reaches past it fails `check-script-imports`.

declare module 'babel-preset-solid' {
  import type { ConfigAPI, PluginItem } from '@babel/core'

  /** Options the SSR bench passes (`generate: 'ssr'`, `hydratable`). */
  interface SolidPresetOptions {
    generate?: 'dom' | 'ssr' | 'universal'
    hydratable?: boolean
  }

  const preset: (api: ConfigAPI, options?: SolidPresetOptions) => { plugins: PluginItem[] }
  export default preset
}

// Next.js vendors path-to-regexp 6.x without its declarations.
declare module 'next/dist/compiled/path-to-regexp' {
  interface MatchResult<P extends object = object> {
    path: string
    index: number
    params: P
  }

  export function match<P extends object = object>(
    path: string,
    options?: { decode?: (value: string) => string; strict?: boolean; end?: boolean },
  ): (pathname: string) => MatchResult<P> | false
}
