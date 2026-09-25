/**
 * `lathe diff` — the contract diff as a standalone product.
 *
 * Covers the three layers separately because each has its own way to lie:
 * READING (a surface file vs a spec, a stale surface version), ATTRIBUTION
 * (which generated symbols a model change reaches — transitively), and
 * RENDERING (a PR comment that a `|` in a spec description cannot corrupt, a
 * GitHub annotation a newline cannot cut short).
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contractDiff, readContractSide, renderContractDiff } from '../core/contract'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { main } from '../cli/main'
import { parseArgv, run, type Fs } from '../cli/run'

const spec = (over: { models?: Record<string, unknown>; paths?: Record<string, unknown> } = {}): string =>
  JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'Shop', version: '1' },
    servers: [{ url: 'https://shop.test' }],
    paths: over.paths ?? {
      '/orders/{id}': {
        get: {
          operationId: 'getOrder',
          tags: ['orders'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } } },
        },
      },
      '/customers': {
        get: {
          operationId: 'listCustomers',
          tags: ['customers'],
          responses: {
            200: {
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Customer' } } } },
            },
          },
        },
      },
    },
    components: {
      schemas: over.models ?? {
        Order: {
          type: 'object',
          required: ['id', 'customer'],
          properties: { id: { type: 'string' }, customer: { $ref: '#/components/schemas/Customer' } },
        },
        Customer: {
          type: 'object',
          required: ['name', 'email'],
          properties: { name: { type: 'string' }, email: { type: 'string' } },
        },
      },
    },
  })

const BEFORE = spec()
const AFTER = spec({
  models: {
    Order: {
      type: 'object',
      required: ['id', 'customer'],
      properties: { id: { type: 'string' }, customer: { $ref: '#/components/schemas/Customer' } },
    },
    Customer: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' }, email: { type: 'string', description: 'a | pipe' }, vip: { type: 'boolean' } },
    },
  },
})

describe('reading either side', () => {
  it('reads a spec (JSON or YAML) and a committed api-surface.json into the same surface', () => {
    const fromSpec = readContractSide(BEFORE, 'openapi.json')
    expect(fromSpec.source).toBe('spec')
    const generated = generate(BEFORE, resolveConfig({ input: 'x' })).files.find((f) => f.path === 'api-surface.json')
    const fromSurface = readContractSide(generated?.contents ?? '', 'api-surface.json')
    expect(fromSurface.source).toBe('surface')
    expect(fromSurface.surface).toEqual(fromSpec.surface)
    const yaml = readContractSide('openapi: 3.0.3\ninfo: { title: Y, version: "1" }\npaths: {}\n', 'y.yaml')
    expect(yaml.surface.title).toBe('Y')
  })

  it.each([
    ['{"version":1,"operations":{},"models":{}}', /API surface of version 1; this Lathe reads version 2/],
    ['{"swagger":"2.0","info":{}}', /^\[Pyreon\] lathe diff: `x`: this is a Swagger 2\.0 document/],
    ['[1,2', /is not JSON or YAML/],
    ['{"info":{}}', /no `openapi` version key/],
  ])('refuses %s with the file named', (text, message) => {
    expect(() => readContractSide(text, 'x')).toThrow(message)
  })
})

describe('what a change affects', () => {
  const diff = contractDiff(readContractSide(BEFORE, 'a').surface, readContractSide(AFTER, 'b').surface)

  it('reaches every operation that uses a model — transitively, through other models', () => {
    const optional = diff.changes.find((c) => c.code === 'field-now-optional')
    expect(optional?.subject).toBe('Customer.email')
    // `getOrder` returns an Order that CONTAINS a Customer: it is affected too.
    expect(optional?.affects.map((a) => a.id)).toEqual(['getOrder', 'listCustomers'])
    expect(optional?.affects[0]).toEqual({ id: 'getOrder', module: 'orders', symbols: ['getOrder', 'useGetOrder'] })
  })

  it('counts breaking and additive, breaking first', () => {
    expect(diff.breaking).toBe(1)
    expect(diff.additive).toBe(1)
    expect(diff.changes.map((c) => c.severity)).toEqual(['breaking', 'additive'])
  })

  it('an operation change affects that operation', () => {
    const removed = contractDiff(
      readContractSide(BEFORE, 'a').surface,
      readContractSide(spec({ paths: {} }), 'b').surface,
    )
    const change = removed.changes.find((c) => c.subject === 'getOrder')
    expect(change?.affects.map((a) => a.id)).toEqual(['getOrder'])
  })
})

describe('rendering', () => {
  const diff = contractDiff(readContractSide(BEFORE, 'a').surface, readContractSide(AFTER, 'b').surface)

  it('markdown: breaking section first, symbols named, pipes escaped', () => {
    const md = renderContractDiff(diff, 'markdown')
    expect(md.indexOf('#### Breaking')).toBeLessThan(md.indexOf('#### Additive'))
    expect(md).toContain('`getOrder`, `useGetOrder` (orders)')
    // Every table row has exactly the header's column count.
    for (const row of md.split('\n').filter((l) => l.startsWith('| `'))) {
      expect(row.split(/(?<!\\)\|/).length - 2).toBe(4)
    }
  })

  it('markdown survives a backtick and a pipe inside a subject or detail', () => {
    const hostile = {
      ...diff,
      changes: [{ ...diff.changes[0]!, subject: 'a`b', detail: 'x | y\nz' }],
    }
    const md = renderContractDiff(hostile, 'markdown')
    expect(md).toContain('`` a`b ``')
    expect(md).toContain('x \\| y z')
  })

  it('github: one annotation per change, with newlines escaped so none is cut short', () => {
    const gh = renderContractDiff({ ...diff, changes: [{ ...diff.changes[0]!, detail: 'line1\nline2 100%' }] }, 'github')
    expect(gh.trim().split('\n')).toHaveLength(1)
    expect(gh).toMatch(/^::error title=API breaking: field-now-optional::Customer\.email — line1%0Aline2 100%25/)
    expect(renderContractDiff(diff, 'github')).toContain('::notice title=API additive: field-added::')
  })

  it('text and json, and the no-change case', () => {
    expect(renderContractDiff(diff, 'text')).toContain('BREAKING  field-now-optional  Customer.email')
    expect(JSON.parse(renderContractDiff(diff, 'json'))).toMatchObject({ breaking: 1, additive: 1 })
    const none = contractDiff(readContractSide(BEFORE, 'a').surface, readContractSide(BEFORE, 'b').surface)
    expect(renderContractDiff(none, 'text')).toBe('API contract: No contract changes.\n')
    expect(renderContractDiff(none, 'markdown')).toContain('Nothing a generated client depends on moved.')
    expect(renderContractDiff(none, 'github')).toBe('')
  })

  it('names a renamed API, and falls back to operation ids when the surface recorded no symbols', () => {
    const a = readContractSide(BEFORE, 'a').surface
    const b = readContractSide(AFTER.replace('"Shop"', '"Shop v2"'), 'b').surface
    for (const op of Object.values(b.operations)) {
      delete op.module
      delete op.symbols
    }
    for (const op of Object.values(a.operations)) {
      delete op.module
      delete op.symbols
    }
    const d = contractDiff(a, b)
    const md = renderContractDiff(d, 'markdown')
    expect(md).toContain('Shop → Shop v2')
    expect(md).toContain('| `getOrder`; `listCustomers` |')
    expect(renderContractDiff(d, 'text')).toContain('affects getOrder; listCustomers')
    const noAffects = { ...d, changes: [{ ...d.changes[0]!, affects: [] }] }
    expect(renderContractDiff(noAffects, 'github')).not.toContain('(affects')
    expect(renderContractDiff(noAffects, 'markdown')).toContain('| — |')
  })

  it('limits the affected list and says how many more', () => {
    const many = { ...diff, changes: [{ ...diff.changes[0]!, affects: Array.from({ length: 9 }, (_, i) => ({ id: `op${i}`, symbols: [] })) }] }
    expect(renderContractDiff(many, 'text')).toContain('and 3 more')
  })
})

describe('the CLI', () => {
  it('parses `diff <before> <after>` and refuses what does not apply', () => {
    expect(parseArgv(['diff', 'a.yaml', 'b.yaml', '--format', 'markdown'])).toMatchObject({
      command: 'diff',
      input: 'a.yaml',
      compare: 'b.yaml',
      format: 'markdown',
      errors: [],
    })
    expect(parseArgv(['diff', 'a.yaml']).errors[0]).toMatch(/takes two files/)
    expect(parseArgv(['diff', 'a', 'b', '--format', 'mardown']).errors[0]).toMatch(/Did you mean `markdown`/)
    expect(parseArgv(['generate', '--format', 'json']).errors[0]).toMatch(/only applies to `lathe diff`/)
    expect(parseArgv(['diff', 'a', 'b', '--out', 'x']).errors[0]).toMatch(/does not apply to `diff`/)
    expect(parseArgv(['diff', 'a', 'b', '--json']).format).toBe('json')
  })

  const memFs = (files: Record<string, string>, git: Record<string, string> = {}): Fs => ({
    read: (p) => files[p] as string,
    write: () => undefined,
    exists: (p) => p in files,
    mkdirp: () => undefined,
    remove: () => undefined,
    join: (...p) => p.join('/'),
    gitShow: (rev, path) => git[`${rev}:${path}`],
  })

  it('exits 0 by default, 1 on a breaking change under --fail-on-breaking, 2 when an input cannot be read', async () => {
    const fs = memFs({ 'a.json': BEFORE, 'b.json': AFTER })
    expect((await run(parseArgv(['diff', 'a.json', 'b.json']), undefined, fs)).code).toBe(0)
    expect((await run(parseArgv(['diff', 'a.json', 'b.json', '--fail-on-breaking']), undefined, fs)).code).toBe(1)
    expect((await run(parseArgv(['diff', 'a.json', 'a.json', '--fail-on-breaking']), undefined, fs)).code).toBe(0)
    const missing = await run(parseArgv(['diff', 'nope.json', 'b.json']), undefined, fs)
    expect(missing.code).toBe(2)
    expect(missing.stderr).toMatch(/`nope\.json` does not exist/)
  })

  it('reads `<rev>:<path>` from git, and says which revision lacked the file', async () => {
    const fs = memFs({ 'b.json': AFTER }, { 'main:api/openapi.json': BEFORE })
    const ok = await run(parseArgv(['diff', 'main:api/openapi.json', 'b.json', '--format', 'text']), undefined, fs)
    expect(ok.stdout).toContain('field-now-optional')
    const gone = await run(parseArgv(['diff', 'main:missing.json', 'b.json']), undefined, fs)
    expect(gone.stderr).toMatch(/`missing\.json` does not exist at git revision `main`/)
  })

  it('--json is the one report shape, with the diff inside; github returns a summary for the job page', async () => {
    const fs = memFs({ 'a.json': BEFORE, 'b.json': AFTER })
    const json = await run(parseArgv(['diff', 'a.json', 'b.json', '--json', '--fail-on-breaking']), undefined, fs)
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: false, command: 'diff', projects: [], diff: { breaking: 1 } })
    const bad = await run(parseArgv(['diff', 'x', 'b.json', '--json']), undefined, fs)
    expect(JSON.parse(bad.stdout)).toMatchObject({ ok: false, error: { message: expect.stringMatching(/does not exist/) } })
    const gh = await run(parseArgv(['diff', 'a.json', 'b.json', '--format', 'github']), undefined, fs)
    expect(gh.stdout.startsWith('::error')).toBe(true)
    expect(gh.summary).toContain('### API contract: 1 breaking, 1 additive')
  })

  it('the bin reads a real git revision and appends to $GITHUB_STEP_SUMMARY', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lathe-diff-'))
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
    const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { env, stdio: 'pipe' })
    const summary = join(dir, 'summary.md')
    const prevSummary = process.env.GITHUB_STEP_SUMMARY
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      git('init', '-q')
      git('config', 'user.email', 't@t.test')
      git('config', 'user.name', 't')
      writeFileSync(join(dir, 'openapi.json'), BEFORE)
      git('add', 'openapi.json')
      git('commit', '-q', '-m', 'v1')
      writeFileSync(join(dir, 'openapi.json'), AFTER)
      process.env.GITHUB_STEP_SUMMARY = summary
      const code = await main(['diff', 'HEAD:openapi.json', 'openapi.json', '--format', 'github', '--fail-on-breaking'], dir)
      expect(code).toBe(1)
      expect(readFileSync(summary, 'utf8')).toContain('field-now-optional')
    } finally {
      write.mockRestore()
      if (prevSummary === undefined) delete process.env.GITHUB_STEP_SUMMARY
      else process.env.GITHUB_STEP_SUMMARY = prevSummary
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
