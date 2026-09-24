/**
 * The CLI resolves the project's `@pyreon/native-compiler` only when a run
 * produced something for it to verify, and at most once per invocation.
 *
 * Importing it on every run -- including every `web` run, which has no native
 * module to check -- cost each one the load of the whole compiler. The
 * verdict for a web run is unchanged (`no native modules were generated`), so
 * the only observable difference is whether the import happened.
 */
import { run, type Fs } from '../cli/run'
import * as lower from '../verify/lower'

const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://t.test' }]
paths:
  /books:
    get:
      operationId: listBooks
      tags: [books]
      responses: { '200': { content: { application/json: { schema: { type: string } } } } }
`

function memFs(): Fs {
  const files: Record<string, string> = { 'a.yaml': SPEC, 'b.yaml': SPEC }
  return {
    read: (p) => files[p] ?? '',
    write: (p, c) => {
      files[p] = c
    },
    exists: (p) => p in files,
    mkdirp: () => undefined,
    join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
  }
}

const argv = { command: 'check' as const, json: false }

describe('native compiler resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is NOT imported for a web target', async () => {
    const spy = vi.spyOn(lower, 'resolveTransform')
    await run(argv as never, { input: 'a.yaml', output: 'out' }, memFs())
    expect(spy).not.toHaveBeenCalled()
  })

  it('is imported once for several multiplatform projects', async () => {
    const spy = vi.spyOn(lower, 'resolveTransform').mockResolvedValue(undefined)
    await run(
      argv as never,
      {
        target: 'multiplatform',
        projects: [
          { name: 'a', input: 'a.yaml', output: 'out-a' },
          { name: 'b', input: 'b.yaml', output: 'out-b' },
        ],
      },
      memFs(),
    )
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
