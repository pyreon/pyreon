/**
 * `lathe init` option by option, over an in-memory filesystem.
 *
 * `init.test.ts` runs whole migrations through the bin; this file pins each
 * mapping rule and each decision `runInit` makes, so a rule that silently
 * stops mapping (or starts dropping an option instead of reporting it) fails
 * by name. The contract under test is the one the command promises: every
 * option is either MAPPED or listed as UNMAPPED with advice — none vanish.
 */
import type { LatheSection } from '../core/config'
import { renderInitReport, runInit, type InitDeps, type InitFs, type InitOptions } from '../cli/init/init'
import { readExportedConfig, show, str, prop, type Lit } from '../cli/init/literal'
import { fromHeyApi, fromKubb, fromOpenapiTypescript, fromOrval, fromSpec, type Migration } from '../cli/init/migrate'

const lit = (src: string): Lit => {
  const v = readExportedConfig(`export default ${src}`)
  if (!v) throw new Error('unreadable')
  return v
}
const froms = (m: Migration | undefined): string[] => [...(m?.mapped ?? []), ...(m?.unmapped ?? [])].map((x) => x.from)

describe('the literal reader', () => {
  it('reads scalars, escapes, nesting and trailing casts', () => {
    const v = lit(`{ a: -1.5e2, b: 'x\\'y\\n', c: "d", e: [ ], f: { }, g: false, h: null, i: 1_000 } as const`)
    expect(show(v)).toBe(`{ a: -150, b: "x'y\\n", c: "d", e: [], f: {  }, g: false, h: null, i: 1000 }`)
  })

  it('keeps what it cannot evaluate as text: methods, spreads, computed keys, new, chains', () => {
    const v = lit(`{ m(x) { return x }, ...rest, [k]: 1, u: new URL('x'), c: fn().then(g), s, t: undefined, a: b + c }`)
    expect(show(v)).toBe('{ m: m(x) { return x }, ...: rest, [k]: 1, u: new URL(\'x\'), c: fn().then(g), s: s, t: undefined, a: b + c }')
  })

  it('reads module.exports, an arrow returning an object, and a block-bodied one', () => {
    expect(show(readExportedConfig('module.exports = { a: 1 }')!)).toBe('{ a: 1 }')
    expect(show(readExportedConfig('export default defineConfig(() => ({ a: 1 }))')!)).toBe('{ a: 1 }')
    expect(show(readExportedConfig('export default defineConfig(async (env) => { const x = 1; return { a: x } })')!)).toBe(
      '{ a: x }',
    )
    expect(readExportedConfig('const a = 1')).toBeUndefined()
  })

  it('prop / str are total', () => {
    expect(prop(lit('[1]'), 'a')).toBeUndefined()
    expect(str(lit('{ a: 1 }'))).toBeUndefined()
    expect(str(prop(lit("{ a: 'x' }"), 'a'))).toBe('x')
  })
})

describe('orval rules', () => {
  const one = (src: string): Migration | undefined => fromOrval(lit(src), 'orval.config.ts')[0]

  it('string input and output, and every client value', () => {
    const m = one(`{ api: { input: './a.yaml', output: './src/api/client.ts' } }`)
    expect(m?.section).toMatchObject({ input: './a.yaml', output: './src/api' })
    expect(one(`{ api: { input: 'x', output: { target: 'out', client: 'axios-functions' } } }`)?.section.client).toBe('axios')
    expect(one(`{ api: { input: 'x', output: { target: 'out', client: 'fetch' } } }`)?.section.client).toBe('fetch')
    const angular = one(`{ api: { input: 'x', output: { client: 'angular', httpClient: 'xhr', baseUrl: { getBaseUrlFromSpecification: true } } } }`)
    expect(angular?.unmapped.map((u) => u.from)).toEqual(['api.output.client', 'api.output.httpClient', 'api.output.baseUrl'])
  })

  it('reports what it cannot read, option by option', () => {
    const m = one(
      `{ api: { input: { target: 'x', override: { transformer: 'y' }, validation: true }, output: { target: env.OUT, mock: { type: 'msw', delay: 100 }, override: 'nope', tslint: true } } }`,
    )
    expect(m?.unmapped.map((u) => u.from)).toEqual([
      'api.input.override',
      'api.input.validation',
      'api.output.target',
      'api.output.mock.delay',
      'api.output.override',
      'api.output.tslint',
    ])
    expect(m?.section.plugins).toContain('mocks')
    const bad = one(`{ api: { input: someVar, output: 42 } }`)
    expect(bad?.unmapped.map((u) => u.from)).toEqual(['api.input', 'api.output'])
    expect(fromOrval(lit('{ api: fn() }'), 'o')[0]?.unmapped[0]?.from).toBe('api')
    expect(fromOrval(lit('[1]'), 'o')).toEqual([])
  })
})

describe('hey-api rules', () => {
  const one = (src: string): Migration | undefined => fromHeyApi(lit(src), 'openapi-ts.config.ts')[0]

  it('maps each client and schema plugin', () => {
    expect(one(`{ input: 'a', output: 'o', client: '@hey-api/client-axios' }`)?.section.client).toBe('axios')
    expect(one(`{ input: 'a', plugins: ['@hey-api/client-ky'] }`)?.section.client).toBe('ky')
    // schemas + client + queries is the DEFAULT set, so it is not written out.
    expect(one(`{ input: 'a', plugins: ['@hey-api/client-next', 'valibot', '@tanstack/vue-query'] }`)?.section).toEqual({
      input: 'a',
    })
    expect(one(`{ input: { path: 'https://x.test/spec.yaml' } }`)?.section).toMatchObject({
      source: 'https://x.test/spec.yaml',
      input: './openapi.yaml',
    })
  })

  it('names what it cannot map', () => {
    const m = one(`{ input: spec, output: { path: 'o', clean: false }, plugins: [{ nam: 'x' }, 'fastify'], watch: true }`)
    expect(m?.unmapped.map((u) => u.from)).toEqual(['input', 'output.clean', 'plugins[0]', 'plugins[1]', 'watch'])
    expect(one(`{ input: 'a', plugins: somePlugins }`)?.unmapped[0]?.from).toBe('plugins')
    expect(fromHeyApi(lit('[1]'), 'x')).toEqual([])
  })
})

describe('kubb rules', () => {
  const one = (src: string): Migration | undefined => fromKubb(lit(src), 'kubb.config.ts')[0]

  it('joins root, maps each plugin family', () => {
    const m = one(
      `{ root: 'app', input: 'spec.yaml', output: { path: './gen', barrelType: 'named' }, plugins: [pluginClient({ client: 'fetch' }), pluginVueQuery(), pluginSwr(), pluginRedoc()] }`,
    )
    expect(m?.section).toMatchObject({ input: 'app/spec.yaml', output: 'app/gen', client: 'fetch' })
    expect(m?.section.plugins).toEqual(['schemas', 'client', 'queries', 'docs'])
    expect(m?.unmapped.map((u) => u.from)).toEqual(['output.barrelType'])
  })

  it('without a client plugin there is no client; a default one maps to pyreon', () => {
    expect(one(`{ input: { path: 'a' }, plugins: [pluginTs(), pluginZod()] }`)?.section.plugins).toEqual(['schemas'])
    expect(one(`{ input: { path: 'a' }, plugins: [pluginClient()] }`)?.section.client).toBeUndefined()
  })

  it('names what it cannot map', () => {
    const m = one(`{ input: inputs, plugins: [pluginCypress(), 'x'], hooks: { done: [] } }`)
    expect(m?.unmapped.map((u) => u.from)).toEqual(['input', 'plugins[0] pluginCypress', 'plugins[1]', 'hooks'])
    expect(one(`{ input: 'a', plugins: all }`)?.unmapped[0]?.from).toBe('plugins')
    expect(fromKubb(lit('[1]'), 'x')).toEqual([])
  })
})

describe('openapi-typescript and bare-spec rules', () => {
  it('reads the script, and types-only without a client package', () => {
    const [m] = fromOpenapiTypescript(
      { name: 'types', command: 'npx openapi-typescript https://x.test/o.json --output src/api.d.ts --immutable' },
      new Set(),
      'package.json',
    )
    expect(m?.section).toMatchObject({ source: 'https://x.test/o.json', output: 'src', plugins: ['schemas'] })
    expect(froms(m)).toContain('types: --immutable')
  })

  it('a spec maps to itself', () => {
    expect(fromSpec('./o.yaml')[0]?.section).toEqual({ input: './o.yaml' })
  })
})

// ─── runInit over an in-memory filesystem ────────────────────────────────────

function memfs(files: Record<string, string>): InitFs & { files: Record<string, string> } {
  const store = { ...files }
  return {
    files: store,
    exists: (p) => p in store || Object.keys(store).some((k) => k.startsWith(`${p.replace(/^\.\//, '')}/`)),
    read: (p) => {
      const v = store[p.replace(/^\.\//, '')]
      if (v === undefined) throw new Error(`ENOENT ${p}`)
      return v
    },
    write: (p, c) => {
      store[p.replace(/^\.\//, '')] = c
    },
    list: (p) => {
      const dir = `${p.replace(/^\.\//, '').replace(/\/$/, '')}/`
      return [...new Set(Object.keys(store).filter((k) => k.startsWith(dir)).map((k) => k.slice(dir.length).split('/')[0] as string))]
    },
  }
}

const SPEC = '{ "openapi": "3.0.3" }'
const opts = (o: Partial<InitOptions> = {}): InitOptions => ({ yes: true, generate: false, dryRun: false, ...o })
const deps = (fs: InitFs, o: Partial<InitDeps> = {}): InitDeps => ({ fs, cwd: '/p', configFile: undefined, ...o })

describe('runInit decisions', () => {
  it('asks which candidate when several are found, and takes the answer', async () => {
    const fs = memfs({ 'orval.config.ts': "export default { a: { input: './o.json' } }", 'api/openapi.json': SPEC })
    const asked: string[] = []
    const answers = ['2', 'y']
    const r = await runInit(opts({ yes: false }), deps(fs, { ask: async (q) => (asked.push(q), answers.shift() ?? '') }))
    expect(asked[0]).toContain('1) orval.config.ts')
    expect(r.from).toEqual({ tool: 'spec', file: 'api/openapi.json' })
    expect(r.section).toEqual({ input: './api/openapi.json', output: './src/gen' })
  })

  it('rejects an answer that is not on the list, and a cancel writes nothing', async () => {
    const fs = memfs({ 'orval.config.ts': "export default { a: { input: './o.json' } }", 'openapi.json': SPEC })
    const bad = await runInit(opts({ yes: false }), deps(fs, { ask: async () => '9' }))
    expect(bad.error).toContain('`9` is not one of 1-2')
    const cancel = await runInit(opts({ yes: false }), deps(fs, { ask: async (q) => (q.startsWith('Found') ? '' : 'n') }))
    expect(cancel.error).toContain('cancelled')
    expect(fs.files['pyreon.config.ts']).toBeUndefined()
  })

  it('with nothing found, asks for the spec; an empty answer stops', async () => {
    const fs = memfs({ 'package.json': '{}' })
    const empty = await runInit(opts({ yes: false }), deps(fs, { ask: async () => '  ' }))
    expect(empty.error).toContain('no spec given')
    const given = await runInit(opts({ yes: false }), deps(fs, { ask: async (q) => (q.startsWith('Path') ? './s.yaml' : 'y') }))
    expect(given.ok).toBe(true)
    expect(fs.files['pyreon.config.ts']).toContain("input: './s.yaml'")
  })

  it('--from narrows detection and says what it did not find', async () => {
    const r = await runInit(opts({ from: 'kubb' }), deps(memfs({ 'openapi.json': SPEC })))
    expect(r.error).toContain('no kubb setup found')
  })

  it('several orval APIs become projects, each output kept apart', async () => {
    const fs = memfs({
      'orval.config.ts': "export default { a: { input: './a.json', output: 'src/a/x.ts' }, b: { input: 'https://x.test/b.yaml' } }",
      'package.json': '{ "name": "p" }\n',
      'pnpm-lock.yaml': '',
    })
    const r = await runInit(opts(), deps(fs))
    expect(r.section).toEqual({
      projects: [
        // No hooks client in either orval entry: schemas + an endpoint client.
        { name: 'a', input: './a.json', output: 'src/a', plugins: ['schemas', 'client'] },
        { name: 'b', source: 'https://x.test/b.yaml', input: './openapi.yaml', output: './src/gen/b', plugins: ['schemas', 'client'] },
      ],
    })
    expect(r.mapped.some((m) => m.from.startsWith('[a] '))).toBe(true)
    expect(r.scripts.added).toEqual(['lathe:generate', 'lathe:check', 'lathe:pull'])
    expect(r.installCommand).toBe('pnpm add @pyreon/http @pyreon/validate && pnpm add -D @pyreon/lathe')
  })

  it('refuses a migration with no spec location', async () => {
    const r = await runInit(opts(), deps(memfs({ 'orval.config.ts': "export default { a: { output: 'x' } }" })))
    expect(r.error).toContain('does not say where the spec is for `a`')
  })

  it('writes paths relative to a config file in a parent directory', async () => {
    const fs = memfs({ 'openapi.json': SPEC })
    const r = await runInit(opts(), deps(fs, { cwd: '/repo/app', configFile: '/repo/pyreon.config.ts' }))
    // The config is not in the in-memory fs, so it is CREATED at that path.
    expect(r.config?.file).toBe('../pyreon.config.ts')
    expect(fs.files['../pyreon.config.ts']).toContain("input: './app/openapi.json'")
    expect(fs.files['../pyreon.config.ts']).toContain("output: './app/src/gen'")
  })

  it('an export it cannot find is not edited; the section is printed instead', async () => {
    const fs = memfs({ 'openapi.json': SPEC, 'pyreon.config.ts': 'const c = {}\nexport default c\n' })
    const r = await runInit(opts(), deps(fs, { configFile: '/p/pyreon.config.ts' }))
    expect(r.error).toContain('could not find the exported object')
    expect(fs.files['pyreon.config.ts']).toBe('const c = {}\nexport default c\n')
  })

  it('an occupied output with no fallback room gets a -lathe sibling', async () => {
    const fs = memfs({
      'openapi-ts.config.ts': "export default { input: './o.json', output: 'src/client' }",
      'src/client/index.ts': 'x',
      'src/gen/other.ts': 'y',
      'bun.lock': '',
      'package.json': '{ "devDependencies": { "@pyreon/lathe": "*" }, "dependencies": { "@pyreon/http": "*", "@pyreon/query": "*", "@pyreon/validate": "*" } }',
    })
    const r = await runInit(opts(), deps(fs))
    expect(r.section?.output).toBe('./src/gen-lathe')
    expect(r.installCommand).toBeUndefined()
    expect(renderInitReport(r)).toContain('holds @hey-api/openapi-ts')
  })

  it('yarn and bun install commands; no package.json is a note', async () => {
    const yarn = await runInit(opts(), deps(memfs({ 'openapi.json': SPEC, 'yarn.lock': '', 'package.json': '{}' })))
    expect(yarn.installCommand).toMatch(/^yarn add /)
    const bun = await runInit(opts(), deps(memfs({ 'openapi.json': SPEC, 'bun.lockb': '', 'package.json': '{}' })))
    expect(bun.installCommand).toMatch(/^bun add /)
    const none = await runInit(opts(), deps(memfs({ 'openapi.json': SPEC })))
    expect(none.notes).toContain('no package.json here, so no scripts were added.')
  })

  it('runs the first generate with the section, and reports its failure', async () => {
    const seen: LatheSection[] = []
    const r = await runInit(
      opts({ generate: true }),
      deps(memfs({ 'openapi.json': SPEC }), {
        generate: async (s) => (seen.push(s), { code: 1, stdout: 'report\n', stderr: 'boom\n' }),
      }),
    )
    expect(seen).toEqual([{ input: './openapi.json', output: './src/gen' }])
    expect(r.ok).toBe(false)
    expect(renderInitReport(r)).toContain('boom')
  })
})
