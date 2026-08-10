import { flagValue, positionalArgs, positionalDir } from '../run'

describe('positionalArgs', () => {
  it('returns bare arguments in order', () => {
    expect(positionalArgs(['Button', './ui'])).toEqual(['Button', './ui'])
  })

  it('skips flags', () => {
    expect(positionalArgs(['--json', 'Button', '--no-mount'])).toEqual(['Button'])
  })

  it('skips the VALUE of a spaced value-flag', () => {
    // The regression. `--cwd` was missing from the value-flag set, so every
    // command reading a positional alongside it took the PATH as that
    // positional: `atlas check Button --cwd ./ui` parsed `./ui` as the
    // component's args JSON and reported "could not parse the args" for a
    // command line that is entirely correct.
    expect(positionalArgs(['Button', '--cwd', './ui'])).toEqual(['Button'])
    expect(positionalArgs(['verify', '--cwd', '/tmp/x'])).toEqual(['verify'])
  })

  it('does not consume a following argument for the INLINE form', () => {
    // `--cwd=./ui` carries its own value; only the spaced form eats the next.
    expect(positionalArgs(['--cwd=./ui', 'Button'])).toEqual(['Button'])
  })

  it('skips the value of every value-flag, not just --cwd', () => {
    const args = ['--out', 'dist', '--title', 'My UI', '--base', '/x/', 'Button']
    expect(positionalArgs(args)).toEqual(['Button'])
  })

  it('does not swallow a positional after a BOOLEAN flag', () => {
    // The mirror error: treating every flag as value-taking would drop the
    // real argument instead of an imagined value.
    expect(positionalArgs(['--json', 'Button'])).toEqual(['Button'])
  })

  it('returns nothing when there are only flags', () => {
    expect(positionalArgs(['--json', '--cwd', './ui'])).toEqual([])
  })
})

describe('positionalDir', () => {
  it('is the first positional', () => {
    expect(positionalDir(['./ui', 'extra'])).toBe('./ui')
  })

  it('is undefined when a value-flag consumed the only path', () => {
    expect(positionalDir(['--cwd', './ui'])).toBeUndefined()
  })
})

describe('flagValue', () => {
  it('reads the spaced form', () => {
    expect(flagValue(['--out', 'dist'], '--out')).toBe('dist')
  })

  it('reads the inline form', () => {
    expect(flagValue(['--out=dist'], '--out')).toBe('dist')
  })

  it('is undefined when the flag is absent', () => {
    expect(flagValue(['--json'], '--out')).toBeUndefined()
  })

  it('does not match a flag that merely starts with the same letters', () => {
    expect(flagValue(['--output=dist'], '--out')).toBeUndefined()
  })
})
