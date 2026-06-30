import { describe, expect, it } from 'vitest'
import { transformClientDirectives } from '../client-directives'
import { transformJSX_JS } from '../jsx'

const F = 'src/components/Page.tsx'

describe('transformClientDirectives — directive islands (hydrate="…")', () => {
  it('rewrites a default-imported component to an island wrapper', () => {
    const src = `import Counter from './Counter'
export default function Page() {
  return <Counter hydrate="visible" />
}`
    const r = transformClientDirectives(src, F)
    expect(r.changed).toBe(true)
    expect(r.warnings).toEqual([])
    expect(r.islands).toHaveLength(1)
    const i = r.islands[0]!
    expect(i.component).toBe('Counter')
    expect(i.importSource).toBe('./Counter')
    expect(i.hydrate).toBe('visible')
    expect(i.exportName).toBe('default')
    // file-derived, unique-by-construction name
    expect(i.name).toBe('components_Page_Counter_visible')
    // rewritten usage + injected wrapper + island import
    expect(r.code).toContain('<__pyIsland_Counter_visible />')
    expect(r.code).toContain('const __pyIsland_Counter_visible = /*#__PURE__*/ __pyIsland(')
    expect(r.code).toContain(`() => import("./Counter")`)
    expect(r.code).toContain(`hydrate: "visible"`)
    expect(r.code).toContain(`import { island as __pyIsland } from "@pyreon/server/client"`)
    // the hydrate attribute is gone from the JSX
    expect(r.code).not.toContain('hydrate="visible"')
  })

  it('bare `hydrate` means eager load', () => {
    const src = `import Hero from './Hero'\nexport const P = () => <Hero hydrate />`
    const r = transformClientDirectives(src, F)
    expect(r.islands[0]!.hydrate).toBe('load')
    expect(r.code).toContain('<__pyIsland_Hero_load />')
    expect(r.code).toContain(`hydrate: "load"`)
  })

  it('preserves other props when rewriting', () => {
    const src = `import Counter from './Counter'\nexport const P = () => <Counter hydrate="idle" start={5} label="x" />`
    const r = transformClientDirectives(src, F)
    expect(r.code).toContain('<__pyIsland_Counter_idle start={5} label="x" />')
  })

  it('handles a named import via a default-shim loader', () => {
    const src = `import { Comments } from './widgets'\nexport const P = () => <Comments hydrate="visible" />`
    const r = transformClientDirectives(src, F)
    expect(r.islands[0]!.exportName).toBe('Comments')
    expect(r.code).toContain(`() => import("./widgets").then((m) => ({ default: m.Comments }))`)
  })

  it('renames BOTH tags of a non-self-closing element', () => {
    const src = `import Box from './Box'\nexport const P = () => <Box hydrate="visible">hi</Box>`
    const r = transformClientDirectives(src, F)
    expect(r.code).toContain('<__pyIsland_Box_visible>hi</__pyIsland_Box_visible>')
  })

  it('one wrapper per (component, strategy) — same component, two strategies → two wrappers', () => {
    const src = `import Counter from './Counter'
export const P = () => (<div><Counter hydrate="visible" /><Counter hydrate="idle" /></div>)`
    const r = transformClientDirectives(src, F)
    expect(r.islands).toHaveLength(2)
    expect(r.code).toContain('<__pyIsland_Counter_visible />')
    expect(r.code).toContain('<__pyIsland_Counter_idle />')
  })

  it('dedupes repeated (component, strategy) into one wrapper', () => {
    const src = `import Counter from './Counter'
export const P = () => (<div><Counter hydrate="visible" /><Counter hydrate="visible" /></div>)`
    const r = transformClientDirectives(src, F)
    expect(r.islands).toHaveLength(1)
    // both usages renamed to the same wrapper
    expect(r.code.match(/__pyIsland_Counter_visible/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('media(...) strategy sanitizes the var/name fragment but keeps the full strategy value', () => {
    const src = `import M from './M'\nexport const P = () => <M hydrate="media(min-width: 768px)" />`
    const r = transformClientDirectives(src, F)
    expect(r.islands[0]!.varName).toBe('__pyIsland_M_media')
    expect(r.islands[0]!.hydrate).toBe('media(min-width: 768px)')
    expect(r.code).toContain(`hydrate: "media(min-width: 768px)"`)
  })

  // ── bail / warn cases (left UNCHANGED) ──

  it('does NOT touch a lowercase DOM element with a hydrate attr (warns)', () => {
    const src = `export const P = () => <div hydrate="visible" />`
    const r = transformClientDirectives(src, F)
    expect(r.changed).toBe(false)
    expect(r.code).toBe(src)
    expect(r.warnings[0]!.message).toContain('lowercase tag')
  })

  it('warns + leaves a dynamic hydrate strategy unchanged', () => {
    const src = `import C from './C'\nconst s = 'visible'\nexport const P = () => <C hydrate={s} />`
    const r = transformClientDirectives(src, F)
    expect(r.changed).toBe(false)
    expect(r.code).toBe(src)
    expect(r.warnings[0]!.message).toContain('must be a string literal')
  })

  it('warns + leaves a NON-imported (local) component unchanged', () => {
    const src = `function Local() { return null }\nexport const P = () => <Local hydrate="visible" />`
    const r = transformClientDirectives(src, F)
    expect(r.changed).toBe(false)
    expect(r.warnings[0]!.message).toContain('not an imported component')
  })

  it('warns + leaves a namespace import unchanged', () => {
    const src = `import * as Ui from './ui'\nexport const P = () => <Ui hydrate="visible" />`
    const r = transformClientDirectives(src, F)
    expect(r.changed).toBe(false)
    expect(r.warnings[0]!.message).toContain('namespace imports')
  })

  it('fast-bails (no parse, unchanged) when there is no hydrate attribute', () => {
    const src = `import Counter from './Counter'\nexport const P = () => <Counter start={1} />`
    const r = transformClientDirectives(src, F)
    expect(r.changed).toBe(false)
    expect(r.code).toBe(src)
    expect(r.islands).toEqual([])
  })

  it('a custom island source can be injected (zero apps import from @pyreon/zero)', () => {
    const src = `import Counter from './Counter'\nexport const P = () => <Counter hydrate="visible" />`
    const r = transformClientDirectives(src, F, { islandSource: '@pyreon/zero' })
    expect(r.code).toContain(`import { island as __pyIsland } from "@pyreon/zero"`)
  })

  it('the rewritten output is valid TSX the JSX compiler accepts (pipeline)', () => {
    const src = `import Counter from './Counter'
export const P = () => <Counter hydrate="visible" start={1} />`
    const r = transformClientDirectives(src, F)
    // The directive output must compile cleanly through the next stage.
    const compiled = transformJSX_JS(r.code, F)
    expect(compiled.code).toContain('__pyIsland_Counter_visible')
    // the island() call survives compilation (it's an ordinary call expression)
    expect(compiled.code).toContain('__pyIsland(')
    // and the dynamic import (the code-split boundary) is intact
    expect(compiled.code).toContain('import("./Counter")')
  })

  it('two different components → two wrappers, both imports preserved', () => {
    const src = `import A from './A'\nimport B from './B'
export const P = () => (<div><A hydrate="load" /><B hydrate="visible" /></div>)`
    const r = transformClientDirectives(src, F)
    expect(r.islands.map((i) => i.component).sort()).toEqual(['A', 'B'])
    expect(r.code).toContain(`() => import("./A")`)
    expect(r.code).toContain(`() => import("./B")`)
  })
})
