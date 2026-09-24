/**
 * Branch-coverage specs for `project-scanner.ts`, `defer-inline.ts` and
 * `client-directives.ts`, through their public entry points
 * (`generateContext`, `transformDeferInline`, `transformClientDirectives`).
 *
 * The scanner is a filesystem walker, so its fixtures are real temp trees;
 * the two transforms take source text, so theirs are source snippets. Each
 * spec pairs the input that takes an arm with the neighbouring input that
 * must not — a route file the walker skips beside the sibling it keeps, an
 * import shape the Defer rewrite declines beside the one it accepts.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { transformClientDirectives } from '../client-directives'
import { transformDeferInline } from '../defer-inline'
import { generateContext } from '../project-scanner'

const cleanups: string[] = []
afterEach(() => {
  while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true })
})

function makeApp() {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-cov-scanner-'))
  cleanups.push(root)
  return {
    root,
    write(rel: string, body: string) {
      const abs = join(root, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, body, 'utf8')
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// project-scanner — route enumeration
// ═══════════════════════════════════════════════════════════════════════════

describe('project-scanner — route file enumeration', () => {
  it('skips dotfiles, node_modules, test/spec/story and .server siblings', () => {
    const app = makeApp()
    const page = `export default function P(){ return null }`
    app.write('src/routes/.hidden.tsx', page)
    app.write('src/routes/node_modules/dep.tsx', page)
    app.write('src/routes/about.test.tsx', page)
    app.write('src/routes/about.spec.tsx', page)
    app.write('src/routes/about.stories.tsx', page)
    app.write('src/routes/about.server.ts', `export const serverLoader = () => ({})`)
    app.write('src/routes/styles.css', 'body{}')
    app.write('src/routes/about.tsx', page)
    const ctx = generateContext(app.root)
    expect(ctx.routes.map((r) => r.path)).toEqual(['/about'])
  })

  it('reports an api/ route with isApi and a page route without', () => {
    const app = makeApp()
    app.write('src/routes/api/posts.ts', `export function GET(){ return new Response('') }`)
    app.write('src/routes/index.tsx', `export default function H(){ return null }`)
    const ctx = generateContext(app.root)
    const api = ctx.routes.find((r) => r.isApi)
    expect(api).toBeDefined()
    expect(ctx.routes.find((r) => r.path === '/')?.isApi).toBeUndefined()
  })

  it('finds the routes dir under each supported convention', () => {
    for (const dir of ['src/routes', 'app/routes', 'routes']) {
      const app = makeApp()
      app.write(`${dir}/about.tsx`, `export default function P(){ return null }`)
      expect(generateContext(app.root).routes.map((r) => r.path)).toEqual(['/about'])
    }
  })
})

describe('project-scanner — island extraction', () => {
  function scan(src: string, rel = 'src/widget.tsx') {
    const app = makeApp()
    app.write(rel, src)
    return generateContext(app.root).islands
  }

  it('reads an explicit string-literal name and a template-literal one', () => {
    expect(scan(`export const A = island(loader, { name: 'Explicit' })`)[0]?.name).toBe('Explicit')
    expect(scan('export const A = island(loader, { name: `Tpl` })')[0]?.name).toBe('Tpl')
  })

  it('reads a string-literal option KEY and skips a computed one', () => {
    expect(scan(`export const A = island(loader, { 'name': 'Quoted' })`)[0]?.name).toBe('Quoted')
    // A computed key resolves to '' and matches neither `name` nor `hydrate`,
    // so the binding-derived name wins and hydrate falls back to 'load'.
    const derived = scan(`export const A = island(loader, { [k]: 'x' })`)[0]
    expect(derived?.name).toMatch(/^A\$/)
    expect(derived?.hydrate).toBe('load')
  })

  it('skips a spread and an unrecognized key in the options object', () => {
    const i = scan(`export const A = island(loader, { ...base, prefetch: 'idle', hydrate: 'visible' })`)[0]
    expect(i?.hydrate).toBe('visible')
    expect(i?.name).toMatch(/^A\$/)
  })

  it('declines a non-object options argument entirely', () => {
    const i = scan(`export const A = island(loader, opts)`)[0]
    expect(i?.name).toMatch(/^A\$/)
    expect(i?.hydrate).toBe('load')
  })

  it('declines a non-literal `name` value and falls back to the derived name', () => {
    expect(scan(`export const A = island(loader, { name: computed })`)[0]?.name).toMatch(/^A\$/)
  })

  it('falls back to the FILE BASENAME for a bindingless island() call', () => {
    // No enclosing `const X = …` binding, so `deriveIslandName` has nothing
    // to key on and the basename placeholder is used instead.
    expect(scan(`export default island(loader, { hydrate: 'idle' })`, 'src/panel.tsx')[0]?.name).toBe(
      'panel',
    )
  })

  it('ignores an island() call with ZERO arguments', () => {
    expect(scan(`const A = island()`)).toEqual([])
  })
})

describe('project-scanner — version resolution', () => {
  it('prefers a @pyreon/* dependency range over the package version', () => {
    const app = makeApp()
    app.write(
      'package.json',
      JSON.stringify({ version: '9.9.9', dependencies: { '@pyreon/core': '^1.2.3' } }),
    )
    expect(generateContext(app.root).version).toBe('1.2.3')
  })

  it('skips a non-@pyreon dep AND a @pyreon dep whose range is not a string', () => {
    const app = makeApp()
    app.write(
      'package.json',
      JSON.stringify({
        version: '4.5.6',
        dependencies: { lodash: '^1.0.0', '@pyreon/weird': { npm: 'x' } },
      }),
    )
    expect(generateContext(app.root).version).toBe('4.5.6')
  })

  it('reports `unknown` when package.json cannot be read', () => {
    const app = makeApp()
    expect(generateContext(app.root).version).toBe('unknown')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// defer-inline
// ═══════════════════════════════════════════════════════════════════════════

const DEFER_SRC = (imports: string, body: string) =>
  `${imports}\nexport function P() {\n  return (\n    <Defer when={x}>\n      ${body}\n    </Defer>\n  )\n}\n`

describe('defer-inline — language detection by filename', () => {
  const src = DEFER_SRC(`import { Modal } from './modal'`, `<Modal />`)

  it('rewrites a .tsx file', () => {
    expect(transformDeferInline(src, 'a.tsx').changed).toBe(true)
  })

  it('rewrites a .jsx file', () => {
    expect(transformDeferInline(src, 'a.jsx').changed).toBe(true)
  })

  it('declines JSX in a .ts file (parsed as TS, not TSX) without throwing', () => {
    const r = transformDeferInline(src, 'a.ts')
    expect(r.changed).toBe(false)
    expect(r.code).toBe(src)
  })

  it('declines JSX in a .js file the same way', () => {
    expect(transformDeferInline(src, 'a.js').changed).toBe(false)
  })
})

describe('defer-inline — child-shape analysis', () => {
  it('warns on a LOWERCASE identifier child and rewrites the capitalised sibling', () => {
    const lower = transformDeferInline(DEFER_SRC(`import { Modal } from './m'`, `<div />`), 'a.tsx')
    expect(lower.changed).toBe(false)
    expect(lower.warnings.map((w) => w.code)).toEqual(['defer-inline/non-component-child'])

    const upper = transformDeferInline(DEFER_SRC(`import { Modal } from './m'`, `<Modal />`), 'a.tsx')
    expect(upper.changed).toBe(true)
    expect(upper.warnings).toEqual([])
  })

  it('warns on a NAMESPACED JSX child name (neither identifier nor member)', () => {
    const r = transformDeferInline(DEFER_SRC(`import { Modal } from './m'`, `<svg:rect />`), 'a.tsx')
    expect(r.changed).toBe(false)
    expect(r.warnings.map((w) => w.code)).toEqual(['defer-inline/non-component-child'])
  })
})

describe('defer-inline — import lookup', () => {
  it('walks PAST a non-matching default specifier to the matching one', () => {
    const r = transformDeferInline(
      DEFER_SRC(`import Other from './other'\nimport Modal from './modal'`, `<Modal />`),
      'a.tsx',
    )
    expect(r.changed).toBe(true)
    expect(r.code).toContain(`chunk={() => import('./modal')}`)
  })

  it('walks PAST a non-matching namespace specifier to the matching one', () => {
    const r = transformDeferInline(
      DEFER_SRC(`import * as Other from './other'\nimport * as M from './m'`, `<M.Modal />`),
      'a.tsx',
    )
    expect(r.changed).toBe(true)
    expect(r.code).toContain(`__m.Modal`)
  })

  it('keeps a side-effect import (no specifiers) out of the lookup', () => {
    const r = transformDeferInline(
      DEFER_SRC(`import './side-effect.css'\nimport { Modal } from './modal'`, `<Modal />`),
      'a.tsx',
    )
    expect(r.changed).toBe(true)
    expect(r.code).toContain(`import './side-effect.css'`)
  })

  it('tolerates an ARRAY ELISION elsewhere in the file (a null AST child)', () => {
    // `[, 1]` parses to `elements: [null, Literal]`; the walkers must not
    // dereference the hole.
    const r = transformDeferInline(
      `import { Modal } from './modal'\nconst sparse = [, 1]\n` +
        `export function P() { return (<Defer when={x}><Modal /></Defer>) }\n`,
      'a.tsx',
    )
    expect(r.changed).toBe(true)
    expect(r.code).toContain('const sparse = [, 1]')
  })
})

describe('defer-inline — import removal edits', () => {
  it('removes a trailing-newline-less single-specifier import at EOF', () => {
    // The whole declaration goes; the `code[end] === newline` bump has
    // nothing to eat because the declaration ends the file.
    const code =
      `export function P() { return (<Defer when={x}><Modal /></Defer>) }\n` +
      `import { Modal } from './modal'`
    const r = transformDeferInline(code, 'a.tsx')
    expect(r.changed).toBe(true)
    expect(r.code).not.toContain(`from './modal'`)
  })

  it('drops the FIRST specifier of a multi-specifier import', () => {
    const r = transformDeferInline(
      DEFER_SRC(`import { Modal, Other } from './m'\nconst keep = Other`, `<Modal />`),
      'a.tsx',
    )
    expect(r.changed).toBe(true)
    expect(r.code).toContain(`import { Other } from './m'`)
  })

  it('drops a LATER specifier of a multi-specifier import', () => {
    const r = transformDeferInline(
      DEFER_SRC(`import { Other, Modal } from './m'\nconst keep = Other`, `<Modal />`),
      'a.tsx',
    )
    expect(r.changed).toBe(true)
    expect(r.code).toContain(`import { Other } from './m'`)
    // The binding is gone from the import; the name survives only inside the
    // generated chunk's `__m.Modal` export pick.
    expect(r.code).toContain('__m.Modal')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// client-directives
// ═══════════════════════════════════════════════════════════════════════════

describe('client-directives — strategy identifiers + import shapes', () => {
  it('falls back to the `load` fragment for a strategy that sanitizes to empty', () => {
    const r = transformClientDirectives(
      `import { Widget } from './widget'\nexport const P = () => <Widget hydrate="---" />\n`,
      '/app/src/p.tsx',
    )
    expect(r.changed).toBe(true)
    expect(r.islands.map((i) => i.hydrate)).toEqual(['---'])
    expect(r.code).toContain('load')
  })

  it('distinguishes two parameterized strategies sharing a base', () => {
    const r = transformClientDirectives(
      `import { A } from './a'\nimport { B } from './b'\n` +
        `export const P = () => <><A hydrate="media(min-width: 1px)" /><B hydrate="media(min-width: 999px)" /></>\n`,
      '/app/src/p.tsx',
    )
    expect(r.changed).toBe(true)
    expect(new Set(r.islands.map((i) => i.name)).size).toBe(2)
  })

  it('ignores a side-effect import (no import clause) while binding the real one', () => {
    const r = transformClientDirectives(
      `import './reset.css'\nimport { Widget } from './widget'\n` +
        `export const P = () => <Widget hydrate="visible" />\n`,
      '/app/src/p.tsx',
    )
    expect(r.changed).toBe(true)
    expect(r.islands).toHaveLength(1)
  })

  it('warns on a namespace-imported component and on an unimported one', () => {
    const ns = transformClientDirectives(
      `import * as M from './m'\nexport const P = () => <M hydrate="visible" />\n`,
      '/app/src/p.tsx',
    )
    expect(ns.changed).toBe(false)
    expect(ns.warnings[0]?.message).toContain('namespace imports are not supported')

    const missing = transformClientDirectives(
      `export const P = () => <Widget hydrate="visible" />\n`,
      '/app/src/p.tsx',
    )
    expect(missing.changed).toBe(false)
    expect(missing.warnings[0]?.message).toContain('not an imported component')
  })
})

describe('client-directives — hydrate attribute value shapes', () => {
  function run(attr: string) {
    return transformClientDirectives(
      `import { Widget } from './widget'\nexport const P = () => <Widget ${attr} />\n`,
      '/app/src/p.tsx',
    )
  }

  it('treats a BARE `hydrate` as the eager load strategy', () => {
    const r = run('hydrate')
    expect(r.changed).toBe(true)
    expect(r.islands[0]?.hydrate).toBe('load')
  })

  it('accepts a string literal inside a JSX expression container', () => {
    const r = run('hydrate={"visible"}')
    expect(r.changed).toBe(true)
    expect(r.islands[0]?.hydrate).toBe('visible')
  })

  it('warns on a DYNAMIC hydrate value', () => {
    const r = run('hydrate={strategy}')
    expect(r.changed).toBe(false)
    expect(r.warnings[0]?.message).toContain('must be a string literal')
  })
})

describe('client-directives — tag shapes', () => {
  it('warns on a member-expression tag and on a lowercase tag', () => {
    const member = transformClientDirectives(
      `import * as M from './m'\nexport const P = () => <M.Widget hydrate="visible" />\n`,
      '/app/src/p.tsx',
    )
    expect(member.changed).toBe(false)
    expect(member.warnings[0]?.message).toContain('non-component tag')

    const lower = transformClientDirectives(
      `import { widget } from './widget'\nexport const P = () => <widget hydrate="visible" />\n`,
      '/app/src/p.tsx',
    )
    expect(lower.changed).toBe(false)
    expect(lower.warnings[0]?.message).toContain('lowercase tag')
  })
})
