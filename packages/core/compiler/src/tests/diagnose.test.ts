import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { diagnoseError } from '../diagnose'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('diagnoseError (browser-safe error catalog)', () => {
  it('diagnoses a known error pattern (cause + fix)', () => {
    const result = diagnoseError('count is not a function')
    expect(result).not.toBeNull()
    expect(result!.cause).toContain('count')
    expect(result!.fix).toContain('signal')
  })

  it('returns null for an unrelated error', () => {
    expect(diagnoseError('ENOTFOUND some.host — network unreachable')).toBeNull()
  })
})

describe('@pyreon/compiler/diagnose is browser-safe (no TypeScript compiler API)', () => {
  // The whole point of extracting `diagnose.ts` out of `react-intercept.ts`
  // (which `import ts from 'typescript'`) is that the error catalog can load
  // in the BROWSER — the dev-time throw-time fix printer runs client-side and
  // must not drag the ~8 MB TypeScript compiler into the client bundle.
  //
  // Bisect-verify: add `import ts from 'typescript'` + a `ts.SyntaxKind` use
  // to `diagnose.ts` → this test fails (the markers appear in the bundle).
  it('bundling diagnose.ts for the browser pulls ZERO TypeScript compiler API', async () => {
    const r = await build({
      entryPoints: [join(SRC, 'diagnose.ts')],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      logLevel: 'silent',
    })
    const out = r.outputFiles[0]!.text
    expect(out).not.toContain('createSourceFile')
    expect(out).not.toContain('SyntaxKind')
    expect(out).not.toContain('createLanguageService')
    // The catalog is pure regex + strings — a self-contained module, so the
    // browser bundle stays tiny (KBs). `typescript` would balloon it to MBs.
    expect(out.length).toBeLessThan(200_000)
  })
})
