/**
 * `specName` replaced `rawName.replace(/[<[].+/, '')`, which CodeQL read as an
 * incomplete multi-character sanitizer (`js/incomplete-multi-character-sanitization`):
 * a strip that removes one `<…` run can be re-formed by a nested payload. The
 * strings are command grammar, not HTML, but the cut-at-first-bracket form
 * makes the "no placeholder bracket survives" property structural — these
 * specs pin both that property and parity with the old regex.
 */
import { describe, expect, it } from 'vitest'
import { runCli, specName } from '../argv'

// The pre-fix implementation, kept as the oracle for ordinary spellings.
const regexName = (raw: string): string => raw.replace(/[<[].+/, '').trim()

describe('specName', () => {
  it('matches the previous regex on every ordinary spelling', () => {
    const spellings = [
      '',
      'build',
      'build [root]',
      '[root]',
      'create <name>',
      'run <first> [...rest]',
      '-p, --port <port>',
      '--host [host]',
      '-h, --help',
      '--no-open',
      '  dev  [root]  ',
      'trailing <',
      'trailing [',
      '<',
      '[',
    ]
    for (const raw of spellings) expect(specName(raw), JSON.stringify(raw)).toBe(regexName(raw))
  })

  it('never lets a nested placeholder payload re-form a `<` or `[`', () => {
    const payloads = [
      'run <scr<scriptipt>',
      'run <<script>script>',
      'run [<script>]',
      '--x <scr<script>ipt>',
      'run <scr[ipt>alert(1)</script>',
    ]
    for (const raw of payloads) {
      const name = specName(raw)
      expect(name, raw).not.toMatch(/[<[]/)
    }
    expect(specName('run <scr<scriptipt>')).toBe('run')
    expect(specName('--x <scr<script>ipt>')).toBe('--x')
  })
})

describe('runCli — spec names parsed through specName', () => {
  it('matches a command and reads an option whose placeholders are nested payloads', () => {
    const calls: unknown[][] = []
    runCli(
      {
        name: 'demo',
        version: '1.0.0',
        commands: [
          {
            rawName: 'run <scr<scriptipt>',
            description: 'run',
            options: [{ rawName: '--target <scr<script>ipt>', description: 'target' }],
            action: (...args: unknown[]) => {
              calls.push(args)
            },
          },
        ],
      },
      ['run', 'x', '--target', 'y'],
      () => {},
    )
    expect(calls).toHaveLength(1)
    const [arg, options] = calls[0] as [unknown, Record<string, unknown>]
    expect(arg).toBe('x')
    expect(options.target).toBe('y')
  })
})
