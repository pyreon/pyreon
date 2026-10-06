/**
 * The plugin's STATIC import graph must not reach the TypeScript compiler API.
 *
 * `@pyreon/compiler`'s main entry is TypeScript-free; the `typescript`-backed
 * subpaths (`/analyze`, `/audits`, `/validate`) are only reachable from the
 * plugin through DYNAMIC imports — `optimizeValidators`, `compileValidators`,
 * the islands doctor-lite and the `.pyreon/context.json` scanner each load
 * their subpath lazily, only when the feature actually runs.
 *
 * Bisect-verify: turn the `await import('./optimize-validators')` in
 * `src/index.ts` back into a top-level `import { optimizeValidators } from
 * './optimize-validators'` → the static-edge spec fails naming
 * `@pyreon/compiler/validate`.
 */
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('@pyreon/vite-plugin static graph is TypeScript-free', () => {
  it('only reaches @pyreon/compiler subpaths through dynamic imports', async () => {
    const r = await build({
      entryPoints: [join(SRC, 'index.ts')],
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      platform: 'node',
      // Bare specifiers stay as import edges; the edge kind is the signal.
      packages: 'external',
      splitting: true,
      outdir: join(SRC, '..', '.tmp-static-graph'),
      logLevel: 'silent',
    })
    // Walk ONLY static edges from the entry output, through any internal
    // chunks it statically pulls in. A chunk reached solely via a dynamic
    // import (the lazily loaded optimize-validators / compiled-verdicts
    // modules) is not part of the static graph and is not visited.
    const outputs = r.metafile.outputs
    const entryOut = Object.entries(outputs).find(([, o]) => o.entryPoint !== undefined)![0]
    const staticEdges = new Set<string>()
    const dynamicEdges = new Set<string>()
    const seen = new Set<string>()
    const visit = (key: string): void => {
      if (seen.has(key)) return
      seen.add(key)
      for (const imp of outputs[key]!.imports) {
        if (imp.external) {
          if (imp.kind === 'import-statement') staticEdges.add(imp.path)
          else if (imp.kind === 'dynamic-import') dynamicEdges.add(imp.path)
        } else if (imp.kind === 'import-statement') {
          visit(imp.path)
        }
      }
    }
    visit(entryOut)
    // Dynamic edges from every chunk (positive control below).
    for (const out of Object.values(outputs)) {
      for (const imp of out.imports) if (imp.external && imp.kind === 'dynamic-import') dynamicEdges.add(imp.path)
    }
    // The only static compiler edge is the lean main entry …
    expect([...staticEdges].filter((p) => p.startsWith('@pyreon/compiler'))).toEqual(['@pyreon/compiler'])
    expect(staticEdges.has('typescript')).toBe(false)
    // … and the TS-backed subpaths ARE reached — lazily (positive control: the
    // assertion above is vacuous if the lazy edges silently disappeared).
    expect(dynamicEdges.has('@pyreon/compiler/audits')).toBe(true)
  })
})
