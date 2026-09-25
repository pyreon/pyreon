/**
 * Files a previous run generated and this run does not are REMOVED (generate)
 * or reported STALE (check) -- and nothing else is ever touched.
 *
 * Before the manifest, dropping a tag from the spec left its
 * `endpoints/<tag>.ts` and `queries/<tag>.ts` behind forever: they still
 * compiled, still exported hooks for endpoints the server no longer serves, and
 * `lathe check` passed, because it only compared the files it was about to
 * write.
 */
import { OUTPUT_MANIFEST, orphanedPaths } from '../core/output-manifest'
import { parseArgv, run, type Fs } from '../cli/run'

const spec = (tags: readonly string[]): string => `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://t.test' }]
paths:
${tags
  .map(
    (t) => `  /${t}:
    get:
      operationId: list_${t}
      tags: [${t}]
      responses: { '200': { content: { application/json: { schema: { type: string } } } } }`,
  )
  .join('\n')}
`

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
    mkdirp: () => undefined,
    remove: (p) => {
      delete files[p]
    },
    join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
  }
}

const generate = (fs: Fs) => run(parseArgv(['generate', 'spec.yaml', '--out', 'gen']), undefined, fs)
const check = (fs: Fs) => run(parseArgv(['check', 'spec.yaml', '--out', 'gen']), undefined, fs)

describe('orphaned generated files', () => {
  it('generate removes the files for a tag the spec dropped', async () => {
    const fs = memFs({ 'spec.yaml': spec(['alpha', 'beta']) })
    await generate(fs)
    expect(fs.files['gen/endpoints/beta.ts']).toBeDefined()
    expect(fs.files[`gen/${OUTPUT_MANIFEST}`]).toContain('endpoints/beta.ts')

    fs.files['spec.yaml'] = spec(['alpha'])
    const r = await generate(fs)
    expect(fs.files['gen/endpoints/beta.ts']).toBeUndefined()
    expect(fs.files['gen/queries/beta.ts']).toBeUndefined()
    expect(fs.files['gen/endpoints/alpha.ts']).toBeDefined()
    const out = r.stdout.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')
    expect(out).toContain('- gen/endpoints/beta.ts')
    expect(out).toMatch(/2 removed/)
  })

  it('check reports an orphan as STALE and removes nothing', async () => {
    const fs = memFs({ 'spec.yaml': spec(['alpha', 'beta']) })
    await generate(fs)
    fs.files['spec.yaml'] = spec(['alpha'])
    // The rest of the output is current, so the orphans are the ONLY thing
    // that can make this fail -- which is exactly the hole it closes.
    const current = { ...fs.files }
    delete current['gen/endpoints/beta.ts']
    const r = await check(fs)
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('endpoints/beta.ts (orphaned')
    expect(fs.files['gen/endpoints/beta.ts']).toBeDefined()
  })

  it('never touches a file it did not generate', async () => {
    const fs = memFs({ 'spec.yaml': spec(['alpha', 'beta']), 'gen/hand-written.ts': 'export const mine = 1\n' })
    await generate(fs)
    fs.files['spec.yaml'] = spec(['alpha'])
    await generate(fs)
    expect(fs.files['gen/hand-written.ts']).toBe('export const mine = 1\n')
  })

  it('removes nothing on a first run with no manifest', async () => {
    const fs = memFs({ 'spec.yaml': spec(['alpha']), 'gen/endpoints/legacy.ts': 'old' })
    await generate(fs)
    expect(fs.files['gen/endpoints/legacy.ts']).toBe('old')
  })
})

describe('orphanedPaths refuses anything but a plain relative path', () => {
  const manifest = (files: unknown[]) =>
    JSON.stringify({ format: 1, generator: '@pyreon/lathe', files })

  it('returns the difference, sorted', () => {
    expect(orphanedPaths(manifest(['b.ts', 'a.ts', 'keep.ts']), ['keep.ts'])).toEqual(['a.ts', 'b.ts'])
  })

  it('ignores traversal, absolute and drive-letter entries', () => {
    const hostile = ['../src/main.ts', '/etc/passwd', 'C:/x.ts', 'a/../../b.ts', 'ok.ts', 7]
    expect(orphanedPaths(manifest(hostile), [])).toEqual(['ok.ts'])
  })

  it('an absent, unparseable or foreign manifest removes nothing', () => {
    expect(orphanedPaths(undefined, [])).toEqual([])
    expect(orphanedPaths('{not json', [])).toEqual([])
    expect(orphanedPaths(JSON.stringify({ files: ['a.ts'] }), [])).toEqual([])
  })
})
