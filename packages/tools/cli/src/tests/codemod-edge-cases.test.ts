/**
 * Edge shapes of the `pyreon upgrade` codemods that the per-codemod specs do
 * not reach: which files each one is offered, and the inputs each must leave
 * alone (a codemod that rewrites an ambiguous site changes behaviour, which
 * is the one thing it may never do).
 */
import { describe, expect, it } from 'vitest'
import { CODEMODS } from '../codemods'
import { formUseFormFields } from '../codemods/form-use-form-fields'
import { routerServerLoaderFunctions } from '../codemods/router-server-loader-functions'
import { routerTabsFunction } from '../codemods/router-tabs-function'

describe('codemod file selection (matches)', () => {
  const source = ['a.ts', 'src/a.tsx', 'a.js', 'a.jsx', 'a.mts', 'a.cjs', 'a.mjs', 'a.ctsx']
  const never = ['a.json', 'README.md', 'a.css', 'a.ts.map', 'a.vue']

  it('every source-wide codemod takes JS/TS sources and nothing else', () => {
    for (const cm of CODEMODS.filter((c) => c.id !== 'zero-remove-vite-option')) {
      for (const p of source) expect(cm.matches(p), `${cm.id} should match ${p}`).toBe(true)
      for (const p of never) expect(cm.matches(p), `${cm.id} should not match ${p}`).toBe(false)
    }
  })

  it('zero-remove-vite-option only takes a vite config', () => {
    const cm = CODEMODS.find((c) => c.id === 'zero-remove-vite-option')!
    for (const p of ['vite.config.ts', 'apps/web/vite.config.mjs', 'vite.config.cjs']) expect(cm.matches(p)).toBe(true)
    for (const p of ['src/main.ts', 'my-vite.config.ts', 'vite.config.json', 'vite.config.ts.bak']) {
      expect(cm.matches(p)).toBe(false)
    }
  })
})

describe('router-server-loader-functions edges', () => {
  const run = (src: string, path = 'a.ts') => routerServerLoaderFunctions.transform(src, path)
  const imp = `import { createRouter } from '@pyreon/router'\n`

  it('leaves a receiver that is not a router-named identifier or property', () => {
    expect(run(`${imp}getRouter().preload(p, req)\n`)).toBeNull()
    expect(run(`${imp}routers[0].preload(p, req)\n`)).toBeNull()
    expect(run(`${imp}router?.preload(p, req)\n`)).toBeNull()
  })

  it('rewrites a property receiver ending in router', () => {
    expect(run(`${imp}await app.router.runServerLoaders(p, req)\n`)).toBe(
      `import { createRouter, runServerLoaders } from '@pyreon/router'\nawait runServerLoaders(app.router, p, req)\n`,
    )
  })

  it('only a literal skipLoaders option is unambiguous', () => {
    expect(run(`${imp}router.preload(p, req, { skipLoaders: true, extra: 1 })\n`)).toBeNull()
    expect(run(`${imp}router.preload(p, req, { skipLoaders: flag })\n`)).toBeNull()
    expect(run(`${imp}router.preload(p, req, { other: true })\n`)).toBeNull()
    expect(run(`${imp}router.preload(p, req, { ...opts })\n`)).toBeNull()
    expect(run(`${imp}router.preload(p, req, { skipLoaders: false })\n`)).toBe(
      `import { createRouter, preloadRoute } from '@pyreon/router'\npreloadRoute(router, p, req)\n`,
    )
    expect(run(`${imp}router.preload(p, req, {})\n`)).toBe(
      `import { createRouter, preloadRoute } from '@pyreon/router'\npreloadRoute(router, p, req)\n`,
    )
  })

  it('leaves preload calls with no or too many arguments', () => {
    expect(run(`${imp}router.preload()\n`)).toBeNull()
    expect(run(`${imp}router.preload(a, b, {}, d)\n`)).toBeNull()
    expect(run(`${imp}router.runServerLoaders(a, b, c)\n`)).toBeNull()
  })

  it('adds the import where the file has no value import from @pyreon/router', () => {
    // Only a type import from the router, after another import.
    expect(
      run(`import { x } from './x'\nimport type { Router } from '@pyreon/router'\nimport '@pyreon/zero'\nrouter.preload(p)\n`),
    ).toBe(
      `import { x } from './x'\nimport type { Router } from '@pyreon/router'\nimport '@pyreon/zero'\nimport { preloadRoute } from '@pyreon/router'\npreloadRoute(router, p)\n`,
    )
    // No import statement at all (the Pyreon mention is a comment): prepend.
    expect(run(`// uses @pyreon/zero\nrouter.preload(p)\n`)).toBe(
      `import { preloadRoute } from '@pyreon/router'\n// uses @pyreon/zero\npreloadRoute(router, p)\n`,
    )
    // An empty named import is filled in place.
    expect(run(`import {} from '@pyreon/router'\nrouter.preload(p)\n`)).toBe(
      `import { preloadRoute } from '@pyreon/router'\npreloadRoute(router, p)\n`,
    )
  })

  it('does not import a name the file already imports, and parses TSX', () => {
    expect(run(`import { preloadRoute } from '@pyreon/router'\nrouter.preload(p)\nconst v = <div />\n`, 'a.tsx')).toBe(
      `import { preloadRoute } from '@pyreon/router'\npreloadRoute(router, p)\nconst v = <div />\n`,
    )
  })
})

describe('router-tabs-function edges', () => {
  const run = (src: string, path = 'a.ts') => routerTabsFunction.transform(src, path)

  it('wraps the shorthand { tabs } and parses TSX', () => {
    expect(run(`import { createRouter } from '@pyreon/router'\nconst r = createRouter({ routes, tabs })\nconst v = <a />\n`, 'r.tsx')).toBe(
      `import { createRouter, routerTabs } from '@pyreon/router'\nconst r = createRouter({ routes, tabs: routerTabs(tabs) })\nconst v = <a />\n`,
    )
  })

  it('ignores type-only imports, non-object options, and other properties', () => {
    expect(run(`import type { createRouter } from '@pyreon/router'\ncreateRouter({ tabs: [] })\n`)).toBeNull()
    expect(run(`import { type createRouter } from '@pyreon/router'\ncreateRouter({ tabs: [] })\n`)).toBeNull()
    expect(run(`import * as R from '@pyreon/router'\nR.createRouter({ tabs: [] })\n`)).toBeNull()
    expect(run(`import { createRouter } from '@pyreon/router'\ncreateRouter(opts)\nconst tabs = 1\n`)).toBeNull()
    expect(run(`import { createRouter } from '@pyreon/router'\ncreateRouter()\nconst tabs = 1\n`)).toBeNull()
    expect(run(`import { createRouter } from '@pyreon/router'\ncreateRouter({ ['tabs']: [] })\n`)).toBeNull()
  })

  it('adds routerTabs to the value import, skipping type-only and namespace router imports', () => {
    const src = `import type { Router } from '@pyreon/router'\nimport * as R from '@pyreon/router'\nimport { createRouter } from '@pyreon/router'\ncreateRouter({ tabs: [] })\n`
    expect(run(src)).toBe(
      `import type { Router } from '@pyreon/router'\nimport * as R from '@pyreon/router'\nimport { createRouter, routerTabs } from '@pyreon/router'\ncreateRouter({ tabs: routerTabs([]) })\n`,
    )
  })
})

describe('form-use-form-fields edges', () => {
  const run = (src: string, path = 'a.ts') => formUseFormFields.transform(src, path)

  it('drops a trailing `field` specifier', () => {
    expect(run(`import { useForm, field } from '@pyreon/form'\nuseForm({ fields: [field('a', 1)], onSubmit })\n`)).toBe(
      `import { useForm } from '@pyreon/form'\nuseForm({ initialValues: { a: 1 }, onSubmit })\n`,
    )
  })

  it('keeps a default import when only the `field` binding beside it goes', () => {
    const src = `import Form, { field } from '@pyreon/form'\nimport { useForm } from '@pyreon/form'\nuseForm({ fields: [field('a', 1)], onSubmit })\nexport { Form }\n`
    expect(run(src)).toBe(
      `import Form from '@pyreon/form'\nimport { useForm } from '@pyreon/form'\nuseForm({ initialValues: { a: 1 }, onSubmit })\nexport { Form }\n`,
    )
  })

  it('leaves non-literal arrays, empty arrays and too many field() arguments', () => {
    const imp = `import { field, useForm } from '@pyreon/form'\n`
    expect(run(`${imp}useForm({ fields: defs, onSubmit })\n`)).toBeNull()
    expect(run(`${imp}useForm({ fields: [], onSubmit })\n`)).toBeNull()
    expect(run(`${imp}useForm({ fields: [field('a', 1, v, extra)], onSubmit })\n`)).toBeNull()
    expect(run(`${imp}useForm({ fields: [field('a')], onSubmit })\n`)).toBeNull()
    expect(run(`${imp}useForm({ fields: [field('a', ...rest)], onSubmit })\n`)).toBeNull()
    expect(run(`${imp}useForm({ fields, onSubmit })\nconst fields = 1\n`)).toBeNull()
    expect(run(`${imp}useForm(opts)\nconst fields = 1\n`)).toBeNull()
  })

  it('wraps a non-trivial default in parentheses before an `as` type argument', () => {
    const src = `import { field, useForm } from '@pyreon/form'\nuseForm({ fields: [field<'n', number>('n', a + b)], onSubmit })\n`
    expect(run(src)).toBe(`import { useForm } from '@pyreon/form'\nuseForm({ initialValues: { n: (a + b) as number }, onSubmit })\n`)
  })

  it('keeps a declaration that shares its statement with another one', () => {
    const src = `import { field, useForm } from '@pyreon/form'\nconst a = field('a', 1), b = 2\nuseForm({ fields: [a], onSubmit })\nexport { b }\n`
    const out = run(src) as string
    expect(out).toContain(`useForm({ initialValues: { a: 1 }, onSubmit })`)
    expect(out).toContain(`const a = field('a', 1), b = 2`)
  })
})
