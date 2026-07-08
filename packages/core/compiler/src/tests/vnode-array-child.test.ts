import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

/**
 * Regression: an array-of-JSX / map-of-JSX const used as a bare `{x}` child of
 * a DOM element must MOUNT (`_mountSlot` → `mountChild` renders arrays), not
 * text-coerce the VNode[] to "[object Object],[object Object]". The compiler's
 * `elementVars`/`is_jsx_collection_init` tracking classifies such consts. See
 * jsx.ts:isJsxCollectionInit (mirrored in native/src/lib.rs). Cross-backend
 * byte-equivalence is locked in native-equivalence.test.ts.
 */
const code = (src: string) => {
  const r = transformJSX_JS(src, 't.tsx') as { code: string }
  return r.code.replace(/\s+/g, ' ')
}

describe('VNode array/map const as a bare child', () => {
  it('array-of-JSX const → _mountSlot (mounts), not textContent (stringify)', () => {
    const out = code('const arr = [<span>a</span>, <span>b</span>]; export const X = () => <div>{arr}</div>')
    expect(out).toContain('_mountSlot(arr')
    expect(out).not.toContain('textContent = arr')
  })

  it('map-of-JSX const → _mountSlot', () => {
    const out = code('const items = [1,2]; const rows = items.map(i => <li>{i}</li>); export const X = () => <ul>{rows}</ul>')
    expect(out).toContain('_mountSlot(rows')
    expect(out).not.toContain('textContent = rows')
  })

  it('plain string const stays on the static text fast path (no over-classification)', () => {
    const out = code("const s = 'hi'; export const X = () => <div>{s}</div>")
    // A plain non-signal string const is STATIC — it uses the `_setChild` fast
    // path (text-sets a string at runtime), NOT a reactive binding and NOT a
    // VNode[] mount. `_setChild` is the static-child codegen; asserting it (and
    // the absence of `bindPolymorphicText` + `_mountSlot`) preserves the
    // original "not over-classified as reactive / not a slot mount" intent.
    expect(out).toContain('_setChild(__root, s)')
    expect(out).not.toContain('bindPolymorphicText')
    expect(out).not.toContain('_mountSlot(s')
  })

  it('single-JSX const still mounts (no regression to the existing elementVars path)', () => {
    const out = code('const v = <span>a</span>; export const X = () => <div>{v}</div>')
    expect(out).toContain('_mountSlot(v')
  })
})
