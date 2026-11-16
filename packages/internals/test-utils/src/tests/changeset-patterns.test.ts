import {
  expandChangesetPatterns,
  matchesAnyChangesetPattern,
  matchesChangesetPattern,
} from '../../../../../scripts/changeset-patterns'

describe('changeset config patterns', () => {
  it('matches an exact package name only exactly', () => {
    expect(matchesChangesetPattern('@pyreon/docs', '@pyreon/docs')).toBe(true)
    expect(matchesChangesetPattern('@pyreon/docs-site', '@pyreon/docs')).toBe(false)
  })

  it('expands a "*" glob the way changesets (micromatch) does', () => {
    expect(matchesChangesetPattern('@pyreon/example-kanban', '@pyreon/example-*')).toBe(true)
    expect(matchesChangesetPattern('@pyreon/example-', '@pyreon/example-*')).toBe(true)
    expect(matchesChangesetPattern('@pyreon/examples', '@pyreon/example-*')).toBe(false)
    expect(matchesChangesetPattern('@pyreon/core', '@pyreon/example-*')).toBe(false)
    // `*` never crosses a `/`.
    expect(matchesChangesetPattern('@other/x', '@*')).toBe(false)
  })

  it('treats regex metacharacters in a name as literals', () => {
    expect(matchesChangesetPattern('@pyreon/aXb', '@pyreon/a.b')).toBe(false)
    expect(matchesChangesetPattern('@pyreon/a.b-1', '@pyreon/a.b-*')).toBe(true)
  })

  it('rejects glob syntax it does not implement instead of guessing', () => {
    expect(() => matchesChangesetPattern('@pyreon/x', '@pyreon/{a,b}-*')).toThrow(/Unsupported glob/)
  })

  it('expands a mixed list against workspace names', () => {
    const names = ['@pyreon/core', '@pyreon/docs', '@pyreon/example-a', '@pyreon/example-b']
    expect(expandChangesetPatterns(['@pyreon/docs', '@pyreon/example-*'], names)).toEqual([
      '@pyreon/docs',
      '@pyreon/example-a',
      '@pyreon/example-b',
    ])
    expect(matchesAnyChangesetPattern('@pyreon/core', ['@pyreon/docs', '@pyreon/example-*'])).toBe(false)
  })
})
