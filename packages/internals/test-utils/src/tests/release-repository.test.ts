import { isReleaseRepository } from '../../../../../scripts/release-repository'

describe('release repository identity', () => {
  it.each([
    'git+https://github.com/pyreon/pyreon.git',
    'https://github.com/pyreon/pyreon',
    'https://github.com/pyreon/pyreon.git',
    'git://github.com/pyreon/pyreon.git',
    'git+ssh://git@github.com/pyreon/pyreon.git',
    'git@github.com:pyreon/pyreon.git',
    'github:pyreon/pyreon',
    'pyreon/pyreon',
  ])('accepts npm repository spelling %s for the exact source repository', (url) => {
    expect(isReleaseRepository(url)).toBe(true)
    expect(isReleaseRepository({ type: 'git', url, directory: 'packages/core/core' })).toBe(true)
  })

  it.each([
    'git+https://github.com/pyreon/pyreon-fork.git',
    'https://github.com/pyreon/pyreon/tree/main',
    'https://github.com/pyreon/pyreon?redirect=fork',
    'https://github.com/pyreon/pyreon#readme',
    'https://evil.example/github.com/pyreon/pyreon',
    'https://github.com/pyreon/pyreon.git@evil.example',
    'https://github.com.evil.example/pyreon/pyreon',
    'https://github.com/Pyreon/pyreon',
    'https://github.com/pyreon/Pyreon',
    'https://github.com:444/pyreon/pyreon',
    'github:pyreon/another-repo',
    '',
  ])('rejects a different identity or non-root repository URL: %s', (url) => {
    expect(isReleaseRepository(url)).toBe(false)
    expect(isReleaseRepository({ type: 'git', url })).toBe(false)
  })

  it.each([undefined, null, 42, {}, { url: 42 }])(
    'rejects missing or malformed metadata %j',
    (repository) => {
      expect(isReleaseRepository(repository)).toBe(false)
    },
  )
})
