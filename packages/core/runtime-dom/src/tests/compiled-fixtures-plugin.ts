import { transformJSX } from '@pyreon/compiler'
import { transformSync } from 'esbuild'
import type { Plugin } from 'vite'

/**
 * Compile `*.fixture.tsx` modules with the REAL Pyreon JSX transform
 * (`transformJSX`: the native backend when its binary is present, the JS one
 * otherwise), then lower the JSX it leaves for the h() path with the automatic
 * runtime — what `@pyreon/vite-plugin` ships. Only fixtures: every other
 * runtime-dom browser test builds its runtime shape with `h()` by hand.
 *
 * Kept here rather than as a `@pyreon/vite-plugin` devDependency so the
 * runtime package does not depend on a layer above it.
 */
export function compiledFixtures(): Plugin {
  return {
    name: 'pyreon-compiled-fixtures',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.fixture.tsx')) return null
      const compiled = transformJSX(code, id).code
      return transformSync(compiled, {
        loader: 'tsx',
        jsx: 'automatic',
        jsxImportSource: '@pyreon/core',
        sourcefile: id,
      }).code
    },
  }
}
