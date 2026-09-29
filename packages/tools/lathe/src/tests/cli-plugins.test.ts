/**
 * Third-party plugins on the command line: `--plugins schemas,./x.ts` or a
 * package name, resolved from the working directory like a config file's own
 * import, with a clear error for a name that is neither.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { definePlugin } from '../core/plugin'
import { pluginsFromModule } from '../cli/plugin-exports'
import { isPathSpecifier, resolveModuleSpecifier } from '../cli/plugin-modules'
import { parseArgv, run, type Fs } from '../cli/run'
import { CUSTOMIZE_SPEC } from './helpers/customize-spec'

const paths = definePlugin({
  name: 'paths',
  emit: ({ doc }) => [{ path: 'extras/paths.json', contents: `${JSON.stringify(doc.operations.map((o) => o.id))}\n` }],
})

function memFs(modules: Record<string, unknown> = {}, withImport = true): Fs & { files: Record<string, string> } {
  const files: Record<string, string> = { 'spec.json': CUSTOMIZE_SPEC }
  return {
    files,
    read: (p) => {
      const v = files[p]
      if (v === undefined) throw new Error(`ENOENT ${p}`)
      return v
    },
    write: (p, c) => {
      files[p] = c
    },
    exists: (p) => p in files,
    mkdirp: () => undefined,
    remove: (p) => {
      delete files[p]
    },
    join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    ...(withImport
      ? {
          importModule: async (spec: string) => {
            if (!(spec in modules)) throw new Error(`Cannot find module '${spec}'`)
            return modules[spec]
          },
        }
      : {}),
  }
}

const gen = (fs: Fs, plugins: string) => run(parseArgv(['generate', 'spec.json', '--out', 'gen', '--plugins', plugins]), undefined, fs)

describe('--plugins with a module', () => {
  it('loads a path or a package and runs it beside the built-ins', async () => {
    for (const spec of ['./paths.ts', 'lathe-plugin-paths']) {
      const fs = memFs({ [spec]: { default: paths } })
      const r = await gen(fs, `schemas,${spec}`)
      expect(r.code, r.stderr).toBe(0)
      expect(JSON.parse(fs.files['gen/extras/paths.json'] as string)).toContain('getPetById')
    }
  })

  it('a typo of a built-in is refused with a did-you-mean and a usage exit code', async () => {
    const r = await gen(memFs(), 'schemas,querys')
    expect(r.code).toBe(2)
    expect(r.stderr).toContain('unknown plugin `querys` — not a built-in (did you mean `queries`?)')
    expect(r.stderr).toContain("could not be loaded as a plugin module: Cannot find module 'querys'")
  })

  it('a host that cannot import modules (an in-memory fs) names the built-ins', async () => {
    const r = await gen(memFs({}, false), 'nope')
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/unknown plugin `nope` — not a built-in\. Known: types, schemas/)
  })

  it('a module that exports no plugin is refused, naming it', async () => {
    const r = await gen(memFs({ './x.ts': { default: { name: 'plain' } } }), './x.ts')
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("`./x.ts`'s default export is not a Lathe plugin")
  })
})

describe('what a plugin module may export', () => {
  const a = definePlugin({ name: 'a' })
  const b = definePlugin({ name: 'b' })
  it('a plugin, an array, a factory, or one named plugin', () => {
    expect(pluginsFromModule({ default: a }, 'm')).toEqual([a])
    expect(pluginsFromModule({ default: [a, b] }, 'm')).toEqual([a, b])
    expect(pluginsFromModule({ default: () => a }, 'm')).toEqual([a])
    expect(pluginsFromModule({ default: () => [a, b] }, 'm')).toEqual([a, b])
    expect(pluginsFromModule({ a, helper: 1 }, 'm')).toEqual([a])
  })
  it('refuses anything ambiguous or empty', () => {
    expect(() => pluginsFromModule({}, 'm')).toThrow('`m` exports no Lathe plugin')
    expect(() => pluginsFromModule(undefined, 'm')).toThrow('`m` exports no Lathe plugin')
    expect(() => pluginsFromModule({ a, b }, 'm')).toThrow('exports several plugins (a, b) and no default')
    expect(() => pluginsFromModule({ default: [] }, 'm')).toThrow("default export is not a Lathe plugin")
    expect(() => pluginsFromModule({ default: () => 3 }, 'm')).toThrow("default export is not a Lathe plugin")
  })
})

describe('resolving a module specifier from the working directory', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '.generated', 'cli-plugin-resolve')
  const put = (rel: string, contents: string): void => {
    mkdirSync(dirname(join(ROOT, rel)), { recursive: true })
    writeFileSync(join(ROOT, rel), contents)
  }
  beforeAll(() => {
    rmSync(ROOT, { recursive: true, force: true })
    put('app/sub/.keep', '')
    put('app/local.mjs', '')
    // `exports` with conditions: the `import` target wins over `require`.
    put('node_modules/cond/package.json', JSON.stringify({ exports: { '.': { require: './c.cjs', import: './e.mjs' }, './extra': './x.mjs' } }))
    put('node_modules/cond/e.mjs', '')
    put('node_modules/cond/x.mjs', '')
    // A scoped package with a `*` subpath pattern, and a sugar string export.
    put('node_modules/@s/p/package.json', JSON.stringify({ exports: { './plugins/*': { default: './dist/*.mjs' } } }))
    put('node_modules/@s/p/dist/msw.mjs', '')
    put('node_modules/sugar/package.json', JSON.stringify({ exports: './main.mjs' }))
    put('node_modules/sugar/main.mjs', '')
    // No `exports`: `module`, then `main`, then index.js; an extensionless main.
    put('node_modules/legacy/package.json', JSON.stringify({ main: 'lib/entry' }))
    put('node_modules/legacy/lib/entry.js', '')
    put('node_modules/bare/package.json', '{}')
    put('node_modules/bare/index.js', '')
  })
  afterAll(() => rmSync(ROOT, { recursive: true, force: true }))
  const from = join(ROOT, 'app', 'sub')

  it('tells a path from a package name', () => {
    expect(['./x.ts', '../x.ts', '/abs/x.js', 'C:\\x.js', '.'].every(isPathSpecifier)).toBe(true)
    expect(['pkg', '@s/p', 'pkg/sub'].some(isPathSpecifier)).toBe(false)
  })

  it('resolves paths against the cwd and packages through node_modules, walking up', () => {
    expect(resolveModuleSpecifier('../local.mjs', from)).toBe(join(ROOT, 'app', 'local.mjs'))
    expect(resolveModuleSpecifier('cond', from)).toBe(join(ROOT, 'node_modules', 'cond', 'e.mjs'))
    expect(resolveModuleSpecifier('cond/extra', from)).toBe(join(ROOT, 'node_modules', 'cond', 'x.mjs'))
    expect(resolveModuleSpecifier('@s/p/plugins/msw', from)).toBe(join(ROOT, 'node_modules', '@s', 'p', 'dist', 'msw.mjs'))
    expect(resolveModuleSpecifier('sugar', from)).toBe(join(ROOT, 'node_modules', 'sugar', 'main.mjs'))
    expect(resolveModuleSpecifier('legacy', from)).toBe(join(ROOT, 'node_modules', 'legacy', 'lib', 'entry.js'))
    expect(resolveModuleSpecifier('bare', from)).toBe(join(ROOT, 'node_modules', 'bare', 'index.js'))
  })

  it('says why when it cannot', () => {
    expect(() => resolveModuleSpecifier('./missing.mjs', from)).toThrow(/no file at/)
    expect(() => resolveModuleSpecifier('cond/nope', from)).toThrow('`cond/nope` is not exported')
    expect(() => resolveModuleSpecifier('sugar/deep', from)).toThrow('`sugar/deep` is not exported')
    expect(() => resolveModuleSpecifier('no-such-package-xyz', from)).toThrow(/no package `no-such-package-xyz`/)
  })
})
