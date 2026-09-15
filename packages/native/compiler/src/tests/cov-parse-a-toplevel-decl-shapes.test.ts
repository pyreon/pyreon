// Every top-level recognizer in `parse.ts` — styled / rocketstyle / attrs /
// defineStore / model / withField / defineFeature — opens with the SAME
// precondition pair: a `const` statement holding EXACTLY ONE declarator whose
// id is a plain Identifier. Both halves are silent bails, so the failure mode
// they produce is "my declaration compiled to nothing", with no diagnostic to
// read.
//
// Each spec pairs the shape that LOWERS with the neighbouring shape that must
// not, so the assertion is about the emitted code rather than about the
// recognizer's internals. Two declarators in one statement (`const A = …, b =
// 1`) and a destructured binding (`const { A } = mod`) are the two spellings
// that reach those guards from ordinary source.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'
const swift = (src: string): string => transform(src, { target: 'swift' }).code
const kotlin = (src: string): string => transform(src, { target: 'kotlin' }).code
const warnings = (src: string): string[] => transform(src, { target: 'swift' }).warnings

const mod = (decls: string, body = '<Text>hi</Text>'): string =>
  `import { Stack, Text } from '${P}'
import { styled } from '@pyreon/styler'
${decls}
export function S() { return (<Stack>${body}</Stack>) }`

const STORE_SETUP = `() => { const n = signal(0); return { n } }`
const storeMod = (decls: string): string =>
  `import { Stack, Text } from '${P}'
${decls}
export function S() { const a = useApp(); return (<Stack><Text>{String(a.n())}</Text></Stack>) }`

describe('top-level recognizers — exactly ONE declarator', () => {
  it('styled(): one declarator lowers the CSS; a second declarator in the same statement does not', () => {
    const one = mod("const Boxy = styled(Stack)`padding: 4px;`", '<Boxy><Text>hi</Text></Boxy>')
    expect(swift(one)).toContain('.padding(4)')

    // Same declaration, one extra declarator: the recognizer bails, so `<Boxy>`
    // is left as an unresolved component call with no style attached.
    const two = mod("const Boxy = styled(Stack)`padding: 4px;`, other = 1", '<Boxy><Text>hi</Text></Boxy>')
    expect(swift(two)).not.toContain('.padding(4)')
    expect(swift(two)).toContain('Boxy')
  })

  it('defineStore(): one declarator emits the store singleton; two emit nothing', () => {
    const one = storeMod(`const useApp = defineStore('app', ${STORE_SETUP})`)
    expect(swift(one)).toContain('PyreonStore_app')
    expect(kotlin(one)).toContain('PyreonStore_app')

    const two = storeMod(`const useApp = defineStore('app', ${STORE_SETUP}), other = 1`)
    expect(swift(two)).not.toContain('PyreonStore_app')
    expect(kotlin(two)).not.toContain('PyreonStore_app')
  })

  it('model(): one declarator emits the model singleton; two emit nothing', () => {
    const one = mod(`const m = model({ state: { c: 1 } }).create()`)
    expect(swift(one)).toContain('PyreonModel_m')

    const two = mod(`const m = model({ state: { c: 1 } }).create(), other = 1`)
    expect(swift(two)).not.toContain('PyreonModel_m')
  })

  it('defineFeature(): one declarator emits the feature struct; two emit nothing', () => {
    const one = mod(`const F = defineFeature({ name: 'todo', schema: { a: 'string' } })`)
    expect(swift(one)).toContain('PyreonFeature_F')

    const two = mod(`const F = defineFeature({ name: 'todo', schema: { a: 'string' } }), other = 1`)
    expect(swift(two)).not.toContain('PyreonFeature_F')
  })
})

describe('top-level recognizers — the id must be a plain Identifier', () => {
  it('a DESTRUCTURED top-level const is skipped silently by every recognizer', () => {
    // Not a component, not a store, not a module decl — and deliberately not a
    // warning either: a destructured module binding is ordinary source that
    // simply has no native emit of its own.
    const src = mod(`const { Boxy } = mod`, '<Boxy><Text>hi</Text></Boxy>')
    expect(warnings(src)).toEqual([])
    expect(swift(src)).not.toContain('.padding(4)')
    // The module-decl collector skips it too — no `let`/`var` binding is emitted
    // for the destructured name.
    expect(swift(src)).not.toMatch(/\b(let|var) Boxy\b/)
  })

  it('a destructured store binding does NOT produce a store singleton', () => {
    const src = storeMod(`const { useApp } = mod`)
    expect(swift(src)).not.toContain('PyreonStore_')
  })

  it('a bare `let x` with no initializer is skipped, while an initialized one emits', () => {
    const bare = mod(`let solo`)
    expect(swift(bare)).not.toMatch(/\bvar solo\b/)

    const withInit = mod(`let solo = 3`)
    expect(swift(withInit)).toMatch(/\bvar solo\b/)
    expect(kotlin(withInit)).toMatch(/\bvar solo\b/)
  })
})

describe('top-level declaration kinds PMTC drops', () => {
  it('a TS `enum` warns by name and points at the string-union alias', () => {
    const w = warnings(mod(`enum Colour { Red }`))
    expect(w.some((m) => m.includes('`enum Colour`') && m.includes("type Colour = 'a' | 'b'"))).toBe(true)
  })

  it('a `class` warns by name; an exported one warns identically', () => {
    expect(warnings(mod(`class Repo {}`)).some((m) => m.includes('`class Repo`'))).toBe(true)
    expect(warnings(mod(`export class Repo {}`)).some((m) => m.includes('`class Repo`'))).toBe(true)
  })

  it('a string-union type ALIAS — the supported shape — warns about nothing', () => {
    expect(warnings(mod(`type Colour = 'red' | 'blue'`))).toEqual([])
  })
})

describe('module-scope string consts feed the statically-known-string reads', () => {
  const http = (decls: string): string => `
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '${P}'
interface User { id: string }
${decls}
const ep = api.endpoint('GET /users')
export function S() {
  const u = useFetch<User>(ep())
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}`

  it('a const holding a plain string literal resolves as a baseUrl', () => {
    expect(swift(http(`const BASE = '/str'\nconst api = createHttp({ baseUrl: BASE })`)))
      .toContain('"/str/users"')
  })

  it('a const holding an INTERPOLATION-FREE template resolves identically', () => {
    // A template with no `${}` is a string spelled differently, so it must
    // resolve exactly as the quoted form does.
    expect(swift(http('const BASE = `/tpl`\nconst api = createHttp({ baseUrl: BASE })')))
      .toContain('"/tpl/users"')
  })

  it('a template WITH an interpolation is not statically known — the call stays web', () => {
    const w = transform(
      http('const X = "z"\nconst BASE = `/a${X}`\nconst api = createHttp({ baseUrl: BASE })'),
      { target: 'swift' },
    ).warnings
    expect(w.some((m) => m.includes('needs a LITERAL baseUrl on client api'))).toBe(true)
  })

  it('a `let` binding is NOT collected as a string const, even holding a literal', () => {
    // Deliberately narrow: `const` only. A `let` can be reassigned, so baking
    // its first value would ship a stale URL.
    const w = transform(http(`let BASE = '/str'\nconst api = createHttp({ baseUrl: BASE })`), {
      target: 'swift',
    }).warnings
    expect(w.some((m) => m.includes('needs a LITERAL baseUrl on client api'))).toBe(true)
  })
})
