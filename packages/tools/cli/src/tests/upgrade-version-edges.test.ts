import { describe, expect, it } from 'vitest'
import { compareVersions, lowestDeclared } from '../upgrade'

describe('compareVersions prerelease and malformed input', () => {
  it('sorts a prerelease below its release, and prereleases by tag', () => {
    expect(compareVersions('0.52.0', '0.52.0-beta.1')).toBe(1)
    expect(compareVersions('0.52.0-beta.1', '0.52.0')).toBe(-1)
    expect(compareVersions('0.52.0-alpha', '0.52.0-beta')).toBe(-1)
    expect(compareVersions('0.52.0-beta', '0.52.0-alpha')).toBe(1)
    expect(compareVersions('0.52.0-beta', '0.52.0-beta')).toBe(0)
  })

  it('reads a missing or non-numeric segment as zero', () => {
    expect(compareVersions('1', '1.0.0')).toBe(0)
    expect(compareVersions('1.x.0', '1.0.0')).toBe(0)
    expect(compareVersions('', '0.0.1')).toBe(-1)
  })
})

describe('lowestDeclared', () => {
  it('is the lowest declared version, ignoring workspace and other protocol ranges', () => {
    expect(
      lowestDeclared({
        '@pyreon/core': '^0.52.0',
        '@pyreon/zero': '~0.50.3',
        '@pyreon/form': 'workspace:*',
        '@pyreon/x': 'npm:@pyreon/y@0.1.0',
      }),
    ).toBe('0.50.3')
  })

  it('is null when nothing declared carries a version', () => {
    expect(lowestDeclared({})).toBeNull()
    expect(lowestDeclared({ '@pyreon/core': 'workspace:*', '@pyreon/zero': 'latest' })).toBeNull()
  })
})
