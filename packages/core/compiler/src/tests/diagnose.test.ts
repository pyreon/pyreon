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

  describe('"X is not a function" teaches BOTH causes (signal-not-called + reactive-prop auto-unwrap)', () => {
    // The pre-amendment entry diagnosed ONLY "if this is a signal, call it" —
    // actively wrong for the PZ-10 shape, where the compiler auto-unwrapped a
    // reactive prop to its VALUE and the fix is the OPPOSITE (stop calling it).
    it('names the signal cause AND the reactive-prop cause', () => {
      const result = diagnoseError('props.list is not a function')
      expect(result).not.toBeNull()
      expect(result!.cause).toContain('signal')
      expect(result!.cause).toContain('auto-unwraps')
      expect(result!.cause).toContain('VALUE')
      expect(result!.fix).toContain('list()')
      expect(result!.fix).toContain('list={() => value}')
      expect(result!.fixCode).toContain('<Child list={() => items()} />')
    })

    it('the _mountSlot cleanup shape still routes to its specific entry (ordering preserved)', () => {
      const result = diagnoseError('Unhandled effect error: g is not a function at Object.cleanup')
      expect(result).not.toBeNull()
      expect(result!.cause).toContain('_mountSlot')
    })
  })

  describe('"[object Object]" in a text position teaches the extract-a-component fix (PZ-02)', () => {
    it("matches runtime-dom's dev warning text verbatim", () => {
      const result = diagnoseError(
        '[Pyreon] A VNode was coerced to "[object Object]" in a text binding. A JSX-returning helper called inline under a DOM element ({cell(x)}) compiles as reactive TEXT, not a mount.',
      )
      expect(result).not.toBeNull()
      expect(result!.fix).toContain('Extract a real component')
      expect(result!.fixCode).toContain('<Cell s={row.status} />')
    })

    it('matches a plain user report mentioning text/render context', () => {
      const result = diagnoseError(
        'my table renders [object Object] instead of the badge component',
      )
      expect(result).not.toBeNull()
      expect(result!.cause).toContain('"[object Object]"')
      expect(result!.fix).toContain('Extract a real component')
    })

    it('does NOT hijack innerHTML-mentioning reports (dangerouslySetInnerHTML entry wins)', () => {
      const result = diagnoseError(
        'dangerouslySetInnerHTML rendered [object Object] and the element is empty',
      )
      expect(result).not.toBeNull()
      expect(result!.cause).toContain('dangerouslySetInnerHTML')
    })

    it('does NOT hijack the hydration-parity duplicate-list shape', () => {
      const result = diagnoseError('my <For> list is duplicated twice after hydration')
      expect(result).not.toBeNull()
      expect(result!.fix).toContain('Upgrade')
      expect(result!.cause).toContain('hydration')
    })

    it('does NOT match a bare "[object Object]" with no text/render context (avoids over-broad regex)', () => {
      // e.g. an [object Object] in a URL / header / JSON payload report —
      // not this entry's business.
      const result = diagnoseError('request failed: invalid header value [object Object]')
      expect(result).toBeNull()
    })
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
