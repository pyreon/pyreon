/**
 * Rocketstyle discovery — the shape the static scanner structurally cannot see.
 *
 * Uses fake components carrying the real contract (`IS_ROCKETSTYLE` +
 * `getStaticDimensions`) rather than building real rocketstyle chains: the unit
 * under test is the DETECTION and the mapping, and a real chain would drag a
 * theme engine into a test about `Object.keys`. The real chains are covered by
 * the end-to-end scan of the workshop example, which discovers three of them.
 */
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ModuleLoader } from '../load'
import { discoverRocketstyle, readDimensions } from '../rocketstyle'

const rocket = (dimensions: Record<string, Record<string, unknown>>) =>
  Object.assign(() => null, {
    IS_ROCKETSTYLE: true,
    getStaticDimensions: () => ({ dimensions }),
  })

// Served by ABSOLUTE path — the `ModuleLoader.load` contract. Discovery walks
// record cwd-relative paths, and discovery must absolutize before loading (a
// relative id reaches Vite as a bare url whose own relative imports cannot
// resolve — the bug that silently dropped rocketstyle components from any file
// with a `./sibling` import). The fake REJECTS a relative id outright, so every
// spec below doubles as a contract test: revert the `resolve()` in discovery
// and each one fails with "loader received a relative path".
const loaderOf = (modules: Record<string, Record<string, unknown>>): ModuleLoader => ({
  kind: 'runtime',
  load: async (file) => {
    if (!file.startsWith('/')) throw new Error(`loader received a relative path: ${file}`)
    return modules[Object.keys(modules).find((k) => resolve(k) === file) ?? ''] ?? {}
  },
  close: async () => {},
})

describe('detection', () => {
  it('reads dimensions off a rocketstyle component', () => {
    const axes = readDimensions(rocket({ size: { sm: true, lg: true } }), {})
    expect(axes).toEqual([{ name: 'size', values: ['sm', 'lg'] }])
  })

  it('returns undefined — not an empty list — for a plain function', () => {
    // The two answers mean different things: "not a rocketstyle component" must
    // not be mistaken for "a rocketstyle component with no dimensions", or every
    // ordinary function in the file would enter the catalog twice.
    expect(readDimensions(() => null, {})).toBeUndefined()
    expect(readDimensions('not even a function', {})).toBeUndefined()
  })

  it('survives a chain that throws on the theme', () => {
    // Dimension callbacks dereference theme tokens. With no theme, the first
    // read throws — and a scan that dies on one component's styling callback
    // would take the whole catalog with it.
    const thrower = Object.assign(() => null, {
      IS_ROCKETSTYLE: true,
      getStaticDimensions: () => {
        throw new TypeError("undefined is not an object (evaluating 'theme.accent')")
      },
    })
    expect(readDimensions(thrower, undefined)).toEqual([])
  })

  it('drops a dimension with no values', () => {
    expect(readDimensions(rocket({ size: {}, variant: { a: true } }), {})).toEqual([
      { name: 'variant', values: ['a'] },
    ])
  })
})

describe('discovery', () => {
  it('emits intelligence with axes AND matching select controls', async () => {
    const found = await discoverRocketstyle(
      ['a.tsx'],
      { loader: loaderOf({ 'a.tsx': { Button: rocket({ variant: { solid: 1, soft: 1 } }) } }) },
    )
    expect(found).toHaveLength(1)
    expect(found[0]!.name).toBe('Button')
    expect(found[0]!.axes).toEqual([{ name: 'variant', values: ['solid', 'soft'] }])
    expect(found[0]!.controls[0]).toMatchObject({
      name: 'variant',
      kind: 'select',
      options: ['solid', 'soft'],
      required: false,
    })
    // The component itself travels with it, so the mount checks can run.
    expect(found[0]!.component).toBeTypeOf('function')
  })

  it('skips names the static scanner already claimed', async () => {
    // A rocketstyle component wrapped in an exported function is found by BOTH.
    // Emitting it twice puts two entries with one name in the sidebar and
    // doubles every scenario it generates.
    const found = await discoverRocketstyle(
      ['a.tsx'],
      { loader: loaderOf({ 'a.tsx': { Button: rocket({ variant: { solid: 1 } }) } }) },
      new Set(['Button']),
    )
    expect(found).toEqual([])
  })

  it('does not emit the same name twice across files', async () => {
    const mod = { Button: rocket({ variant: { solid: 1 } }) }
    const found = await discoverRocketstyle(['a.tsx', 'b.tsx'], {
      loader: loaderOf({ 'a.tsx': mod, 'b.tsx': mod }),
    })
    expect(found).toHaveLength(1)
    expect(found[0]!.source).toBe('a.tsx')
  })

  it('ignores non-PascalCase exports', async () => {
    // `useThing`, `helpers` — a lowercase export is not a component, whatever
    // flags it happens to carry.
    const found = await discoverRocketstyle(['a.tsx'], {
      loader: loaderOf({ 'a.tsx': { helper: rocket({ v: { a: 1 } }) } }),
    })
    expect(found).toEqual([])
  })

  it('keeps going when a module fails to load', async () => {
    const loader: ModuleLoader = {
      kind: 'runtime',
      load: async (file) => {
        if (file === resolve('bad.tsx')) throw new Error('boom')
        return { Button: rocket({ variant: { solid: 1 } }) }
      },
      close: async () => {},
    }
    const found = await discoverRocketstyle(['bad.tsx', 'good.tsx'], { loader })
    expect(found.map((c) => c.name)).toEqual(['Button'])
  })
})
