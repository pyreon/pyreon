/**
 * 2026-09 vite-plugin audit — regressions for the transform-layer findings.
 *
 * - `prescanSignalExports` skipped EVERY directory named `lib`/`dist`/`build`
 *   at any depth, so a `src/lib/store.ts` (the `$lib` / shadcn convention)
 *   never reached the signal registry and its exported signal rendered as
 *   its own function SOURCE, non-reactively; a `.ts` store also had no
 *   transform-time path into the registry (the scan ran after the
 *   extension gate).
 * - the sanitizer auto-injection tested the RAW source for `innerHTML[=:]`,
 *   so a comment, a string, or `el.innerHTML = ''` pinned a ~1.9 kB gz
 *   side-effect import into modules that never used the prop — and the
 *   import was PREPENDED after the source map was generated, shifting every
 *   mapped line by one.
 * - `_isPyreonWorkspaceFile` required `/packages/` in the path, a property
 *   of this monorepo: every npm consumer of a compat app had framework JSX
 *   redirected to the compat runtime.
 * - no `node_modules` guard and no `include`/`exclude`: a third-party
 *   package's untranspiled React `.jsx` was reinterpreted as Pyreon JSX.
 * - the LPIH dev endpoint accepted a cross-origin POST (a CORS-simple
 *   request any open site could send) and any junk inside `fires`.
 */
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import pyreonPlugin, {
  _isPyreonWorkspaceFile,
  registerLpihMiddleware,
  writeLpihCacheFile,
  type PyreonPluginOptions,
} from '../index'

type ConfigHook = (c: { root: string }, env: { command: 'build' | 'serve' }) => unknown
type BuildStartHook = (this: unknown) => Promise<void>
type TransformHook = (
  this: { warn: (m: string) => void; resolve: (s: string) => Promise<{ id: string } | null> },
  code: string,
  id: string,
) => Promise<{ code: string; map: unknown } | undefined>

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-audit-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function write(rel: string, contents: string): string {
  const full = join(root, rel)
  mkdirSync(full.slice(0, full.lastIndexOf('/')), { recursive: true })
  writeFileSync(full, contents)
  return full
}

function boot(opts?: PyreonPluginOptions, command: 'build' | 'serve' = 'build') {
  const plugin = pyreonPlugin(opts)
  ;(plugin.config as unknown as ConfigHook)({ root }, { command })
  return plugin
}

async function transform(
  plugin: ReturnType<typeof pyreonPlugin>,
  code: string,
  id: string,
  resolveMap: Record<string, string> = {},
) {
  return (plugin.transform as TransformHook).call(
    {
      warn: () => {},
      resolve: async (specifier: string) => {
        const resolved = resolveMap[specifier]
        return resolved ? { id: resolved } : null
      },
    },
    code,
    id,
  )
}

const STORE = `import { signal } from '@pyreon/reactivity'\nexport const count = signal(0)\n`
const VIEW = `import { count } from './lib/store'\nexport const V = () => <div>{count}</div>\n`

describe('a signal store under src/lib/ reaches the registry', () => {
  it('the boot-time prescan walks src/lib (only a PACKAGE-ROOT lib/ is build output)', async () => {
    write('package.json', '{"name":"app"}')
    write('src/lib/store.ts', STORE)
    write('lib/built.ts', STORE.replace('count', 'builtOut')) // package-root lib/ = output, skipped
    const viewPath = write('src/View.tsx', VIEW)
    const plugin = boot()
    await (plugin.buildStart as BuildStartHook).call({})
    const out = await transform(plugin, VIEW, viewPath, { './lib/store': join(root, 'src/lib/store.ts') })
    expect(out?.code).toContain('count()')
  })

  it('a .ts store is registered when it is TRANSFORMED, not only by the prescan', async () => {
    write('package.json', '{"name":"app"}')
    const storePath = write('src/lib/store.ts', STORE)
    const viewPath = write('src/View.tsx', VIEW)
    const plugin = boot()
    // No buildStart: the prescan never ran (a file created after boot).
    await transform(plugin, STORE, storePath)
    const out = await transform(plugin, VIEW, viewPath, { './lib/store': storePath })
    expect(out?.code).toContain('count()')
  })
})

describe('sanitizer auto-injection', () => {
  const run = async (src: string) => (await transform(boot(), src, '/app/src/C.tsx'))?.code ?? src
  it('still injects for the sanitized prop (JSX attribute and object key)', async () => {
    expect(await run(`export const C = () => <div innerHTML={h()} />`)).toContain('@pyreon/runtime-dom/sanitizer')
    expect(await run(`export const C = () => <Box {...{ innerHTML: h() }} />`)).toContain('@pyreon/runtime-dom/sanitizer')
  })
  it('does NOT inject for a raw DOM assignment, a comment, or a string', async () => {
    expect(await run(`export const C = () => { el.innerHTML = ''; return <div /> }`)).not.toContain('sanitizer')
    expect(await run(`// innerHTML = legacy\nexport const C = () => <div />`)).not.toContain('sanitizer')
    expect(await run(`const s = "innerHTML: x"\nexport const C = () => <div />`)).not.toContain('sanitizer')
  })
  it('APPENDS the import so the compiler source map is not shifted', async () => {
    const src = `export const C = () => <div innerHTML={h()} />`
    const out = (await transform(boot(), src, '/app/src/C.tsx'))!.code
    expect(out.trimStart().startsWith("import '@pyreon/runtime-dom/sanitizer'")).toBe(false)
    expect(out.trimEnd().endsWith("import '@pyreon/runtime-dom/sanitizer';")).toBe(true)
  })
})

describe('_isPyreonWorkspaceFile decides on package IDENTITY, not on a /packages/ path', () => {
  it('a framework package installed from npm is recognised', () => {
    const pkgDir = join(root, 'node_modules', '@pyreon', 'router')
    mkdirSync(join(pkgDir, 'lib'), { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), '{"name":"@pyreon/router"}')
    expect(_isPyreonWorkspaceFile(join(pkgDir, 'lib', 'x.js'), new Map())).toBe(true)
  })
  it('an @pyreon/example-* app is a CONSUMER, wherever it lives', () => {
    const dir = join(root, 'packages', 'example-x')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{"name":"@pyreon/example-react-compat"}')
    expect(_isPyreonWorkspaceFile(join(dir, 'src', 'App.tsx'), new Map())).toBe(false)
  })
})

describe('node_modules guard + include/exclude', () => {
  const SRC = `export const C = () => <div class="x">hi</div>`
  it('skips third-party node_modules JSX by default', async () => {
    expect(await transform(boot(), SRC, '/app/node_modules/some-lib/dist/Btn.jsx')).toBeUndefined()
  })
  it('still transforms @pyreon/* under node_modules and app source', async () => {
    expect((await transform(boot(), SRC, '/app/node_modules/@pyreon/ui/src/B.tsx'))?.code).toContain('_tpl(')
    expect((await transform(boot(), SRC, '/app/src/B.tsx'))?.code).toContain('_tpl(')
  })
  it('`include` opts a module in, `exclude` opts one out', async () => {
    expect(
      (await transform(boot({ include: [/some-lib/] }), SRC, '/app/node_modules/some-lib/dist/Btn.jsx'))?.code,
    ).toContain('_tpl(')
    expect(await transform(boot({ exclude: [/legacy/] }), SRC, '/app/src/legacy/B.tsx')).toBeUndefined()
  })
})

describe('LPIH endpoint origin + payload validation', () => {
  class FakeReq extends EventEmitter {
    headers: Record<string, string> = {}
    constructor(public method: string) {
      super()
    }
    destroy(): void {}
  }
  const makeRes = () => {
    const res = { statusCode: 200, ended: undefined as string | undefined }
    ;(res as unknown as { end: (b?: string) => void }).end = (b?: string) => {
      res.ended = b ?? ''
    }
    return res
  }
  let handler: (req: unknown, res: unknown) => void
  beforeEach(() => {
    registerLpihMiddleware(
      { middlewares: { use: (_p: string, fn: typeof handler) => (handler = fn) } } as never,
      root,
      {},
    )
  })

  it('rejects a cross-origin POST with 403 before reading the body', () => {
    const req = new FakeReq('POST')
    req.headers = { origin: 'https://evil.example', host: 'localhost:5173' }
    const res = makeRes()
    handler(req, res)
    expect(res.statusCode).toBe(403)
  })
  it('accepts a same-origin POST', async () => {
    const req = new FakeReq('POST')
    req.headers = { origin: 'http://localhost:5173', host: 'localhost:5173' }
    const res = makeRes()
    handler(req, res)
    req.emit('data', '{"fires":[]}')
    req.emit('end')
    for (let i = 0; i < 50 && res.statusCode !== 204; i++) await new Promise((r) => setTimeout(r, 10))
    expect(res.statusCode).toBe(204)
  })
  it('refuses non-object `fires` entries', async () => {
    await expect(writeLpihCacheFile(join(root, 'c.json'), '{"fires":[1,"x",null]}')).rejects.toThrow(/entries must be objects/)
    await expect(writeLpihCacheFile(join(root, 'c.json'), '{"fires":[{"id":"a"}]}')).resolves.toBeUndefined()
  })
})
