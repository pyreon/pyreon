// The import PRE-SCANS: every `@pyreon/*` warning and every name-binding
// collector in `parse.ts` is keyed on the IMPORT, not on the bare name, so a
// user's own `Switch` / `SizedMap` / `toast` is never mis-lowered and never
// warned about.
//
// Two axes are easy to get wrong and are what these specs pin:
//
//  * SPECIFIER SHAPE. A default import, a namespace import, a whole-module
//    `import type`, and a per-specifier `{ type X }` are all things the scan
//    must walk PAST — each one names no runtime symbol the emit could lower,
//    so warning about it is always wrong. The named specifier beside it in the
//    same statement still has to be seen.
//
//  * SUPPRESSION. Several blanket warnings are suppressed when the symbol
//    ACTUALLY lowers in this file (`s.object(...)`, `createHttp({ schema })`,
//    a `/webview` bridge subpath). A blanket line printed directly above the
//    struct it denies is worse than no line, so each suppression is paired
//    here with the neighbouring shape that must still warn.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'

const mod = (head: string, extra = ''): string => `${head}
import { Stack, Text } from '${P}'
${extra}
export function S() { return (<Stack><Text>hi</Text></Stack>) }`

const warnings = (src: string): string[] => transform(src, { target: 'swift' }).warnings
const has = (src: string, needle: string): boolean => warnings(src).some((w) => w.includes(needle))

describe('unlowered-module warnings — specifier shapes', () => {
  it('a NAMED specifier from an unlowered module warns by symbol', () => {
    expect(has(mod(`import { SkipLink } from '@pyreon/a11y'`), 'SkipLink (from @pyreon/a11y)')).toBe(true)
  })

  it('a whole-module `import type` warns about nothing — TS erases it', () => {
    expect(warnings(mod(`import type { SkipLink } from '@pyreon/a11y'`))).toEqual([])
  })

  it('a PER-SPECIFIER `type` is skipped while its value neighbour still warns', () => {
    const w = warnings(mod(`import { type LiveRegionProps, SkipLink } from '@pyreon/a11y'`))
    expect(w.some((m) => m.includes('SkipLink (from'))).toBe(true)
    expect(w.some((m) => m.includes('LiveRegionProps'))).toBe(false)
  })

  it('a DEFAULT specifier is skipped while its named neighbour still warns', () => {
    const w = warnings(mod(`import A11y, { SkipLink } from '@pyreon/a11y'`))
    expect(w.some((m) => m.includes('SkipLink (from'))).toBe(true)
    expect(w).toHaveLength(1)
  })

  it('a NAMESPACE import names no specifier, so nothing warns', () => {
    expect(warnings(mod(`import * as A11y from '@pyreon/a11y'`))).toEqual([])
  })

  it('a `/webview` SUBPATH is the documented native bridge and stays exempt', () => {
    // The blanket line used to tell the author to reach for the bridge subpath
    // they had just imported.
    expect(warnings(mod(`import { Renderer } from '@pyreon/charts/webview'`))).toEqual([])
  })
})

describe('unlowered control-flow warnings (@pyreon/core)', () => {
  it('a control-flow component with no lowering is named with its replacement', () => {
    expect(has(mod(`import { Switch } from '@pyreon/core'`), '<Switch> has NO native lowering')).toBe(true)
  })

  it('a DEFAULT specifier beside it is skipped', () => {
    const w = warnings(mod(`import Core, { Switch } from '@pyreon/core'`))
    expect(w.some((m) => m.includes('<Switch>'))).toBe(true)
  })

  it('an ARBITRARY-STRING import name is read through its literal value', () => {
    // ES2022 `import { "Switch" as Sw }` binds the same export; the scan must
    // read `imported.value`, not only `imported.name`.
    expect(has(mod(`import { 'Switch' as Sw } from '@pyreon/core'`), '<Switch> has NO native lowering')).toBe(true)
  })

  it('the same name from a USER module is untouched', () => {
    expect(warnings(mod(`import { Switch } from './my-components'`))).toEqual([])
  })

  it('each unlowered name is reported ONCE, however many times it is imported', () => {
    const w = warnings(
      mod(`import { Switch } from '@pyreon/core'\nimport { Switch as S2 } from '@pyreon/core'`),
    )
    expect(w.filter((m) => m.includes('<Switch>'))).toHaveLength(1)
  })
})

describe('@pyreon/validate `s` — the blanket warning is suppressed only when it LOWERS', () => {
  const V = `import { s } from '@pyreon/validate'`
  const sWarn = (src: string): boolean => has(src, 's (from @pyreon/validate)')

  it('a top-level `s.object({ … })` declaration lowers, so `s` is silent', () => {
    expect(sWarn(mod(V, `export const Sch = s.object({ a: s.string() })`))).toBe(false)
  })

  it('`s.discriminatedUnion(...)` counts as the lowered shape too', () => {
    expect(sWarn(mod(V, `const Sch = s.discriminatedUnion('k', [])`))).toBe(false)
  })

  it('an INLINE `s.object({ … }).safeParse(x)` inside a body also suppresses it', () => {
    expect(sWarn(mod(V, `const q = s.object({ a: s.string() }).safeParse(1)`))).toBe(false)
  })

  it('a `.safeParse` on a bare identifier is NOT our shape — `s` still warns', () => {
    expect(sWarn(mod(V, `const q = schema.safeParse(1)`))).toBe(true)
  })

  it('a `.safeParse` on a CALL result is not our shape either', () => {
    expect(sWarn(mod(V, `const q = makeSchema().safeParse(1)`))).toBe(true)
  })

  it('`<other>.object({ … }).safeParse(x)` is not ours — the namespace has to be `s`', () => {
    expect(sWarn(mod(V, `const q = zod.object({ a: 1 }).safeParse(1)`))).toBe(true)
  })

  it('`s.array(...).safeParse(x)` is not the lowered shape — only `.object` is', () => {
    expect(sWarn(mod(V, `const q = s.array(s.string()).safeParse(1)`))).toBe(true)
  })

  it('`s.object(<identifier>)` is not a literal shape, so it does not suppress', () => {
    expect(sWarn(mod(V, `const q = s.object(shape).safeParse(1)`))).toBe(true)
  })

  it('an ALIASED `s` is tracked by its LOCAL name', () => {
    expect(
      has(
        mod(`import { s as v } from '@pyreon/validate'`, `const q = v.object({ a: v.string() }).safeParse(1)`),
        's (from @pyreon/validate)',
      ),
    ).toBe(false)
  })

  it('a DEFAULT specifier from @pyreon/validate binds no `s` name', () => {
    // Nothing is tracked, so the pre-scan returns early and the import warns
    // for whatever named symbols it does carry.
    expect(warnings(mod(`import V from '@pyreon/validate'`))).toEqual([])
  })
})

describe('createHttp({ schema }) suppresses the blanket line for that name', () => {
  it('a name used ONLY as a client schema is silent — the declaration emits nothing', () => {
    const src = mod(
      `import { createHttp } from '@pyreon/http'\nimport { SkipLink } from '@pyreon/a11y'`,
      `const api = createHttp({ baseUrl: '/api', schema: SkipLink })`,
    )
    expect(warnings(src)).toEqual([])
  })

  it('the same import WITHOUT that use still warns', () => {
    const src = mod(
      `import { createHttp } from '@pyreon/http'\nimport { SkipLink } from '@pyreon/a11y'`,
      `const api = createHttp({ baseUrl: '/api' })`,
    )
    expect(warnings(src).some((m) => m.includes('SkipLink (from'))).toBe(true)
  })

  it('a NON-identifier schema binds no name to suppress', () => {
    const src = mod(
      `import { createHttp } from '@pyreon/http'\nimport { SkipLink } from '@pyreon/a11y'`,
      `const api = createHttp({ baseUrl: '/api', schema: makeSchema() })`,
    )
    expect(warnings(src).some((m) => m.includes('SkipLink (from'))).toBe(true)
  })
})

describe('name-binding collectors keyed on the import', () => {
  it('@pyreon/sized-map: a DIFFERENT named import binds no SizedMap name', () => {
    expect(warnings(mod(`import { Foo } from '@pyreon/sized-map'`))).toEqual([])
  })

  it('@pyreon/sized-map: a default specifier beside the named one is walked past', () => {
    expect(warnings(mod(`import SM, { SizedMap } from '@pyreon/sized-map'`))).toEqual([])
  })

  it('@pyreon/toast: an import that is not `toast` binds no toast name', () => {
    expect(warnings(mod(`import { Toaster } from '@pyreon/toast'`))).toEqual([])
  })

  it('@pyreon/a11y: an import that is not `announce` binds no announce name', () => {
    // `SkipLink` is unlowered, so the ONE warning here is the blanket line —
    // proof the announce collector walked past it rather than claiming it.
    expect(warnings(mod(`import { SkipLink } from '@pyreon/a11y'`))).toHaveLength(1)
  })
})

describe('@pyreon/kinetic factory recognition', () => {
  const K = `import { kinetic } from '@pyreon/kinetic'`
  const KP = `import { fadeUp, blurIn } from '@pyreon/kinetic-presets'`

  it('a MAPPED named preset lowers — no "no native analogue" line', () => {
    const w = warnings(mod(`${K}\n${KP}`, `const Fx = kinetic('div').preset(fadeUp)`))
    expect(w.some((m) => m.includes('no native analogue'))).toBe(false)
  })

  it('an UNMAPPED named preset names the preset, not the factory', () => {
    const w = warnings(mod(`${K}\n${KP}`, `const Fx = kinetic('div').preset(blurIn)`))
    expect(w.some((m) => m.includes('the `blurIn` preset has no native analogue'))).toBe(true)
  })

  it('a preset identifier that is NOT imported from kinetic-presets falls back to the factory line', () => {
    const w = warnings(mod(K, `const Fx = kinetic('div').preset(mystery)`))
    expect(w.some((m) => m.includes('no native analogue'))).toBe(false)
    expect(w.some((m) => m.includes('built by the `kinetic()` factory'))).toBe(true)
  })

  it('a NON-identifier, NON-string preset argument falls back to the factory line', () => {
    const w = warnings(mod(K, `const Fx = kinetic('div').preset(42)`))
    expect(w.some((m) => m.includes('built by the `kinetic()` factory'))).toBe(true)
  })

  it('a NAMESPACE kinetic-presets import binds no preset names', () => {
    const w = warnings(
      mod(`${K}\nimport * as KP from '@pyreon/kinetic-presets'`, `const Fx = kinetic('div').preset(KP.fadeUp)`),
    )
    expect(w.some((m) => m.includes('no native analogue'))).toBe(false)
  })

  it('a kinetic import that is NOT `kinetic` binds no factory name', () => {
    // Nothing is tracked, so the chain is never inspected at all.
    expect(warnings(mod(`import { Transition } from '@pyreon/kinetic'`, `const Fx = kinetic('div')`)))
      .toEqual([])
  })

  it('a bare `let` beside a tracked kinetic import is skipped by the chain scan', () => {
    const w = warnings(mod(K, `let solo\nconst Fx = kinetic('div')`))
    expect(w.some((m) => m.includes('built by the `kinetic()` factory'))).toBe(true)
  })

  it('a STRING preset is taken at face value', () => {
    const w = warnings(mod(K, `const Fx = kinetic('div').preset('fade')`))
    expect(w.some((m) => m.includes('no native analogue'))).toBe(false)
  })
})

describe('collectors that DO bind a name', () => {
  it('@pyreon/toast: importing `toast` itself binds the name and warns about nothing', () => {
    expect(warnings(mod(`import { toast } from '@pyreon/toast'`))).toEqual([])
  })

  it('@pyreon/a11y: importing `announce` binds it under its LOCAL name', () => {
    expect(warnings(mod(`import { announce } from '@pyreon/a11y'`))).toEqual([])
    expect(warnings(mod(`import { announce as say } from '@pyreon/a11y'`))).toEqual([])
  })
})

describe('unlowered-HOOK warnings', () => {
  it('a `use*` import with no native lowering is named once per symbol', () => {
    const w = warnings(
      mod(`import { useLiveRegion } from '@pyreon/a11y'\nimport { useLiveRegion as u2 } from '@pyreon/a11y'`),
    )
    expect(w.filter((m) => m.includes('useLiveRegion()'))).toHaveLength(1)
  })

  it('a hook imported from a SUBPATH still gets its package\'s own advice', () => {
    // Root-normalised: `@pyreon/charts/plot` has to find the `@pyreon/charts`
    // entry, or the message degrades to the generic tail.
    const w = warnings(mod(`import { useZoom } from '@pyreon/charts/plot'`))
    expect(w.some((m) => m.includes('useZoom() (from @pyreon/charts/plot)'))).toBe(true)
    expect(w.some((m) => m.includes('Or keep it behind a `<Web>` escape hatch.'))).toBe(true)
  })

  it('a LOWERED hook is never warned about', () => {
    expect(warnings(mod(`import { useOnline } from '@pyreon/hooks'`))
      .some((m) => m.includes('useOnline()'))).toBe(false)
  })
})
