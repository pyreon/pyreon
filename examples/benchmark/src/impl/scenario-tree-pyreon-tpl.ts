/**
 * DIAGNOSTIC ARM — hand-written at Pyreon's compiler-output level, to measure
 * the ceiling of "templatize an element whose children are COMPONENTS" before
 * building that machinery into the compiler.
 *
 * Today the compiler BAILS the whole template on a component child
 * (`templateElementCount` returns -1 for any non-lowercase tag), so
 *
 *     <div class="branch"><Node/><Node/></div>
 *
 * lowers to `jsxs('div', {class, children:[…]})` → `h()` → `mountElement`
 * (createElement + setAttribute + mountChildren). Solid's real compiler — read
 * out of `babel-preset-solid@1.9.12`, not assumed — emits instead:
 *
 *     var _tmpl$2 = _$template(`<div class=branch>`);
 *     var _el$2 = _tmpl$2();
 *     _$insert(_el$2, _$createComponent(SolidNode, { get depth() {…} }), null);
 *     _$insert(_el$2, _$createComponent(SolidNode, { get depth() {…} }), null);
 *
 * i.e. a CLONE with the class baked in, and children APPENDED with a null
 * marker — no placeholder nodes at all.
 *
 * This file writes both candidate Pyreon shapes by hand so the win can be
 * measured before any compiler change is justified:
 *
 *   - `slot`   — `<div class="branch"><!><!></div>` + `_mountSlot`, which is
 *                the machinery the element-conditional child path already
 *                uses. Costs two comment nodes per branch, cloned then removed.
 *   - `append` — `<div class="branch"></div>` + `mountChild(v, root, null)`,
 *                the Solid-equivalent shape with no placeholder cost. Valid
 *                here because every child is a slot and they mount in order,
 *                so nothing baked follows them.
 *
 * The leaf arm is byte-identical to what the compiler already emits for
 * `<span class="leaf">{() => get()}</span>` (verified with `transformJSX`), so
 * only the BRANCH shape differs between this arm and the shipped one.
 *
 * `.ts`, not `.tsx`: the point is to control the emitted shape exactly.
 *
 * ## Measured (2026-08-18, interleaved, n=80/cell, load 5.11 → 4.95)
 *
 *     Vanilla (floor)      2.31ms
 *     SolidJS              3.26ms
 *     Pyreon (tpl append)  3.94ms  [3.92–3.99]   −11.3% vs shipped
 *     Pyreon (tpl slot)    4.24ms  [4.19–4.27]    −4.5% vs shipped
 *     Pyreon (shipped)     4.44ms  [4.41–4.47]
 *
 * Replicated in a separate 10-arm run (3.95 / 4.17 / 4.31) — both runs agree
 * on the ordering and on append ≈ 2.5× the win of slot.
 *
 * The gap to close is Pyreon − Solid = 1.18ms, and the APPEND form is 0.50ms
 * of it — **42% of the whole remaining deep-tree deficit**. The placeholder
 * form recovers only ~a third of that, because two comment nodes per branch
 * are cloned and then removed again (2,046 of each across the tree).
 *
 * So the lead is real and it is large, but its value is concentrated in the
 * variant that does NOT reuse the proven `_mountSlot` path — which is the
 * finding that matters for whoever implements it.
 */
import { _rp, h as ph, provide, useContext } from '@pyreon/core'
import type { NativeItem, VNodeChild } from '@pyreon/core'
import { _bindText, _mountSlot, _tpl, mountChild } from '@pyreon/runtime-dom'
import { PyreonDeepCtx } from './scenario-tree-pyreon'

/** Which branch shape this run uses. Set before the mount walk begins. */
let mode: 'slot' | 'append' = 'slot'

const LEAF_HTML = '<span class="leaf"> </span>'
const BRANCH_HTML_SLOT = '<div class="branch"><!><!></div>'
const BRANCH_HTML_APPEND = '<div class="branch"></div>'

export function PyreonNodeTpl(props: { depth: number }): NativeItem {
  if (props.depth <= 1) {
    const get = useContext(PyreonDeepCtx)
    return _tpl(LEAF_HTML, (__root: Element) => {
      const __t0 = __root.firstChild as Text
      return _bindText(get as never, __t0)
    })
  }

  if (mode === 'append') {
    return _tpl(BRANCH_HTML_APPEND, (__root: Element) => {
      const __d0 = mountChild(
        ph(PyreonNodeTpl as never, { depth: _rp(() => props.depth - 1) }),
        __root,
        null,
      )
      const __d1 = mountChild(
        ph(PyreonNodeTpl as never, { depth: _rp(() => props.depth - 1) }),
        __root,
        null,
      )
      return () => {
        __d0()
        __d1()
      }
    })
  }

  return _tpl(BRANCH_HTML_SLOT, (__root: Element) => {
    const __p0 = __root.firstChild as Node
    const __p1 = __p0.nextSibling as Node
    const __d0 = _mountSlot(
      ph(PyreonNodeTpl as never, { depth: _rp(() => props.depth - 1) }),
      __root,
      __p0,
    )
    const __d1 = _mountSlot(
      ph(PyreonNodeTpl as never, { depth: _rp(() => props.depth - 1) }),
      __root,
      __p1,
    )
    return () => {
      __d0()
      __d1()
    }
  })
}

export function PyreonDeepTreeTpl(props: {
  depth: number
  value: () => string
  mode: 'slot' | 'append'
}): VNodeChild {
  mode = props.mode
  provide(PyreonDeepCtx, props.value)
  // The root keeps the ordinary (non-templatized) shape so the arm isolates
  // exactly one variable: the BRANCH emit.
  return ph(
    'div',
    { class: 'tree-root' },
    ph(PyreonNodeTpl as never, { depth: _rp(() => props.depth) }),
  ) as VNodeChild
}

export { PyreonDeepCtx }
