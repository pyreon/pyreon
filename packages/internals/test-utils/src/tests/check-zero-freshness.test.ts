import { describe, expect, it } from 'vitest'
import { eolFinding, scanRuntimeRefs } from '../../../../../scripts/check-zero-freshness'

const TODAY = new Date('2026-09-24')

describe('check-zero-freshness — eolFinding', () => {
  it('errors past EOL, warns inside the window, passes otherwise, errors when unknown', () => {
    expect(eolFinding('x', 'runtime nodejs20.x', '2026-04-30', TODAY)?.level).toBe('error')
    expect(eolFinding('x', 'Node 22', '2026-11-01', TODAY)?.level).toBe('warn')
    expect(eolFinding('x', 'Node 24', '2028-04-30', TODAY)).toBeNull()
    expect(eolFinding('x', 'Node 99', undefined, TODAY)?.message).toContain('not in scripts/runtime-eol.json')
  })
})

describe('check-zero-freshness — scanRuntimeRefs', () => {
  it('finds adapter runtimes, Dockerfile FROM, .nvmrc and engines.node; ignores prose', () => {
    const refs = scanRuntimeRefs([
      { path: 'a/vercel.ts', text: "// was nodejs20.x\nconst runtime = opts.runtime ?? 'nodejs22.x'" },
      { path: 't/Dockerfile', text: '# FROM node:18\nFROM node:24-alpine@sha256:abc AS build' },
      { path: 't/.nvmrc', text: 'v20.11.0\n' },
      { path: 't/package.json', text: '{"engines":{"node":">=22"}}' },
    ])
    expect(refs.map((r) => `${r.kind}:${r.id}`)).toEqual(['runtime:nodejs22.x', 'node:24', 'node:20', 'node:22'])
  })
})
