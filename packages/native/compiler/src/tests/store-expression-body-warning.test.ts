// The concise-object defineStore setup failed BOTH targets with zero warnings.
//
//   defineStore('app', () => ({ n: signal(1) }))
//
// emitted uncompilable Swift —
//
//   private let useApp = defineStore("app", { ((n: signal(1))) })
//
// referencing `defineStore` and `signal`, neither of which exists in Swift, and
// said NOTHING. The block-body form right next to it lowers cleanly, so the
// difference between working and silently-broken native code was whether the
// author wrote `() => ({ … })` or `() => { … }`.
//
// The warning for this case ALREADY EXISTED in parse.ts and was correct. It was
// simply unreachable: the branch tested `body.type === 'ObjectExpression'`, but
// a concise-object arrow body parses as a ParenthesizedExpression — and those
// parens are MANDATORY syntax, since `() => { … }` would be a block. So the
// condition was false for every input that could possibly reach it. Dead from
// the moment it was written, and the shape fell through to a silent
// `else { return null }`.
//
// Verified against the real parser rather than assumed: for this source,
// oxc-parser reports `arrow.body.type === 'ParenthesizedExpression'`.
//
// RESIDUAL, stated because the build still fails after this change: the emit is
// still uncompilable passthrough. That is PRE-EXISTING and identical on every
// defineStore bail path — the non-shorthand-key bail, which has warned since
// v2, emits the same passthrough. This change brings the expression-body form
// to parity with those paths: a NAMED failure with a fix instruction instead of
// a silent one. Dropping the passthrough entirely is a separate change across
// all bail paths, and would not make the build pass either (the component still
// references the store), so the warning is the load-bearing signal in both.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const mk = (setup: string) => `
  import { defineStore } from '@pyreon/store'
  import { signal } from '@pyreon/reactivity'
  import { Stack, Text } from '@pyreon/primitives'
  const useApp = defineStore('app', ${setup})
  export function C() {
    const s = useApp()
    return (<Stack><Text>{s.store.n()}</Text></Stack>)
  }
`

const storeWarnings = (src: string, target: 'swift' | 'kotlin') =>
  (transform(src, { target }).warnings ?? []).filter((w) => w.includes('defineStore'))

describe('defineStore expression-body setup warns instead of failing silently', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: () => ({ … }) warns, naming the block-body form to use`, () => {
      const w = storeWarnings(mk('() => ({ n: signal(1) })'), target)
      expect(w, 'expected exactly one defineStore warning').toHaveLength(1)
      // The fix instruction is the whole point — assert it, not just that
      // SOMETHING warned.
      expect(w[0]).toContain('block-body form')
    })

    it(`${target}: nested parens () => (({ … })) warn too`, () => {
      // `while`, not `if`: (( … )) is legal and nests.
      expect(storeWarnings(mk('() => (({ n: signal(1) }))'), target)).toHaveLength(1)
    })

    // THE GUARD. Unwrapping parens must not disturb the documented form, which
    // is the one every working store in the repo uses.
    it(`${target}: block-body form still lowers SILENTLY`, () => {
      const src = mk('() => { const n = signal(1); return { n } }')
      expect(storeWarnings(src, target)).toEqual([])
      // And it really lowered — no passthrough left behind.
      expect(transform(src, { target }).code ?? '').not.toContain('defineStore(')
    })
  }
})
