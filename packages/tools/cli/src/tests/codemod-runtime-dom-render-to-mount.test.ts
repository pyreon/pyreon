/**
 * `runtime-dom-render-to-mount`: `render` was `export const render = mount`,
 * so switching every import of it from `@pyreon/runtime-dom` to `mount` is
 * semantics-preserving.
 *
 * Bisect-verified: with the transform's edits dropped, every rewrite spec
 * returns `null`.
 */
import { describe, expect, it } from 'vitest'
import { CODEMODS, selectCodemods } from '../codemods'
import { runtimeDomRenderToMount } from '../codemods/runtime-dom-render-to-mount'

const run = (src: string, path = 'main.ts') => runtimeDomRenderToMount.transform(src, path)

describe('runtime-dom-render-to-mount', () => {
  it('renames the import and every reference', () => {
    const src = `import { render } from '@pyreon/runtime-dom'\nconst dispose = render(<App />, el)\nconst api = { render }\nexport type R = typeof render\n`
    expect(run(src, 'main.tsx')).toBe(
      `import { mount } from '@pyreon/runtime-dom'\nconst dispose = mount(<App />, el)\nconst api = { render: mount }\nexport type R = typeof mount\n`,
    )
  })

  it('leaves member names alone', () => {
    const src = `import { render, hydrateRoot } from '@pyreon/runtime-dom'\nrender(a, b)\nobj.render()\nconst o = { render: 1 }\nclass C { render() {} }\n`
    expect(run(src)).toBe(
      `import { mount, hydrateRoot } from '@pyreon/runtime-dom'\nmount(a, b)\nobj.render()\nconst o = { render: 1 }\nclass C { render() {} }\n`,
    )
  })

  it('drops the specifier when mount is already imported', () => {
    expect(run(`import { mount, render } from '@pyreon/runtime-dom'\nrender(a, b)\nmount(c, d)\n`)).toBe(
      `import { mount } from '@pyreon/runtime-dom'\nmount(a, b)\nmount(c, d)\n`,
    )
    expect(run(`import { render, mount } from '@pyreon/runtime-dom'\nrender(a, b)\n`)).toBe(
      `import { mount } from '@pyreon/runtime-dom'\nmount(a, b)\n`,
    )
    expect(run(`import { mount } from '@pyreon/runtime-dom'\nimport { render } from '@pyreon/runtime-dom'\nrender(a, b)\n`)).toBe(
      `import { mount } from '@pyreon/runtime-dom'\nmount(a, b)\n`,
    )
  })

  it('aliases instead of renaming when another render or mount is declared', () => {
    const shadow = `import { render } from '@pyreon/runtime-dom'\nrender(a, b)\nfunction f(render: () => void) { render() }\n`
    expect(run(shadow)).toBe(
      `import { mount as render } from '@pyreon/runtime-dom'\nrender(a, b)\nfunction f(render: () => void) { render() }\n`,
    )
    const otherMount = `import { render } from '@pyreon/runtime-dom'\nimport { mount } from './test-helpers'\nrender(a, b)\nmount()\n`
    expect(run(otherMount)).toContain(`import { mount as render } from '@pyreon/runtime-dom'`)
    const localExport = `import { render } from '@pyreon/runtime-dom'\nexport { render }\n`
    expect(run(localExport)).toBe(`import { mount as render } from '@pyreon/runtime-dom'\nexport { render }\n`)
  })

  it('handles aliased imports, re-exports and namespace imports', () => {
    expect(run(`import { render as r } from '@pyreon/runtime-dom'\nr(a, b)\n`)).toBe(
      `import { mount as r } from '@pyreon/runtime-dom'\nr(a, b)\n`,
    )
    expect(run(`export { render } from '@pyreon/runtime-dom'\n`)).toBe(`export { mount as render } from '@pyreon/runtime-dom'\n`)
    expect(run(`export { render as r } from '@pyreon/runtime-dom'\n`)).toBe(`export { mount as r } from '@pyreon/runtime-dom'\n`)
    expect(run(`import * as dom from '@pyreon/runtime-dom'\ndom.render(a, b)\nother.render()\n`)).toBe(
      `import * as dom from '@pyreon/runtime-dom'\ndom.mount(a, b)\nother.render()\n`,
    )
  })

  it('ignores other modules and is idempotent', () => {
    expect(run(`import { render } from '@pyreon/document'\nrender(doc, 'pdf')\n`)).toBeNull()
    expect(run(`import { render } from 'solid-js/web'\nrender(a, b)\n`)).toBeNull()
    expect(run(`import { mount } from '@pyreon/runtime-dom'\nmount(a, b)\nobj.render()\n`)).toBeNull()
  })

  it('is registered and selected for an upgrade across 0.54.0', () => {
    expect(CODEMODS).toContain(runtimeDomRenderToMount)
    expect(selectCodemods('0.53.0', '0.54.0').map((c) => c.id)).toContain('runtime-dom-render-to-mount')
  })
})
