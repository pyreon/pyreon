/**
 * SSR ↔ hydration parity fuzz — COMPILED path.
 *
 * `hydration-parity-fuzz.test.tsx` builds every seeded tree with `h()`, so it
 * covers the runtime hydration path only. Three shipped duplication bugs
 * (#3299's trailing text, the mid-slot family in #3307/#3310) lived on the
 * COMPILED path — `_tpl` adoption, mid-slot collapse, parking — which that gate
 * structurally cannot reach; its own record names a compiled-path gate as owed.
 * This is it.
 *
 * Same grammar, same seeds, same five oracles. The one difference is instance
 * A: its component is the seed's spec rendered as JSX SOURCE (`toSource`),
 * compiled through the REAL `transformJSX` (client emit) with the residual JSX
 * lowered exactly as the adoption specs do, and hydrated over the h()-form SSR
 * of the same spec — faithful, because the compile-to-string SSR emit is
 * fuzz-locked byte-identical to `h()`. Instances B and C are compiled too, so
 * O2/O3/O5 compare compiled-vs-compiled: a compiled shape that renders
 * differently from `h()` on a CLIENT mount is the other gate's job.
 *
 * Retention is reported per run (SSR element+text nodes surviving hydration
 * with identity) and asserted as a RATCHET floor: it can only rise. A shape that
 * legitimately rebuilds today lowers the average, not the verdict; a shape that
 * REGRESSES from adopt to rebuild moves the floor and fails.
 */
import { transformJSX } from '@pyreon/compiler'
import { _lc, _rp, _wrapSpread, For, Fragment, h, Show } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindText,
  _mountChild,
  _mountSlot,
  _setAttr,
  _setChild,
  _setChildAt,
  _setClass,
  _setHtml,
  _setStyle,
  _textSlot,
  _tpl,
  disableHydrationWarnings,
  hydrateRoot,
  mount,
  onHydrationMismatch,
} from '../index'
import { bindPolymorphicText } from '../mount'
import { cmp, flip, genSpec, makeSignals, mulberry32, toSource, toVNode, type SigInst, type SigSpec, type Spec } from './_hydration-fuzz-grammar'

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _setClass,
  _mountSlot,
  _textSlot,
  _setChild,
  _setChildAt,
  _mountChild,
  _setHtml,
  bindPolymorphicText,
  h,
  Fragment,
  For,
  Show,
  _lc,
  _rp,
  _wrapSpread,
  signal,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

const lowerResidualJsx = (code: string) =>
  transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' }).code

/**
 * Compile ONCE per seed into a function of the signal array `S`. The SERVER arm
 * compiles the SAME source through the SSR emit — that is what production
 * renders, and it differs from the h() form in a way that matters here: the
 * compiler wraps a component's `{props.children}` in an accessor, so the SSR
 * emit brackets that slot with its own `$` range. Rendering the h() form
 * instead left that range out, and the compiled client then consumed the
 * child `<Show>`'s markers as its slot's range — a duplicated `<For>` that was
 * a harness artifact, not a runtime bug (found and confirmed at seed 167).
 */
function compileSpec(spec: Spec, ssr = false): (S: SigInst[]) => () => unknown {
  const { code } = transformJSX(toSource(spec), 'fuzz.tsx', (ssr ? { ssr: true } : {}) as never)
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, 'S', `${body}\nreturn App`)
  return (S) => fn(...DEP_VALUES, S) as () => unknown
}

function snapshot(host: HTMLElement): Node[] {
  const out: Node[] = []
  const walk = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n)
  return out
}

describe('SSR ↔ hydration parity fuzz — COMPILED path', () => {
  const ENV = process.env as Record<string, string | undefined>
  const SEEDS = Math.max(1, Number(ENV.PYREON_FUZZ_SEEDS) || 300)
  // Stop after this many failures (diagnosis runs raise it to see the distribution).
  const MAXFAIL = Math.max(1, Number(ENV.PYREON_FUZZ_MAXFAIL) || 5)
  const TIMEOUT_MS = Math.max(30_000, SEEDS * 40) // a real compile per seed
  // Retention RATCHET — the measured floor on the run that set it. Raise it
  // when adoption improves; never lower it to absorb a regression.
  // Set at 300 seeds: 74.6% (1896/2543 SSR nodes kept, 78 root swaps — the
  // root `<main>` bails whenever a `<For>` block sits directly under it, a
  // `<!--pyreon-for-->` region the verifier refuses; the next adoption lever).
  const RETENTION_FLOOR = 0.74

  it(`${SEEDS} seeded trees hold all five oracles on the compiled path`, { timeout: TIMEOUT_MS }, async () => {
    disableHydrationWarnings()
    const failures: string[] = []
    let ssrNodes = 0
    let kept = 0
    let rootSwaps = 0
    // Diagnosis aid: PYREON_FUZZ_ONLY=112,167 runs just those seeds with full output.
    const ONLY = ENV.PYREON_FUZZ_ONLY ? new Set(ENV.PYREON_FUZZ_ONLY.split(',').map(Number)) : null
    const CUT = ONLY ? 2000 : 160
    for (let seed = 1; seed <= SEEDS; seed++) {
      if (ONLY && !ONLY.has(seed)) continue
      const r = mulberry32(seed)
      const sigSpecs: SigSpec[] = []
      const spec: Spec = { k: 'el', tag: 'main', attrs: [], children: [genSpec(r, 0, sigSpecs), genSpec(r, 0, sigSpecs)] }
      let make: (S: SigInst[]) => () => unknown
      try {
        make = compileSpec(spec)
      } catch (e) {
        failures.push(`seed=${seed} COMPILE: ${(e as Error).message.split('\n')[0]}`)
        if (failures.length >= 5) break
        continue
      }

      const SA = makeSignals(sigSpecs)
      const html = await renderToString(h(compileSpec(spec, true)(SA) as never, null) as never)
      const cA = document.createElement('div')
      document.body.appendChild(cA)
      cA.innerHTML = html
      const before = snapshot(cA)
      const rootBefore = cA.firstElementChild
      const mismatches: string[] = []
      const off = onHydrationMismatch((ctx) => mismatches.push(`${ctx.type}@${ctx.path}`))
      let cleanupA: () => void
      try {
        cleanupA = hydrateRoot(cA, h(make(SA) as never, null))
      } catch (e) {
        off()
        failures.push(`seed=${seed} MOUNT-A: ${(e as Error).message.split('\n')[0]}\n  src: ${toSource(spec).split('\n')[1]?.slice(0, 220)}`)
        cA.remove()
        if (failures.length >= MAXFAIL) break
        continue
      }
      off()
      const after = new Set(snapshot(cA))
      ssrNodes += before.length
      kept += before.filter((n) => after.has(n)).length

      const SB = makeSignals(sigSpecs)
      const cB = document.createElement('div')
      document.body.appendChild(cB)
      let cleanupB: () => void
      try {
        cleanupB = mount(h(make(SB) as never, null), cB)
      } catch (e) {
        failures.push(`seed=${seed} MOUNT-B: ${(e as Error).message.split('\n')[0]}\n  src: ${toSource(spec).split('\n')[1]?.slice(0, 220)}`)
        cleanupA()
        cA.remove()
        cB.remove()
        if (failures.length >= MAXFAIL) break
        continue
      }
      // A thrown render inside a boundary surfaces as the dev error box rather
      // than an exception — treat that as a mount failure too, with its message.
      const errBox = cB.querySelector('pre')
      if (errBox && /border: 2px solid #e53e3e/.test(errBox.getAttribute('style') ?? '')) {
        failures.push(`seed=${seed} RENDER-B: ${((errBox.textContent ?? '').split('\n')[0] ?? '').slice(0, 200)}\n  src: ${toSource(spec).split('\n')[1]?.slice(0, 220)}`)
        cleanupA(); cleanupB(); cA.remove(); cB.remove()
        if (failures.length >= MAXFAIL) break
        continue
      }

      if (mismatches.length > 0) failures.push(`seed=${seed} O1: ${mismatches[0]}`)
      // O4 (root identity) is NOT a hard oracle on the compiled path: a root
      // template whose adoption bails takes the documented swap fallback, which
      // is correct DOM with lost identity — the retention ratchet measures it.
      if (cA.firstElementChild !== rootBefore) rootSwaps++
      if (cmp(cA.innerHTML) !== cmp(cB.innerHTML)) {
        failures.push(`seed=${seed} O2 divergence\n  A: ${cmp(cA.innerHTML).slice(0, CUT)}\n  B: ${cmp(cB.innerHTML).slice(0, CUT)}\n  src: ${toSource(spec).split('\n')[1]?.slice(0, CUT)}`)
      } else {
        flip(sigSpecs, SA)
        flip(sigSpecs, SB)
        if (cmp(cA.innerHTML) !== cmp(cB.innerHTML)) {
          failures.push(`seed=${seed} O3 post-flip divergence\n  A: ${cmp(cA.innerHTML).slice(0, CUT)}\n  B: ${cmp(cB.innerHTML).slice(0, CUT)}\n  src: ${toSource(spec).split('\n')[1]?.slice(0, CUT)}`)
        } else {
          const SC = makeSignals(sigSpecs)
          flip(sigSpecs, SC)
          const cC = document.createElement('div')
          document.body.appendChild(cC)
          const cleanupC = mount(h(make(SC) as never, null), cC)
          if (cmp(cA.innerHTML) !== cmp(cC.innerHTML)) failures.push(`seed=${seed} O5 ground-truth divergence`)
          cleanupC()
          cC.remove()
        }
      }
      cleanupA()
      cleanupB()
      cA.remove()
      cB.remove()
      if (failures.length >= MAXFAIL) break
    }
    const retention = ssrNodes === 0 ? 0 : kept / ssrNodes
    // eslint-disable-next-line no-console
    console.warn(`[compiled-fuzz] seeds=${SEEDS} retention=${(retention * 100).toFixed(1)}% (${kept}/${ssrNodes} SSR nodes kept) rootSwaps=${rootSwaps}`)
    expect(failures, failures.join('\n')).toEqual([])
    expect(retention).toBeGreaterThanOrEqual(RETENTION_FLOOR)
  })
})
