/**
 * The lathe CLI's argument parser.
 *
 * A mis-parsed flag here does not error — it generates. `--client fetch`
 * read as `--client undefined` silently falls back to the default and
 * emits a client against the wrong HTTP layer; `--out` swallowing the
 * next flag writes the whole tree to a directory named `--json`. The
 * user sees output, just not the output they asked for.
 *
 * Both spellings of every value flag (`--x v` and `--x=v`) matter for
 * the same reason: supporting only one means the other silently does
 * nothing while looking accepted. That is a parser bug an author reads
 * as a config bug.
 *
 * The boolean gates — `--fail-on-breaking` especially — decide an EXIT
 * CODE, so dropping one turns a gate into a no-op that reports success.
 */
import { describe, expect, it } from 'vitest'
import { HELP, parseArgv } from '../cli/run'

const p = (...args: string[]) => parseArgv(args)

describe('the verb', () => {
  it('reads each command', () => {
    expect(p('generate').command).toBe('generate')
    expect(p('check').command).toBe('check')
    expect(p('pull').command).toBe('pull')
  })

  it('defaults to help with no arguments', () => {
    // Doing nothing silently is worse than printing usage.
    expect(p().command).toBe('help')
  })

  it('treats -h and --help as help, EVEN WITH a verb present', () => {
    // `--help` is the flag a user types when they are unsure. Letting
    // the verb win means `lathe generate --help` writes a client into
    // their repo instead of explaining itself — and every CLI they
    // already know (`git commit --help`) prints help there.
    expect(p('-h').command).toBe('help')
    expect(p('--help').command).toBe('help')
    expect(p('generate', '--help').command).toBe('help')
    expect(p('check', '-h').command).toBe('help')
    expect(p('generate', 'openapi.yaml', '--help').command).toBe('help')
  })

  it('still reads a BARE PATH as generate', () => {
    // The verb branch uses "command is help" as its no-verb sentinel, so
    // the fix above has to keep this working.
    const a = p('./openapi.yaml')
    expect(a.command).toBe('generate')
    expect(a.input).toBe('./openapi.yaml')
  })

  it('reads a positional spec path after the verb', () => {
    expect(p('generate', 'openapi.yaml').input).toBe('openapi.yaml')
  })

  it('does not mistake a FLAG for the positional path', () => {
    // `lathe generate --json` must not try to read a spec called
    // `--json`, which would report "spec not found at --json".
    expect(p('generate', '--json').input).toBeUndefined()
  })
})

describe('every value flag accepts both spellings', () => {
  for (const [flag, key, value] of [
    ['--out', 'output', 'src/api'],
    ['--output', 'output', 'src/api'],
    ['--target', 'target', 'multiplatform'],
    ['--base-url', 'baseUrl', 'https://api.example.com'],
    ['--client', 'client', 'fetch'],
    ['--validator', 'validator', 'zod'],
  ] as Array<[string, string, string]>) {
    it(`reads ${flag} in the separated form`, () => {
      expect((p('generate', flag, value) as unknown as Record<string, unknown>)[key], flag)
        .toBe(value)
    })
  }

  for (const [flag, key, value] of [
    ['--out', 'output', 'src/api'],
    ['--target', 'target', 'multiplatform'],
    ['--base-url', 'baseUrl', 'https://api.example.com'],
    ['--client', 'client', 'fetch'],
    ['--validator', 'validator', 'zod'],
  ] as Array<[string, string, string]>) {
    it(`reads ${flag}= in the joined form`, () => {
      // Supporting only one spelling means the other silently does
      // nothing while looking accepted.
      expect((p('generate', `${flag}=${value}`) as unknown as Record<string, unknown>)[key], flag)
        .toBe(value)
    })
  }

  it('reads a base URL containing = without truncating it', () => {
    // A signed or query-bearing base URL. Slicing at the first `=` would
    // silently point the client somewhere else.
    expect(p('generate', '--base-url=https://x.com/?k=v').baseUrl).toBe('https://x.com/?k=v')
  })
})

describe('boolean gates default OFF and are read exactly', () => {
  it('defaults every gate to false', () => {
    // A gate that defaults on fires on work nobody asked it to check.
    const d = p('generate')
    expect(d.json).toBe(false)
    expect(d.watch).toBe(false)
    expect(d.strictNative).toBe(false)
    expect(d.failOnBreaking).toBe(false)
  })

  it('reads each one', () => {
    // `--fail-on-breaking` decides an EXIT CODE; dropping it turns the
    // contract gate into a no-op that reports success.
    expect(p('check', '--fail-on-breaking').failOnBreaking).toBe(true)
    expect(p('generate', '--strict-native').strictNative).toBe(true)
    expect(p('generate', '--json').json).toBe(true)
    expect(p('generate', '--watch').watch).toBe(true)
    expect(p('generate', '-w').watch).toBe(true)
  })

  it('reads several together without one eating another', () => {
    const a = p('check', '--fail-on-breaking', '--json', '--strict-native')
    expect([a.failOnBreaking, a.json, a.strictNative]).toEqual([true, true, true])
  })
})

describe('--plugins takes a comma list', () => {
  it('splits and trims empties, in both spellings', () => {
    expect(p('generate', '--plugins', 'types,schemas').plugins).toEqual(['types', 'schemas'])
    expect(p('generate', '--plugins=types,queries').plugins).toEqual(['types', 'queries'])
  })

  it('drops empty entries from a trailing or doubled comma', () => {
    // `--plugins=types,` is an ordinary typo. An empty plugin name would
    // fail a lookup far from here.
    expect(p('generate', '--plugins=types,,queries,').plugins).toEqual(['types', 'queries'])
  })

  it('yields an EMPTY list, not undefined, for an empty value', () => {
    // The distinction is real: absent means "use the defaults", empty
    // means "the user asked for none".
    expect(p('generate', '--plugins=').plugins).toEqual([])
  })

  it('does not consume the next flag when the value is missing', () => {
    // `--plugins --json` — the parser must not swallow `--json` as the
    // plugin list, which would silently drop the flag.
    const a = p('generate', '--plugins')
    expect(a.plugins).toEqual([])
  })
})

describe('an UNKNOWN flag is ignored rather than taken as the spec path', () => {
  it('does not treat it as a positional', () => {
    // Treating `--nonsense` as the input path produces "spec not found
    // at --nonsense", which reads as a missing file rather than a typo.
    const a = p('generate', '--nonsense', 'openapi.yaml')
    expect(a.input).toBe('openapi.yaml')
  })
})

describe('--target selects the generation mode', () => {
  it('reads multiplatform and web', () => {
    // `multiplatform` runs the REAL compiler over the emitted output and
    // asserts a positive lowering marker. Reading it as `web` skips that
    // entirely, so a client that cannot lower reports success.
    expect(p('generate', '--target', 'multiplatform').target).toBe('multiplatform')
    expect(p('generate', '--target=web').target).toBe('web')
  })

  it('leaves target UNSET when not given, rather than defaulting here', () => {
    // The default belongs to the config layer, which can be overridden
    // per project. Baking one into the parser silently beats the config.
    expect(p('generate').target).toBeUndefined()
  })
})

describe('the help text names what the flags do', () => {
  it('documents every flag the parser accepts', () => {
    // A flag the parser reads but help never mentions is undiscoverable,
    // and one help mentions but the parser drops is worse.
    for (const flag of [
      '--out', '--target', '--client', '--validator', '--plugins',
      '--base-url', '--strict-native', '--fail-on-breaking', '--json', '--watch',
    ]) {
      expect(HELP, flag).toContain(flag)
    }
  })

  it('names every command', () => {
    for (const verb of ['generate', 'check', 'pull']) {
      expect(HELP, verb).toContain(verb)
    }
  })
})
