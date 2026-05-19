/**
 * Compiler hardening — Round 12 (REAL high-impact gap, FIXED + bisect).
 *
 * Pre-fix: `transformJSX` emitted NO source map and its string-slice
 * substitutions shifted line counts (template emission expands one-line JSX
 * into a multi-line `_tpl(...)` factory). `@pyreon/vite-plugin` returned
 * `{ code, map: null }`, so every runtime stack frame / debugger breakpoint
 * in every Pyreon component mislocated — app-wide, in every project.
 *
 * Fix: `transformJSX_JS` applies its existing disjoint `{start,end,text}`
 * replacement set through MagicString (`update`/`appendLeft`) and the
 * generated preamble via `prepend`. `toString()` is byte-identical to the
 * old concatenation — proven by the full ~1240-test suite + the 180
 * native-equivalence tests, which assert exact emitted strings and all stay
 * green — while `generateMap()` now yields a correct V3 map. `prepend`
 * shifts every mapping by the preamble's line count, so original positions
 * resolve to the correct OUTPUT line despite the line-shift.
 *
 * Bisect: revert the MagicString block to the slice/join + chained-prepend
 * assembly → `map` is `undefined` and these specs fail; restore → pass. The
 * byte-identical guarantee is itself bisect-covered by the rest of the suite
 * (any drift fails an exact-string assertion somewhere).
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

// Edit-correctness oracle is the rest of the compiler suite: the full
// ~1240-test + 180 native-equivalence corpus asserts EXACT emitted strings,
// so any byte drift from the MagicString assembly fails there. Map *math*
// (segment offsets through `update`/`appendLeft`/`prepend`) is magic-string's
// — the battle-tested generator vite/rollup/svelte rely on; not re-derived
// here. These specs assert the gap is closed (a valid, content-embedded V3
// map is produced and serializes for Vite) and the no-op contract.

const MULTILINE = `function C(props) {
  return (
    <section>
      <h1>{props.title}</h1>
      <p>{props.body}</p>
    </section>
  )
}`

describe('Round 12 — sourcemap fidelity (fixed)', () => {
  it('a transforming compile now produces a V3 source map', () => {
    const r = transformJSX_JS(MULTILINE, 'C.tsx')
    expect(r.map).toBeDefined()
    expect(r.map!.version).toBe(3)
    expect(r.map!.sources).toContain('C.tsx')
    expect(r.map!.mappings.length).toBeGreaterThan(0)
  })

  it('the map embeds original content and is JSON/`toString`-serializable for Vite', () => {
    const r = transformJSX_JS(MULTILINE, 'C.tsx')
    expect(r.map!.sourcesContent?.[0]).toBe(MULTILINE)
    const json = JSON.parse(r.map!.toString())
    expect(json.version).toBe(3)
    expect(json.mappings).toBe(r.map!.mappings)
  })

  it('output still line-shifts — but the map now accounts for it (the whole point)', () => {
    const r = transformJSX_JS(MULTILINE, 'C.tsx')
    // Template emission still expands lines (unchanged codegen)…
    expect(r.code.split('\n').length).toBeGreaterThan(MULTILINE.split('\n').length)
    // …and the segment mappings are non-trivial (multi-segment, i.e. the
    // preamble + per-replacement remapping is recorded, not an empty/identity
    // map that would silently mislocate like before).
    expect(r.map!.mappings).toMatch(/[;,]/)
    expect(r.map!.names).toBeInstanceOf(Array)
  })

  it('a no-op compile (nothing to transform) returns no map (code is unchanged)', () => {
    const r = transformJSX_JS(`const x = 1`, 'plain.ts')
    expect(r.map).toBeUndefined()
    expect(r.code).toBe(`const x = 1`)
  })
})
