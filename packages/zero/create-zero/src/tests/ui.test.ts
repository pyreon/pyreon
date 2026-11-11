/**
 * `../ui` — the first-party prompts that replaced `@clack/prompts`.
 *
 * Driven through fake streams in both modes the scaffolder meets:
 *
 *  - TTY: raw-mode keystrokes (arrows, space, enter, Ctrl-C, ESC) sent as the
 *    byte sequences a terminal produces, including several keys in one chunk.
 *  - Not a TTY: one answer per line, defaults on an empty line, re-asking on
 *    an invalid answer, and CANCEL at end of input (clack hung there).
 *
 * The run-prompts suite mocks this module to test the wizard's logic; this
 * suite tests the module itself.
 */
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import {
  cancel,
  confirm,
  decodeKeys,
  groupMultiselect,
  intro,
  isCancel,
  multiselect,
  note,
  outro,
  select,
  setPromptIo,
  type PromptInput,
  type PromptStyle,
  spinner,
  text,
} from '../ui'

class FakeInput extends EventEmitter implements PromptInput {
  isTTY: boolean
  raw = false
  paused = true
  constructor(tty: boolean) {
    super()
    this.isTTY = tty
  }
  setRawMode(mode: boolean) {
    this.raw = mode
    return this
  }
  setEncoding() {
    return this
  }
  resume() {
    this.paused = false
    return this
  }
  pause() {
    this.paused = true
    return this
  }
  /** Deliver bytes on the next tick, as a terminal would. */
  send(...chunks: string[]) {
    for (const chunk of chunks) this.emit('data', chunk)
  }
  end() {
    this.emit('end')
  }
}

const ESC = '\u001b'
const UP = `${ESC}[A`
const DOWN = `${ESC}[B`
const LEFT = `${ESC}[D`
const CTRL_C = '\u0003'

let restore: (() => void) | undefined
let out: string[] = []
afterEach(() => restore?.())

function setup(tty: boolean, columns?: number, style?: PromptStyle) {
  restore?.()
  const input = new FakeInput(tty)
  out = []
  restore = setPromptIo({ input, output: { isTTY: tty, columns, write: (s: string) => out.push(s) }, style })
  return input
}
const printed = () => out.join('')

/** Run `fn` with env vars set (undefined = unset), then restore them. */
function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    fn()
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

// Keys are sent after the prompt has attached its listener.
async function drive<T>(input: FakeInput, prompt: Promise<T>, ...chunks: string[]): Promise<T> {
  await tick()
  input.send(...chunks)
  return prompt
}

describe('decodeKeys', () => {
  it('decodes arrows (CSI and SS3), enter, space, backspace, Ctrl-C, ESC and text', () => {
    expect(decodeKeys(`${UP}${DOWN}${ESC}OC${LEFT}\r\n \u007f\b\t${CTRL_C}${ESC}ab`)).toEqual([
      { name: 'up' },
      { name: 'down' },
      { name: 'right' },
      { name: 'left' },
      { name: 'enter' },
      { name: 'enter' },
      { name: 'space' },
      { name: 'backspace' },
      { name: 'backspace' },
      { name: 'tab' },
      { name: 'cancel' },
      { name: 'cancel' },
      { name: 'char', char: 'a' },
      { name: 'char', char: 'b' },
    ])
  })

  it('skips unknown escape sequences and other control bytes', () => {
    expect(decodeKeys(`${ESC}[3~x\u0001y`)).toEqual([
      { name: 'char', char: 'x' },
      { name: 'char', char: 'y' },
    ])
  })
})

describe('TTY prompts', () => {
  it('text: types, erases, submits; restores the terminal', async () => {
    const input = setup(true)
    const value = await drive(input, text({ message: 'Name', placeholder: 'my-app' }), 'ab', 'x\u007f', ' c', '\r')
    expect(value).toBe('ab c')
    expect(input.raw).toBe(false)
    expect(input.paused).toBe(true)
    expect(printed()).toContain('my-app') // placeholder shown before typing
    expect(printed()).toContain(`${ESC}[?25h`) // cursor shown again
  })

  it('text: navigation keys are ignored', async () => {
    const input = setup(true)
    expect(await drive(input, text({ message: 'Name' }), 'a', UP, LEFT, '\t', 'b', '\r')).toBe('ab')
  })

  it('text: validate blocks submit and shows the message until fixed', async () => {
    const input = setup(true)
    const p = text({ message: 'Name', validate: (v) => (v.trim() ? undefined : 'Project name is required') })
    await tick()
    input.send('\r')
    expect(printed()).toContain('Project name is required')
    input.send('ok', '\r')
    expect(await p).toBe('ok')
  })

  it('Ctrl-C and ESC cancel every prompt kind', async () => {
    for (const key of [CTRL_C, ESC]) {
      let input = setup(true)
      expect(isCancel(await drive(input, text({ message: 'x' }), 'abc', key))).toBe(true)
      input = setup(true)
      expect(
        isCancel(await drive(input, select({ message: 'x', options: [{ value: 1, label: 'one' }] }), key)),
      ).toBe(true)
      input = setup(true)
      expect(
        isCancel(await drive(input, multiselect({ message: 'x', options: [{ value: 1, label: 'one' }] }), key)),
      ).toBe(true)
      input = setup(true)
      expect(isCancel(await drive(input, confirm({ message: 'x' }), key))).toBe(true)
      expect(input.raw).toBe(false)
    }
  })

  const OPTS = [
    { value: 'a', label: 'Alpha', hint: 'first' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
  ]

  it('select: starts at initialValue, arrows (and j/k) move with wrap-around', async () => {
    let input = setup(true)
    expect(await drive(input, select({ message: 'Pick', options: OPTS, initialValue: 'b' }), '\r')).toBe('b')
    input = setup(true)
    expect(await drive(input, select({ message: 'Pick', options: OPTS }), UP, '\r')).toBe('c')
    input = setup(true)
    expect(await drive(input, select({ message: 'Pick', options: OPTS }), DOWN, 'j', 'j', 'k', '\r')).toBe('c')
    input = setup(true)
    expect(await drive(input, select({ message: 'Pick', options: OPTS }), '\t', '\r')).toBe('b')
    expect(printed()).toContain('Beta')
  })

  it('select and multiselect ignore unrelated keys', async () => {
    let input = setup(true)
    expect(await drive(input, select({ message: 'Pick', options: OPTS }), 'x', LEFT, '\r')).toBe('a')
    input = setup(true)
    expect(await drive(input, multiselect({ message: 'M', options: OPTS }), 'x', LEFT, ' ', '\r')).toEqual(['a'])
  })

  it('select: an unknown initialValue falls back to the first option; hint shows on the focused row', async () => {
    const input = setup(true)
    const p = select({ message: 'Pick', options: OPTS, initialValue: 'zzz' })
    await tick()
    expect(printed()).toContain('— first')
    input.send('\r')
    expect(await p).toBe('a')
  })

  it('multiselect: space toggles, `a` toggles all, result keeps option order', async () => {
    let input = setup(true)
    expect(
      await drive(input, multiselect({ message: 'M', options: OPTS, initialValues: ['c'] }), ' ', DOWN, ' ', '\r'),
    ).toEqual(['a', 'b', 'c'])
    input = setup(true)
    expect(await drive(input, multiselect({ message: 'M', options: OPTS }), 'a', '\r')).toEqual(['a', 'b', 'c'])
    input = setup(true)
    expect(
      await drive(input, multiselect({ message: 'M', options: OPTS, initialValues: ['a', 'b', 'c'] }), 'a', 'k', ' ', '\r'),
    ).toEqual(['c'])
    input = setup(true)
    expect(
      await drive(input, multiselect({ message: 'M', options: OPTS, initialValues: ['a'], required: false }), UP, 'j', ' ', '\t', '\r'),
    ).toEqual([])
  })

  it('multiselect: required refuses an empty selection; required:false accepts it', async () => {
    let input = setup(true)
    const p = multiselect({ message: 'M', options: OPTS })
    await tick()
    input.send('\r')
    expect(printed()).toContain('Select at least one option.')
    input.send(' ', '\r')
    expect(await p).toEqual(['a'])
    input = setup(true)
    expect(await drive(input, multiselect({ message: 'M', options: OPTS, required: false }), '\r')).toEqual([])
  })

  it('groupMultiselect: headers are not focusable; items keep group order', async () => {
    const input = setup(true)
    const value = await drive(
      input,
      groupMultiselect({
        message: 'Features',
        options: { State: [{ value: 's', label: 'store' }], Data: [{ value: 'q', label: 'query' }, { value: 'f', label: 'form' }] },
        initialValues: ['f'],
        required: false,
      }),
      DOWN,
      ' ',
      '\r',
    )
    expect(value).toEqual(['q', 'f'])
    expect(printed()).toContain('State')
    expect(printed()).toContain('Data')
    // `required` defaults to true, as clack's did.
    const again = setup(true)
    const p = groupMultiselect({ message: 'F', options: { G: [{ value: 1, label: 'one' }] } })
    await tick()
    again.send('\r')
    expect(printed()).toContain('Select at least one option.')
    again.send(' ', '\r')
    expect(await p).toEqual([1])
  })

  it('confirm: default, arrows toggle, y/n answer immediately', async () => {
    let input = setup(true)
    expect(await drive(input, confirm({ message: 'ok?' }), '\r')).toBe(true)
    input = setup(true)
    expect(await drive(input, confirm({ message: 'ok?', initialValue: false }), '\r')).toBe(false)
    input = setup(true)
    expect(await drive(input, confirm({ message: 'ok?' }), LEFT, '\r')).toBe(false)
    input = setup(true)
    // Four toggles land back on the default.
    expect(await drive(input, confirm({ message: 'ok?' }), UP, DOWN, `${ESC}[C`, '\t', '\r')).toBe(true)
    input = setup(true)
    expect(await drive(input, confirm({ message: 'ok?', initialValue: false }), 'y')).toBe(true)
    input = setup(true)
    expect(await drive(input, confirm({ message: 'ok?' }), 'N')).toBe(false)
    input = setup(true)
    expect(await drive(input, confirm({ message: 'ok?' }), 'x', 'Y')).toBe(true)
  })

  it('redraws in place: each frame clears exactly the lines the previous one used', async () => {
    const input = setup(true, 20, { unicode: true })
    const p = select({ message: 'Pick', options: [{ value: 1, label: 'x'.repeat(30) }, { value: 2, label: 'y' }] })
    await tick()
    input.send(DOWN, '\r')
    await p
    // First frame at 20 cols: header (1) + first row, 35 wide (2) + second row (1)
    // + the 39-wide key-hint footer (2) = 6.
    expect(printed()).toContain(`${ESC}[6A`)
  })
})

describe('redraw on a terminal that reports 0 columns', () => {
  it('treats 0 columns as unknown (80) instead of one character per line', async () => {
    const input = setup(true, 0, { unicode: true })
    const p = select({ message: 'Pick', options: [{ value: 1, label: 'one' }, { value: 2, label: 'two' }] })
    await tick()
    input.send(DOWN, '\r')
    await p
    // header + 2 rows + footer = 4 lines; with 0 taken literally it was ~60.
    expect(printed()).toContain(`${ESC}[4A`)
    expect(printed()).not.toMatch(new RegExp(`${ESC}\\[\\d{2,}A`))
  })
})

describe('non-TTY prompts (one line per answer)', () => {
  it('reads successive answers from one stream, across prompts and chunk boundaries', async () => {
    const input = setup(false)
    const first = text({ message: 'Name' })
    await tick()
    input.send('my-a', 'pp\n2\r\n')
    expect(await first).toBe('my-app')
    const second = select({ message: 'Pick', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] })
    expect(await second).toBe('b')
    expect(input.paused).toBe(true)
  })

  it('an empty line takes the default', async () => {
    const input = setup(false)
    const answers = Promise.all([
      select({ message: 's', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], initialValue: 'b' }),
      multiselect({ message: 'm', options: [{ value: 1, label: 'one' }, { value: 2, label: 'two' }], initialValues: [2] }),
      confirm({ message: 'c', initialValue: false }),
      text({ message: 't' }),
    ])
    await tick()
    input.send('\n\n\n\n')
    expect(await answers).toEqual(['b', [2], false, ''])
  })

  it('select accepts a value or a 1-based number; re-asks on anything else', async () => {
    const input = setup(false)
    const p = select({ message: 'Pick', options: [{ value: 'ssg', label: 'SSG' }, { value: 'spa', label: 'SPA' }] })
    await tick()
    input.send('nope\n', '3\n', 'spa\n')
    expect(await p).toBe('spa')
    expect(printed()).toContain('"nope" is not one of: ssg, spa')
    expect(printed()).toContain('"3" is not one of')
  })

  it('multiselect accepts values/numbers separated by commas or spaces, and `-` for none', async () => {
    const input = setup(false)
    const opts = [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }, { value: 'z', label: 'Z' }]
    const answers = Promise.all([
      multiselect({ message: 'm', options: opts, required: false }),
      multiselect({ message: 'm', options: opts, initialValues: ['x'], required: false }),
      multiselect({ message: 'm', options: opts, required: false }),
    ])
    await tick()
    input.send('z, 1 y\n', '-\n', 'bogus\nx\n')
    expect(await answers).toEqual([['x', 'y', 'z'], [], ['x']])
    expect(printed()).toContain('"bogus" is not one of: x, y, z')
  })

  it('a required multiselect re-asks on an empty answer', async () => {
    const input = setup(false)
    const p = multiselect({ message: 'm', options: [{ value: 'x', label: 'X' }] })
    await tick()
    input.send('\n', '-\n', 'x\n')
    expect(await p).toEqual(['x'])
    expect(printed().match(/Select at least one option\./g)).toHaveLength(2)
  })

  it('confirm accepts y/yes/n/no in any case; re-asks otherwise', async () => {
    // Sequential, as the wizard asks: a re-ask queues behind any prompt
    // already waiting, so concurrent prompts would steal each other's lines.
    const input = setup(false)
    const first = confirm({ message: 'a' })
    await tick()
    input.send('YES\n', 'maybe\nno\n', 'y\n')
    expect(await first).toBe(true)
    expect(await confirm({ message: 'b' })).toBe(false)
    expect(await confirm({ message: 'c', initialValue: false })).toBe(true)
    expect(printed()).toContain('Answer y or n (got "maybe").')
  })

  it('text re-asks while validate rejects', async () => {
    const input = setup(false)
    const p = text({ message: 'Name', validate: (v) => (v ? undefined : 'required') })
    await tick()
    input.send('\n', 'ok\n')
    expect(await p).toBe('ok')
    expect(printed()).toContain('required')
  })

  it('end of input cancels instead of hanging; a final unterminated line still counts', async () => {
    let input = setup(false)
    const p = text({ message: 'Name' })
    await tick()
    input.end()
    expect(isCancel(await p)).toBe(true)

    input = setup(false)
    const q = text({ message: 'Name' })
    await tick()
    input.send('last')
    input.end()
    expect(await q).toBe('last')
  })

  it('end of input cancels a prompt still re-asking', async () => {
    const input = setup(false)
    const p = confirm({ message: 'ok?' })
    await tick()
    input.send('huh\n')
    input.end()
    expect(isCancel(await p)).toBe(true)
  })
})

describe('glyphs (Unicode decided by @pyreon/ansi)', () => {
  it('draws the Unicode frame, or the ASCII fallback when the theme says so', () => {
    setup(false, 80, { color: 0, unicode: true })
    intro('create-zero', '1.0.0')
    note('x', 'Next steps')
    expect(printed()).toContain('┌  create-zero · 1.0.0')
    expect(printed()).toContain('│  x')

    setup(false, 80, { color: 0, unicode: false })
    intro('create-zero', '1.0.0')
    note('x', 'Next steps')
    cancel('Cancelled.')
    expect(printed()).toMatch(/^[\x20-\x7e\n]+$/)
  })

  it('PYREON_CLI_SYMBOLS=ascii switches to ASCII through detection', () => {
    const prev = process.env.PYREON_CLI_SYMBOLS
    try {
      process.env.PYREON_CLI_SYMBOLS = 'ascii'
      setup(false)
      intro('create-zero')
      expect(printed()).toBe('+  create-zero\n')
    } finally {
      if (prev === undefined) delete process.env.PYREON_CLI_SYMBOLS
      else process.env.PYREON_CLI_SYMBOLS = prev
    }
  })
})

describe('messages and spinner', () => {
  it('intro / outro / cancel / note print their text', () => {
    setup(false, 80, { color: 0, unicode: true })
    intro('create-zero', '0.53.0')
    note('cd app\nbun install', 'Next steps')
    cancel('Cancelled.')
    outro('created app', { status: 'ok', meta: ['3 files', '12 ms'] })
    outro('plain')
    expect(printed()).toBe(
      [
        '┌  create-zero · 0.53.0',
        '│',
        'ℹ  Next steps',
        '│  cd app',
        '│  bun install',
        '└  ✗ Cancelled.',
        '',
        '│',
        '└  ✓ created app · 3 files · 12 ms',
        '',
        '│',
        '└  plain',
        '',
        '',
      ].join('\n'),
    )
  })

  it('colours only on a TTY, and never with NO_COLOR', () => {
    withEnv({ NO_COLOR: undefined, FORCE_COLOR: undefined, TERM: 'xterm-256color' }, () => {
      setup(true)
      intro('x')
      expect(printed()).toContain(`${ESC}[`)
      setup(false)
      intro('x')
      expect(printed()).not.toContain(`${ESC}[`)
    })
    withEnv({ NO_COLOR: '1', FORCE_COLOR: undefined, TERM: 'xterm-256color' }, () => {
      setup(true)
      intro('x')
      expect(printed()).not.toContain(`${ESC}[`)
    })
  })

  it('honours FORCE_COLOR and TERM=dumb (the old check ignored both)', () => {
    // FORCE_COLOR colours a pipe — truecolor at 3.
    withEnv({ NO_COLOR: undefined, FORCE_COLOR: '3', TERM: 'xterm-256color' }, () => {
      setup(false)
      intro('x')
      expect(printed()).toContain(`${ESC}[38;2;`)
    })
    withEnv({ NO_COLOR: undefined, FORCE_COLOR: '1', TERM: 'xterm-256color', COLORTERM: undefined }, () => {
      setup(false)
      intro('x')
      expect(printed()).toContain(`${ESC}[31m`)
    })
    // FORCE_COLOR=0 and TERM=dumb turn colour off even on a TTY.
    withEnv({ NO_COLOR: undefined, FORCE_COLOR: '0', TERM: 'xterm-256color' }, () => {
      setup(true)
      intro('x')
      expect(printed()).not.toContain(`${ESC}[`)
    })
    withEnv({ NO_COLOR: undefined, FORCE_COLOR: undefined, TERM: 'dumb' }, () => {
      setup(true)
      intro('x')
      expect(printed()).not.toContain(`${ESC}[`)
    })
  })

  it('PYREON_CLI_THEME=light picks the light palette', () => {
    withEnv({ NO_COLOR: undefined, FORCE_COLOR: '3', PYREON_CLI_THEME: 'light' }, () => {
      setup(false)
      intro('x')
      // accent on light: #B43A0E
      expect(printed()).toContain(`${ESC}[38;2;180;58;14m`)
    })
  })

  it('non-TTY spinner prints start and stop lines, no animation', () => {
    setup(false)
    const s = spinner()
    s.start('Scaffolding project...')
    s.stop('Project created!')
    expect(printed()).toContain('Scaffolding project...')
    expect(printed()).toContain('Project created!')
    expect(printed()).not.toContain(`${ESC}[?25l`)
  })

  it('TTY spinner animates, then restores the cursor and its exit hook on stop', async () => {
    setup(true)
    const exitHooks = process.listenerCount('exit')
    const s = spinner()
    s.start('Working')
    expect(process.listenerCount('exit')).toBe(exitHooks + 1)
    await new Promise((r) => setTimeout(r, 200))
    s.stop('Done')
    expect(process.listenerCount('exit')).toBe(exitHooks)
    const frames = printed().match(/Working/g) ?? []
    expect(frames.length).toBeGreaterThan(1)
    expect(printed()).toContain('Done')
    expect(printed().endsWith(`${ESC}[?25h`)).toBe(true)
  })
})

// ─── The rendered look, frozen ──────────────────────────────────────────────
//
// One specimen of every frame the scaffolder draws — intro, each prompt kind
// while active and once answered, a refused submit, the spinner, the note,
// cancel and the verdict — at each colour level, on both backgrounds, and in
// ASCII. Escapes are made visible (ESC → ␛) so a palette or glyph change shows
// up as a readable diff.

const visible = (s: string): string => s.replaceAll(ESC, '␛')

async function specimen(style: PromptStyle): Promise<string> {
  const chunks: string[] = []
  let input = setup(true, 100, style)
  intro('create-zero', '0.53.0')
  const name = text({
    message: 'Project name',
    placeholder: 'my-zero-app',
    validate: (v) => (v ? undefined : 'Project name is required'),
  })
  await tick()
  input.send('\r', 'my-app', '\r')
  await name
  const template = select({
    message: 'Template',
    options: [
      { value: 'minimal', label: 'Minimal', hint: 'no features, SPA, static deploy' },
      { value: 'standard', label: 'Standard', hint: 'store + query + forms' },
    ],
  })
  await tick()
  input.send(DOWN, '\r')
  await template
  const features = groupMultiselect({
    message: 'Features',
    options: { State: [{ value: 'store', label: 'store', hint: 'signals store' }], Data: [{ value: 'query', label: 'query' }] },
    initialValues: ['query'],
  })
  await tick()
  input.send(' ', '\r')
  await features
  await drive(input, confirm({ message: 'Lint config?' }), LEFT, '\r')
  chunks.push(printed())

  input = setup(true, 100, style)
  await drive(input, text({ message: 'Cancelled prompt' }), 'abc', ESC)
  chunks.push(printed())

  setup(false, 100, style)
  const s = spinner()
  s.start('Scaffolding project...')
  s.stop('Project scaffolded')
  note('cd my-app\nbun install\nbun run dev', 'Next steps')
  outro('created my-app', { status: 'ok', meta: ['42 files', '180 ms'] })
  cancel('Cancelled.')
  chunks.push(printed())
  return visible(chunks.join('\n=====\n'))
}

describe('rendered frames (snapshots)', () => {
  const cases: Array<[string, PromptStyle]> = [
    ['colour level 0 (NO_COLOR)', { color: 0, unicode: true }],
    ['colour level 1 (16 colours)', { color: 1, unicode: true }],
    ['colour level 2, dark', { color: 2, theme: 'dark', unicode: true }],
    ['colour level 2, light', { color: 2, theme: 'light', unicode: true }],
    ['ASCII', { color: 0, unicode: false }],
  ]
  for (const [label, style] of cases) {
    it(label, async () => {
      expect(await specimen(style)).toMatchSnapshot()
    })
  }

  it('level 0 output carries every state as a symbol and a word', async () => {
    const plain = await specimen({ color: 0, unicode: true })
    expect(plain).not.toMatch(/␛\[[0-9;]*m/) // no SGR at all; only cursor control remains
    for (const part of ['◆  Template', '◇  Template', '✗  Cancelled prompt', '! Project name is required', '✓ created my-app', '✗ Cancelled.']) {
      expect(plain).toContain(part)
    }
  })
})
