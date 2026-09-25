/**
 * Why? panel labels: a node is shown by its name, else by kind + creation
 * site — never by the framework's synthetic `Derived#3337`.
 */
import { describe, expect, it } from 'vitest'
import { nodeLabel } from '../update-cause'

describe('nodeLabel', () => {
  it('uses a real name (a signal label) verbatim', () => {
    expect(nodeLabel({ id: 4, kind: 'signal', name: 'count' })).toBe('count')
  })

  it('replaces a synthetic name with kind + the creation site', () => {
    expect(
      nodeLabel({
        id: 3337,
        kind: 'derived',
        name: 'derived#3337',
        loc: { file: 'http://localhost:5391/@fs/repo/src/ui/Button.tsx?t=123', line: 12 },
      }),
    ).toBe('derived · ui/Button.tsx:12')
  })

  it('falls back to kind + id when nothing else is known', () => {
    expect(nodeLabel({ id: 9, kind: 'effect', name: 'effect#9' })).toBe('effect #9')
    expect(nodeLabel({ id: 9, kind: 'effect' })).toBe('effect #9')
    expect(nodeLabel({ id: 9, kind: 'signal', name: 'signal#9', loc: { file: 'a/b.ts' } })).toBe(
      'signal · a/b.ts',
    )
  })
})
