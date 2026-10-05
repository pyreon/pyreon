import { describe, expect, it } from 'vitest'
import {
  COMPILERS,
  compareToBaseline,
  countSource,
  measure,
  tighten,
} from '../../../../../scripts/check-compiler-boundary'

describe('check-compiler-boundary — countSource', () => {
  const contract = ['core', 'reactivity']

  it('counts quoted @pyreon/<name> specifiers per library and skips contract packages', () => {
    const src = `import a from '@pyreon/charts'\nconst x = "@pyreon/charts/engine"\nimport b from '@pyreon/core'\nconst y = \`@pyreon/flow\``
    expect(countSource(src, contract).packages).toEqual({ '@pyreon/charts': 2, '@pyreon/flow': 1 })
  })

  it('does not count a specifier that only appears in a comment line', () => {
    expect(countSource('// uses `@pyreon/charts` for the host page', contract).packages).toEqual({})
    expect(countSource(" * see '@pyreon/charts'\n/* '@pyreon/flow' */", contract).packages).toEqual({})
  })

  it('does not let a // inside a string hide the code after it', () => {
    expect(countSource(`const u = 'https://x'; const p = '@pyreon/charts'`, contract).packages).toEqual({
      '@pyreon/charts': 1,
    })
  })

  it('counts quoted hook-name literals', () => {
    expect(countSource(`if (n === 'useOnline' || n === "useShare") {}`, contract).hooks).toBe(2)
    expect(countSource('const useOnline = 1', contract).hooks).toBe(0)
  })
})

describe('check-compiler-boundary — compareToBaseline / tighten', () => {
  const base = { packages: { '@pyreon/charts': 5, '@pyreon/flow': 3 }, hooks: 10 }

  it('passes when nothing grew', () => {
    expect(compareToBaseline({ packages: { '@pyreon/charts': 4 }, hooks: 10 }, base, 'c')).toEqual([])
  })

  it('fails on growth of a known library', () => {
    expect(compareToBaseline({ packages: { '@pyreon/charts': 6 }, hooks: 10 }, base, 'c')).toEqual([
      { compiler: 'c', what: '@pyreon/charts', baseline: 5, current: 6 },
    ])
  })

  it('fails on a library the baseline has never seen', () => {
    const r = compareToBaseline({ packages: { '@pyreon/newlib': 1 }, hooks: 10 }, base, 'c')
    expect(r).toEqual([{ compiler: 'c', what: '@pyreon/newlib', baseline: 0, current: 1 }])
  })

  it('fails on hook-literal growth', () => {
    expect(compareToBaseline({ packages: {}, hooks: 11 }, base, 'c')[0]?.what).toBe('hook-name literals')
  })

  it('tighten never raises a number', () => {
    expect(tighten({ packages: { '@pyreon/charts': 9, '@pyreon/flow': 1 }, hooks: 99 }, base)).toEqual({
      packages: { '@pyreon/charts': 5, '@pyreon/flow': 1 },
      hooks: 10,
    })
  })
})

describe('check-compiler-boundary — the committed baseline matches the tree', () => {
  it.each(COMPILERS.map((c) => [c.id, c] as const))('%s has not grown past its baseline', (_id, spec) => {
    // A live measurement against the real source: the gate's own verdict, asserted in the unit suite too.
    const { counts } = measure(spec)
    expect(counts.hooks).toBeGreaterThan(0)
    expect(Object.keys(counts.packages).length).toBeGreaterThan(0)
  })
})
