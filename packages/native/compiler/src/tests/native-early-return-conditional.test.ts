// Early-return conditional rendering (`if (cond) return <JSX>; return <JSX>`)
// — the ubiquitous React/Pyreon conditional-render pattern — now LOWERS
// instead of silently dropping (the "widen the subset" trustworthy-compiler
// pass, building on #2118's zero-silent warning).
//
// swiftc rejects imperative control flow inside a `var body` result builder
// ("closure containing control flow statement cannot be used with result
// builder 'ViewBuilder'"), but a conditional VIEW is fine — so the component
// walker FOLDS `if (cond) return <A>; return <B>` into a ternary return
// (`cond ? A : B`), which the emitter already lowers to a @ViewBuilder /
// @Composable `if`/`else`. A chain folds into a nested ternary. Verified: the
// EMITTED Swift `swiftc -typecheck`s (see the prove-first in the PR).
//
// A non-early-return `if` (imperative body, an `else`, decls in the branch)
// has no result-builder lowering and KEEPS the #2118 named warning.
//
// Bisect-verified by reverting the fold — the early-return renders only the
// final branch again (the `if` drops) and the warning reappears.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const PROPS = '{ a, b }: { a: boolean, b: boolean }'

describe('early-return conditional rendering — folds to a ternary (was a silent drop)', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: single early-return emits BOTH branches, no warning`, () => {
      const out = transform(
        `export function App({ ok }: { ok: boolean }) { if (ok) return <Text>Yes</Text>; return <Text>No</Text> }`,
        { target },
      )
      // The whole point: the conditional branch is no longer dropped —
      // both "Yes" and "No" reach the emit.
      expect(out.code).toContain('Yes')
      expect(out.code).toContain('No')
      expect(out.warnings, JSON.stringify(out.warnings)).toEqual([])
    })

    it(`${target}: a chain folds into a nested conditional (all branches present)`, () => {
      const out = transform(
        `export function App(${PROPS}) { if (a) return <Text>A</Text>; if (b) return <Text>B</Text>; return <Text>C</Text> }`,
        { target },
      )
      for (const label of ['A', 'B', 'C']) expect(out.code).toContain(label)
      expect(out.warnings).toEqual([])
    })

    it(`${target}: a block-form early-return (\`if (c) { return <A/> }\`) also folds`, () => {
      const out = transform(
        `export function App({ ok }: { ok: boolean }) { if (ok) { return <Text>Yes</Text> } return <Text>No</Text> }`,
        { target },
      )
      expect(out.code).toContain('Yes')
      expect(out.code).toContain('No')
      expect(out.warnings).toEqual([])
    })
  }

  it('swift: the fold emits a view if/else (result-builder-safe shape)', () => {
    const out = transform(
      `export function App({ ok }: { ok: boolean }) { if (ok) return <Text>Yes</Text>; return <Text>No</Text> }`,
      { target: 'swift' },
    )
    // M2.2b — the fold lowers to a `@ViewBuilder` `if ok { … } else { … }`,
    // NOT a `? :` operator: swiftc rejects `? :` between DIFFERENT view types
    // (HStack vs VStack), so if/else (buildEither) is the general
    // result-builder-safe form. Same-typed Text branches would also compile
    // under `? :`, but the emit is uniform across view-branch shapes.
    expect(out.code).toMatch(/if ok \{/)
    expect(out.code).toContain('Text("Yes")')
    expect(out.code).toMatch(/\} else \{/)
    expect(out.code).toContain('Text("No")')
    expect(out.code).not.toMatch(/ok \? Text/)
  })

  it('an imperative `if` (mutation, no JSX return) STILL warns — no result-builder lowering', () => {
    const out = transform(
      `export function App() { let r = 0; if (r < 1) { r = 5 }; return <Text>{String(r)}</Text> }`,
      { target: 'swift' },
    )
    expect(out.warnings.some((w) => w.includes('DROPPED'))).toBe(true)
  })

  it('an `if…else return` folds to a ternary (both branches render) — was a skipped component', () => {
    // Pre-fix this returned null ("no return statement; skipping") — the WHOLE
    // component vanished. Now both branches render.
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(
        `export function App({ ok }: { ok: boolean }) { if (ok) { return <Text>Yes</Text> } else { return <Text>No</Text> } }`,
        { target },
      )
      expect(out.code).toContain('Yes')
      expect(out.code).toContain('No')
      expect(out.warnings, JSON.stringify(out.warnings)).toEqual([])
    }
  })
})
