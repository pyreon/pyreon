/**
 * The ledger spec's output compiles under `noUnusedLocals` /
 * `noUnusedParameters` — the settings most apps turn on.
 *
 * `int64: 'bigint'` adds whole blocks to the output (an adapter client's
 * emitted codec, the axios error-body decoder, a bigint-safe `JSON.stringify`
 * in the previews); each is emitted only where something uses it, and an
 * unused one would be a TS6133 in the consumer's build.
 *
 * The default-mode case is a regression lock found on the way: `components.tsx`
 * emitted every preview renderer unconditionally, so a spec with no list
 * response left `PreviewTable` unused.
 */
import { readFileSync } from 'node:fs'
import { cleanTypecheck, typecheckSpec } from './helpers/typecheck'

const SPEC = (readFileSync(new URL('./int64-bigint-runtime.test.ts', import.meta.url), 'utf8').split('const SPEC = `')[1] ?? '')
  .split('`')[0]
  ?.replace('PORT', '1') as string

const PLUGINS = ['schemas', 'client', 'queries', 'mocks', 'faker', 'mcp', 'components', 'atlas'] as const
const labels: string[] = []

afterAll(() => {
  for (const l of labels) cleanTypecheck(l)
})

describe('no unused locals in the generated output', () => {
  for (const client of ['pyreon', 'fetch', 'axios', 'ky'] as const) {
    for (const validator of ['pyreon', 'zod'] as const) {
      it(`int64: 'bigint' — client=${client} validator=${validator}`, () => {
        const label = `no-unused-${client}-${validator}`
        labels.push(label)
        const r = typecheckSpec(label, SPEC, { client, validator, int64: 'bigint', plugins: [...PLUGINS] }, { noUnused: true })
        expect(r.errors, r.errors.join('\n')).toEqual([])
      }, 120_000)
    }
  }

  it('default mode, a spec with no list response — no unused preview renderer', () => {
    labels.push('no-unused-default')
    const r = typecheckSpec('no-unused-default', SPEC, { plugins: [...PLUGINS] }, { noUnused: true })
    expect(r.errors, r.errors.join('\n')).toEqual([])
  }, 120_000)
})
