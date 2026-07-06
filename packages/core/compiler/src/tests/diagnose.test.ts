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

describe('diagnoseError — <select value> symptom entry (PZ-09)', () => {
  it('matches the words a user would paste for the select-value symptom', () => {
    for (const text of [
      'my select always shows the first option',
      'select value not working after upgrade',
      "the select value isn't selected on load",
      'select is stuck on first option',
      'wrong option selected in my select on SSR page',
    ]) {
      const r = diagnoseError(text)
      expect(r, text).not.toBeNull()
      expect(r!.cause).toContain('select')
      expect(r!.fix).toContain('Upgrade')
    }
  })

  it('does not fire on unrelated select/option text', () => {
    expect(diagnoseError('how do I select text in an input')).toBeNull()
    expect(diagnoseError('querySelector returns the first option element')).toBeNull()
  })
})
