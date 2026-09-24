/**
 * A document that is not OpenAPI 3.x is REFUSED, and refused before anything
 * is written.
 *
 * Conversion is lenient by design, which is exactly why the wrong document
 * used to produce an empty client instead of an error: a Swagger 2 spec became
 * 0 models and exit 0, and a YAML file that was not a spec at all overwrote a
 * working generated tree -- `api-surface.json` included, silently resetting the
 * contract baseline the next run diffs against.
 */
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { openApiVersionProblem } from '../input/openapi'
import { parseArgv, run, type Fs } from '../cli/run'

const SWAGGER2 = JSON.stringify({
  swagger: '2.0',
  info: { title: 'S2', version: '1' },
  host: 'api.x.com',
  definitions: { Pet: { type: 'object', properties: { id: { type: 'integer' } } } },
  paths: {},
})
const OPENAPI = 'openapi: 3.1.0\ninfo: { title: T, version: "1" }\nservers: [{ url: "https://t.test" }]\npaths: {}\n'

function memFs(files: Record<string, string>): Fs & { files: Record<string, string> } {
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
    mkdirp: () => {},
    remove: (p) => {
      delete files[p]
    },
    join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
  }
}

describe('the input must be OpenAPI 3.x', () => {
  const cfg = resolveConfig({ input: 'x' })

  it('refuses Swagger 2 and names the conversion', () => {
    expect(() => generate(SWAGGER2, cfg)).toThrow(/Swagger 2\.0 document[\s\S]*swagger2openapi/)
  })

  it('refuses a document with no `openapi` key', () => {
    expect(() => generate('hello: world\n', cfg)).toThrow(/no `openapi` version key/)
  })

  it('refuses an unsupported major version', () => {
    expect(() => generate('openapi: 4.0.0\ninfo: {}\npaths: {}\n', cfg)).toThrow(/not a version Lathe reads/)
  })

  it('accepts 3.0 and 3.1, including an UNQUOTED `openapi: 3.0` that reads as a number', () => {
    expect(openApiVersionProblem({ openapi: '3.0.3' })).toBeUndefined()
    expect(openApiVersionProblem({ openapi: '3.1.0' })).toBeUndefined()
    expect(openApiVersionProblem({ openapi: 3 })).toBeUndefined()
    expect(() => generate(OPENAPI, cfg)).not.toThrow()
  })
})

describe('a refused spec leaves every output tree untouched', () => {
  it('does not write a single file, including api-surface.json', async () => {
    const fs = memFs({
      'bad.yaml': 'hello: world\n',
      'gen/api-surface.json': '{"committed":"baseline"}',
    })
    const r = await run(parseArgv(['generate', 'bad.yaml', '--out', 'gen']), undefined, fs)
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/no `openapi` version key/)
    expect(Object.keys(fs.files).sort()).toEqual(['bad.yaml', 'gen/api-surface.json'])
    expect(fs.files['gen/api-surface.json']).toBe('{"committed":"baseline"}')
  })

  it('does not write an EARLIER project when a later one is refused', async () => {
    const fs = memFs({ 'good.yaml': OPENAPI, 'bad.json': SWAGGER2 })
    const section = {
      projects: [
        { name: 'good', input: 'good.yaml', output: 'gen/good' },
        { name: 'bad', input: 'bad.json', output: 'gen/bad' },
      ],
    }
    const r = await run(parseArgv(['generate']), section, fs)
    expect(r.code).toBe(1)
    // Names WHICH project was refused -- the error itself cannot know.
    expect(r.stderr).toMatch(/Swagger 2[\s\S]*project `bad`/)
    expect(Object.keys(fs.files).filter((p) => p.startsWith('gen/'))).toEqual([])
  })
})

describe('info.version', () => {
  it('keeps a numeric YAML version instead of replacing it with 0.0.0, and says so', () => {
    const out = generate(OPENAPI.replace('version: "1"', 'version: 2'), resolveConfig({ input: 'x' }))
    expect(out.doc.version).toBe('2')
    expect(out.doc.notes.some((n) => n.at === '#/info/version')).toBe(true)
  })

  it('a string version is used verbatim, with no note', () => {
    const out = generate(OPENAPI, resolveConfig({ input: 'x' }))
    expect(out.doc.version).toBe('1')
    expect(out.doc.notes.some((n) => n.at === '#/info/version')).toBe(false)
  })
})
