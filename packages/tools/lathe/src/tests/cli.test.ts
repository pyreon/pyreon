import { HELP, parseArgv, run, type Fs } from '../cli/run'

const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://t.test' }]
paths:
  /books:
    get:
      operationId: listBooks
      tags: [books]
      responses:
        '200':
          content:
            application/json:
              schema: { type: array, items: { $ref: '#/components/schemas/Book' } }
components:
  schemas:
    Book:
      type: object
      required: [id]
      properties:
        id: { type: string }
`

function memFs(seed: Record<string, string> = {}): Fs & { files: Record<string, string> } {
  const files: Record<string, string> = { 'openapi.yaml': SPEC, ...seed }
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
    join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
  }
}

describe('parseArgv', () => {
  it('reads the verb, the positional spec and the flags', () => {
    const a = parseArgv(['generate', 'spec.yaml', '--target=multiplatform', '--out', 'gen', '--json'])
    expect(a).toMatchObject({
      command: 'generate',
      input: 'spec.yaml',
      target: 'multiplatform',
      output: 'gen',
      json: true,
    })
  })

  it('treats a bare path as generate', () => {
    // `lathe ./openapi.yaml` is what everyone types first.
    expect(parseArgv(['./openapi.yaml'])).toMatchObject({ command: 'generate', input: './openapi.yaml' })
  })

  it('defaults to help, and both flag spellings work', () => {
    expect(parseArgv([]).command).toBe('help')
    expect(parseArgv(['--help']).command).toBe('help')
    expect(parseArgv(['generate', '--plugins', 'schemas,mocks']).plugins).toEqual(['schemas', 'mocks'])
    expect(parseArgv(['generate', '--plugins=schemas']).plugins).toEqual(['schemas'])
  })
})

describe('run', () => {
  it('writes files and reports what it wrote', async () => {
    const fs = memFs()
    const r = await run(parseArgv(['generate', 'openapi.yaml', '--out', 'gen']), undefined, fs)
    expect(r.code).toBe(0)
    expect(fs.files['gen/schemas.ts']).toBeDefined()
    expect(r.stdout).toContain('file(s) written')
  })

  it('is idempotent: a second run rewrites nothing', async () => {
    // Byte-identical regeneration is what makes a generated-code diff
    // reviewable; a run that rewrites unchanged files destroys that.
    const fs = memFs()
    const argv = parseArgv(['generate', 'openapi.yaml', '--out', 'gen'])
    await run(argv, undefined, fs)
    const second = await run(argv, undefined, fs)
    expect(second.stdout).toContain('0 file(s) written')
  })

  it('check FAILS on stale output and names the files', async () => {
    const fs = memFs({ 'gen/schemas.ts': '// stale' })
    const r = await run(parseArgv(['check', 'openapi.yaml', '--out', 'gen']), undefined, fs)
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('STALE')
    expect(r.stdout).toContain('lathe generate')
    // `check` must never write.
    expect(fs.files['gen/schemas.ts']).toBe('// stale')
  })

  it('check PASSES when the committed output matches', async () => {
    const fs = memFs()
    await run(parseArgv(['generate', 'openapi.yaml', '--out', 'gen']), undefined, fs)
    const r = await run(parseArgv(['check', 'openapi.yaml', '--out', 'gen']), undefined, fs)
    expect(r.code).toBe(0)
    expect(r.stdout).not.toContain('STALE')
  })

  it('fails with an actionable message when the spec is missing', async () => {
    const r = await run(parseArgv(['generate', 'nope.yaml']), undefined, memFs())
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('spec not found')
  })

  it('config supplies defaults and argv overrides them', async () => {
    const fs = memFs()
    const r = await run(
      parseArgv(['generate', '--out', 'override']),
      { input: 'openapi.yaml', output: 'from-config' },
      fs,
    )
    expect(r.code).toBe(0)
    expect(fs.files['override/schemas.ts']).toBeDefined()
    expect(fs.files['from-config/schemas.ts']).toBeUndefined()
  })

  it('emits machine-readable output with --json', async () => {
    const fs = memFs()
    const r = await run(parseArgv(['generate', 'openapi.yaml', '--out', 'gen', '--json']), undefined, fs)
    const parsed = JSON.parse(r.stdout) as { operations: number; files: string[]; verify: { ran: boolean } }
    expect(parsed.operations).toBe(1)
    expect(parsed.files).toContain('schemas.ts')
    expect(parsed.verify).toHaveProperty('ran')
  })

  it('help mentions both verbs', () => {
    expect(HELP).toContain('lathe generate')
    expect(HELP).toContain('lathe check')
  })

  it('rejects an unknown plugin by name', async () => {
    await expect(
      run(parseArgv(['generate', 'openapi.yaml', '--plugins', 'nope']), undefined, memFs()),
    ).rejects.toThrow('unknown plugin')
  })
})
