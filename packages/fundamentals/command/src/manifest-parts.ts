import type { ApiEntry } from '@pyreon/manifest'

/** One manifest entry; every example line with `// =>` is executed by `tests/examples.test.ts`. */
export function entry(name: string, signature: string, summary: string, example: string, extra?: Partial<ApiEntry>): ApiEntry {
  return { name, kind: 'function', signature, summary, example, ...extra, stability: 'experimental', since: '0.53.0' }
}

export const typeEntry = (name: string, signature: string, summary: string, example: string): ApiEntry =>
  ({ name, kind: 'type', signature, summary, example, stability: 'experimental', since: '0.53.0' })

