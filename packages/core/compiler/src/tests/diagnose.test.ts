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

  it('diagnoses a VNode array rendered as "[object Object]"', () => {
    for (const symptom of [
      '[object Object],[object Object]',
      'my list renders [object Object]',
      'array of vnodes renders [object Object]',
    ]) {
      const r = diagnoseError(symptom)
      expect(r, symptom).not.toBeNull()
      expect(r!.cause.toLowerCase()).toContain('array')
      expect(r!.fix).toMatch(/mountChild|_mountSlot|<For|\.map/)
    }
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

  it('diagnoses the RouterLink-without-provider shape (dev warning + old-behavior symptoms)', () => {
    // The exact dev warning @pyreon/router emits:
    const warned = diagnoseError(
      '[Pyreon] <RouterLink to="/settings"> rendered without a RouterProvider — falling back to a plain anchor (full page load on click). Wrap the tree in <RouterProvider router={…}>.',
    )
    expect(warned).not.toBeNull()
    expect(warned!.fix).toContain('RouterProvider')
    // A user-described symptom of the PRE-fix behavior (hash-fallback href):
    const symptom = diagnoseError('RouterLink renders #/settings href in history mode')
    expect(symptom).not.toBeNull()
    expect(symptom!.cause).toContain('RouterProvider')
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

describe('diagnoseError — text-binding coercion residuals (post VNode-upgrade)', () => {
  it('matches the plain-primitive array comma-join symptom', () => {
    for (const text of [
      'my signal array renders a,b instead of separate nodes',
      'text binding shows comma-separated values',
    ]) {
      const r = diagnoseError(text)
      expect(r, text).not.toBeNull()
      expect(r!.cause).toContain('text-FIRST')
      expect(r!.fix).toContain('For each')
    }
  })

  it('matches the parentless-text-node warning', () => {
    const r = diagnoseError('[Pyreon] A VNode was coerced: the bound text node has no parent')
    expect(r).not.toBeNull()
    expect(r!.fix).toContain('mountChild')
  })

  it('does not fire on unrelated comma text', () => {
    expect(diagnoseError('how do I join an array with commas in JS')).toBeNull()
  })
})

describe('diagnoseError — TypeScript 7 Compiler-API removal entry', () => {
  it('maps the cryptic ESNext deref (bunx MCP crash) to the typescript-cap fix', () => {
    // The exact runtime error a fresh `bunx @pyreon/mcp` throws under TS7.
    const r = diagnoseError("Cannot read properties of undefined (reading 'ESNext')")
    expect(r).not.toBeNull()
    expect(r!.cause).toContain('TypeScript 7')
    expect(r!.fix).toContain('>=5.0.0 <7.0.0')
  })

  it('does not fire on an unrelated "reading X" TypeError', () => {
    expect(
      diagnoseError("Cannot read properties of undefined (reading 'foo')"),
    ).toBeNull()
  })

  it('diagnoses the SVG className-assignment throw (the flow-edge bug)', () => {
    for (const msg of [
      'Cannot set property className of #<SVGElement> which has only a getter',
      'setting getter-only property "className"',
      'my flow edges lines do not render',
    ]) {
      const r = diagnoseError(msg)
      expect(r, msg).not.toBeNull()
      expect(r!.cause).toContain('SVGAnimatedString')
      expect(r!.fix).toContain('_setClass')
    }
  })

  it('does not fire on an unrelated className mention', () => {
    expect(diagnoseError('the className prop was updated')).toBeNull()
  })
})
