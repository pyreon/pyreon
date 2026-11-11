/**
 * A spec is INPUT, often someone else's (a vendor's split spec, a pull
 * request, a downloaded example). These pin what such a spec cannot make
 * lathe do, through the real entries: `generate()` with the same reader the
 * CLI and the Vite plugin pass, and the shipped CLI.
 *
 *  - read a local file outside the spec's directory into the generated client
 *    (`../.env`, an absolute path, a `file://` URL, a symlink pointing out);
 *  - expand a `$ref` fan-out exponentially (2 copies per level);
 *  - name an emitted file after a Windows device (`con.ts`, `nul.md`).
 *
 * The SSRF side (a remote document's `$ref` to another origin) is pinned in
 * `pull.test.ts` and `remote-refs.test.ts`, against a real HTTP server.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { main } from '../cli/main'
import { resolveConfig, type LatheSection } from '../core/config'
import { generate } from '../core/generate'

const SECRET = 'FAKE-SECRET-VALUE-4f1c'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** `<tmp>/spec/openapi.yaml` (with `description: { $ref }` at the info level) and `<tmp>/outside/secret.txt`. */
function layout(ref: (root: string) => string): { root: string; spec: string; text: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lathe-contain-')))
  dirs.push(root)
  mkdirSync(join(root, 'spec'))
  mkdirSync(join(root, 'outside'))
  writeFileSync(join(root, 'outside', 'secret.txt'), `${SECRET}\n`)
  writeFileSync(join(root, 'outside', 'secret.yaml'), `value: ${SECRET}\n`)
  const text = `openapi: 3.0.3
info:
  title: Innocent
  version: '1'
paths:
  /pets:
    get:
      operationId: listPets
      description:
        $ref: '${ref(root)}'
      responses: { '200': { description: ok } }
`
  const spec = join(root, 'spec', 'openapi.yaml')
  writeFileSync(spec, text)
  return { root, spec, text }
}

const config = (section: Partial<LatheSection> = {}) =>
  resolveConfig({ input: 'spec.json', plugins: ['schemas', 'client', 'docs'], ...section })

/** `generate` exactly as the Vite plugin calls it: real files, real realpath. */
function generateFrom(spec: string, text: string, section: Partial<LatheSection> = {}, reads: string[] = []) {
  return generate(text, config(section), {
    location: spec,
    readDocument: (id) => {
      reads.push(id)
      return readFileSync(id, 'utf8')
    },
    realpath: realpathSync,
  })
}

describe('a local `$ref` stays inside the spec directory', () => {
  it.each([
    ['a ../ escape', () => '../outside/secret.yaml#/value'],
    ['an absolute path', (root: string) => `${root}/outside/secret.yaml#/value`],
    ['a file:// URL', (root: string) => `file://${root}/outside/secret.yaml#/value`],
  ])('%s is refused before the file is read', (_, ref) => {
    const { spec, text } = layout(ref)
    const reads: string[] = []
    expect(() => generateFrom(spec, text, {}, reads)).toThrow(/\[Pyreon\] lathe: `\$ref` `.*secret\.yaml#\/value` in .*openapi\.yaml resolves to .*outside\/secret\.yaml, which is outside .*\/spec\/[\s\S]*set `refRoot`/)
    expect(reads).toEqual([])
  })

  it('a symlink inside the spec directory that points outside it is refused (real paths compared)', () => {
    const { root, spec, text } = layout(() => './linked/secret.yaml#/value')
    symlinkSync(join(root, 'outside'), join(root, 'spec', 'linked'))
    const reads: string[] = []
    expect(() => generateFrom(spec, text, {}, reads)).toThrow(/resolves to .*spec\/linked\/secret\.yaml, which is outside/)
    expect(reads).toEqual([])
  })

  it('`refRoot` widens the boundary on purpose, and the reference then resolves', () => {
    const { root, spec, text } = layout(() => '../outside/secret.yaml#/value')
    const result = generateFrom(spec, text, { refRoot: root })
    expect(result.files.some((f) => f.contents.includes(SECRET))).toBe(true)
  })

  it('a reference inside the directory still resolves (the boundary costs a normal split spec nothing)', () => {
    const { root, spec, text } = layout(() => './parts/desc.yaml#/value')
    mkdirSync(join(root, 'spec', 'parts'))
    writeFileSync(join(root, 'spec', 'parts', 'desc.yaml'), 'value: Lists the pets.\n')
    const result = generateFrom(spec, text)
    expect(result.files.some((f) => f.contents.includes('Lists the pets.'))).toBe(true)
    expect(result.documents).toContain(join(root, 'spec', 'parts', 'desc.yaml'))
  })

  it('the CLI refuses it with exit 1 and writes nothing; `refRoot` in the config (relative to it) opts in', async () => {
    // A fresh project per config: the config module is imported, and a
    // second import of the same path would be the module cache's copy.
    const cfg = (extra: string): string => {
      const { root } = layout(() => '../outside/secret.txt')
      writeFileSync(join(root, 'pyreon.config.ts'), `export default { lathe: { input: './spec/openapi.yaml', output: './gen', plugins: ['schemas', 'client', 'docs'], ${extra} } }\n`)
      return root
    }
    const quiet = async (root: string): Promise<{ code: number; err: string }> => {
      const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
      const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      try {
        const code = await main(['generate'], root)
        return { code, err: err.mock.calls.map((c) => String(c[0])).join('') }
      } finally {
        err.mockRestore()
        out.mockRestore()
      }
    }
    const strict = cfg('')
    const refused = await quiet(strict)
    expect(refused.code).toBe(1)
    expect(refused.err).toContain('which is outside')
    expect(existsSync(join(strict, 'gen'))).toBe(false)

    const widened = cfg("refRoot: '.'")
    const allowed = await quiet(widened)
    expect(allowed.err).toBe('')
    expect(allowed.code).toBe(0)
    const written = readdirSync(join(widened, 'gen'), { recursive: true, encoding: 'utf8' })
    expect(written.some((f) => f.endsWith('.ts') && readFileSync(join(widened, 'gen', f), 'utf8').includes(SECRET))).toBe(true)
  })
})

describe('a `$ref` fan-out is bounded', () => {
  /** A part whose every level references the next twice, inlined (not a schema). */
  function fanOut(depth: number): { spec: string; text: string } {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lathe-fanout-')))
    dirs.push(root)
    const lib: Record<string, unknown> = {}
    for (let i = 0; i < depth; i++) lib[`x${i}`] = { a: { $ref: `#/x${i + 1}` }, b: { $ref: `#/x${i + 1}` } }
    lib[`x${depth}`] = 'leaf'
    writeFileSync(join(root, 'lib.json'), JSON.stringify(lib))
    const text = JSON.stringify({
      openapi: '3.0.3',
      info: { title: 't', version: '1', 'x-meta': { $ref: './lib.json#/x0' } },
      paths: { '/a': { get: { operationId: 'a', responses: { 200: { description: 'ok' } } } } },
    })
    const spec = join(root, 'root.json')
    writeFileSync(spec, text)
    return { spec, text }
  }

  it('fails fast and by name past the node budget, instead of copying 2^depth nodes', () => {
    const { spec, text } = fanOut(21)
    const t = performance.now()
    expect(() => generateFrom(spec, text)).toThrow(/\[Pyreon\] lathe: bundling .*root\.json expanded its `\$ref`s past [\d,]+ nodes/)
    // 2^22 nodes (~575 MB) unbounded; the budget stops it at about a million.
    expect(performance.now() - t).toBeLessThan(20_000)
  })

  it('a shallow fan-out (normal reuse) is untouched', () => {
    const { spec, text } = fanOut(6)
    expect(() => generateFrom(spec, text)).not.toThrow()
  })
})

describe('an emitted file name is never a Windows device name', () => {
  const DEVICE = /(^|\/)(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i
  const spec = JSON.stringify({
    openapi: '3.0.3',
    info: { title: 'Devices', version: '1' },
    servers: [{ url: 'https://api.test' }],
    paths: Object.fromEntries(
      ['con', 'NUL', 'Com1', 'aux', 'lpt9', 'prn'].map((tag, i) => [
        `/r${i}`,
        { get: { operationId: `op${i}`, tags: [tag], responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Con' } } } } } } },
      ]),
    ),
    components: { schemas: { Con: { type: 'object', properties: { id: { type: 'string' } } } } },
  })

  it('a tag named after a device gets a safe stem in every per-tag file, and the imports agree', () => {
    const result = generate(spec, resolveConfig({ input: 'spec.json', plugins: ['schemas', 'client', 'queries', 'docs', 'mocks'] }))
    const paths = result.files.map((f) => f.path)
    expect(paths.filter((p) => DEVICE.test(p))).toEqual([])
    expect(paths).toContain('endpoints/con-api.ts')
    expect(paths).toContain('queries/nul-api.ts')
    expect(paths).toContain('docs/com1-api.md')
    // Every relative import names a file that exists.
    const all = new Set(paths)
    for (const f of result.files.filter((x) => /\.tsx?$/.test(x.path))) {
      for (const m of f.contents.matchAll(/from '(\.{1,2}\/[^']+)'/g)) {
        const target = join(f.path, '..', m[1] as string)
        expect([`${target}.ts`, `${target}.tsx`, `${target}/index.ts`, target].some((p) => all.has(p)), `${f.path} -> ${m[1]}`).toBe(true)
      }
    }
  })

  it('`naming.file` returning a device name is refused like any invalid stem', () => {
    expect(() =>
      generate(spec, resolveConfig({ input: 'spec.json', plugins: ['schemas', 'client'], naming: { file: () => 'nul' } })),
    ).toThrow(/not a Windows device name .*e\.g\. `nul-api`/)
  })
})
