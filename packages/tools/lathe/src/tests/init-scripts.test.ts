/**
 * `lathe init` finds orval and `@hey-api/openapi-ts` set up with NO config
 * file -- only flags in a package.json script -- and maps those flags the same
 * way it maps the config they are shorthand for.
 */
import { commandArgs, detect, type DetectFs } from '../cli/init/detect'

function fs(files: Record<string, string>): DetectFs {
  return {
    exists: (p) => p in files,
    read: (p) => {
      const v = files[p]
      if (v === undefined) throw new Error(`ENOENT ${p}`)
      return v
    },
  }
}
const pkg = (scripts: Record<string, string>) => JSON.stringify({ scripts })

describe('reading a script command', () => {
  it('finds the tool however it is invoked, and stops at the next command', () => {
    expect(commandArgs('npx orval --input a.yaml && tsc', 'orval')).toEqual(['--input', 'a.yaml'])
    expect(commandArgs('node_modules/.bin/orval -o "src/my api.ts"', 'orval')).toEqual(['-o', 'src/my api.ts'])
    expect(commandArgs("bunx @hey-api/openapi-ts --input='x.json' -o out", 'openapi-ts')).toEqual(['--input', 'x.json', '-o', 'out'])
    expect(commandArgs('orval-cli --x', 'orval')).toBeUndefined()
    expect(commandArgs('tsc -b', 'orval')).toBeUndefined()
  })
})

describe('orval from flags', () => {
  it('maps input, output, client and mock, and reports the rest by name', () => {
    const found = detect(
      fs({ 'package.json': pkg({ 'gen:api': 'orval --input ./spec.yaml --output src/api/client.ts --client react-query --mock --watch' }) }),
    )
    expect(found).toHaveLength(1)
    const [d] = found
    expect(d?.tool).toBe('orval')
    expect(d?.file).toBe('package.json#scripts.gen:api')
    const m = d?.migrations[0]
    expect(m?.section).toMatchObject({ input: './spec.yaml', output: 'src/api', plugins: ['schemas', 'client', 'queries', 'mocks', 'faker'] })
    expect(m?.unmapped.map((u) => u.from)).toEqual(['gen:api.output.watch'])
  })

  it('a config file wins over a script, and a script naming a config FILE reads that file', () => {
    const both = detect(
      fs({ 'orval.config.ts': "export default { a: { input: './c.yaml' } }", 'package.json': pkg({ g: 'orval -i ./s.yaml' }) }),
      'orval',
    )
    expect(both.map((d) => [d.file, d.migrations[0]?.section.input])).toEqual([['orval.config.ts', './c.yaml']])

    const named = detect(
      fs({ 'api/orval.cfg.ts': "export default { a: { input: './named.yaml' } }", 'package.json': pkg({ g: 'orval --config ./api/orval.cfg.ts' }) }),
      'orval',
    )
    expect(named.map((d) => [d.file, d.migrations[0]?.section.input])).toEqual([['api/orval.cfg.ts', './named.yaml']])
    // A named config file that is not there is not guessed at.
    expect(detect(fs({ 'package.json': pkg({ g: 'orval -c missing.ts' }) }), 'orval')).toEqual([])
  })
})

describe('@hey-api/openapi-ts from flags', () => {
  it('maps input, output, client and every plugin after -p', () => {
    const found = detect(
      fs({ 'package.json': pkg({ openapi: 'openapi-ts -i https://api.test/openapi.json -o src/client -c @hey-api/client-axios -p zod @tanstack/react-query --silent' }) }),
      'hey-api',
    )
    const m = found[0]?.migrations[0]
    expect(found[0]?.file).toBe('package.json#scripts.openapi')
    expect(m?.section).toMatchObject({ source: 'https://api.test/openapi.json', output: 'src/client', client: 'axios', validator: 'zod' })
    // schemas + client + queries is the default selection, so it is not written out.
    expect(m?.section.plugins).toBeUndefined()
    expect(m?.mapped.map((x) => x.to)).toContain('plugins: queries (@tanstack/react-query hooks become @pyreon/query hooks)')
    expect(m?.unmapped.map((u) => u.from)).toEqual(['silent'])
  })

  it('a --file config is read from that file', () => {
    const found = detect(
      fs({ 'cfg/hey.ts': "export default { input: './h.yaml', output: 'out' }", 'package.json': pkg({ g: 'openapi-ts --file cfg/hey.ts' }) }),
      'hey-api',
    )
    expect(found.map((d) => [d.file, d.migrations[0]?.section.input])).toEqual([['cfg/hey.ts', './h.yaml']])
  })
})
