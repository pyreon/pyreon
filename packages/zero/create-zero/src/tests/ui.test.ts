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
  spinner,
  supportsUnicode,
  symbolSet,
  text,
  type PromptInput,
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

function setup(tty: boolean, columns?: number) {
  const input = new FakeInput(tty)
  out = []
  restore = setPromptIo({ input, output: { isTTY: tty, columns, write: (s: string) => out.push(s) } })
  return input
}
const printed = () => out.join('')
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
    expect(printed()).toContain('(first)')
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
    const input = setup(true, 20)
    const p = select({ message: 'Pick', options: [{ value: 1, label: 'x'.repeat(30) }, { value: 2, label: 'y' }] })
    await tick()
    input.send(DOWN, '\r')
    await p
    // First frame: header + 2 rows (the first wraps to 2 lines at 20 cols) + footer = 5.
    expect(printed()).toContain(`${ESC}[5A`)
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

describe('glyphs', () => {
  it('fall back to ASCII on a legacy Windows console only', () => {
    expect(supportsUnicode('darwin', {})).toBe(true)
    expect(supportsUnicode('linux', {})).toBe(true)
    expect(supportsUnicode('win32', {})).toBe(false)
    expect(supportsUnicode('win32', { WT_SESSION: '1' })).toBe(true)
    expect(supportsUnicode('win32', { TERM_PROGRAM: 'vscode' })).toBe(true)
    const ascii = symbolSet(false)
    expect([ascii.bar, ascii.active, ascii.boxOn, ...ascii.spinner].join('')).toMatch(/^[\x20-\x7e]+$/)
    expect(symbolSet(true).bar).toBe('│')
  })
})

describe('messages and spinner', () => {
  it('intro / outro / cancel / note print their text', () => {
    setup(false)
    intro('Pyreon Zero')
    note('cd app\nbun install', 'Next steps')
    cancel('Cancelled.')
    outro('Happy building!')
    const s = printed()
    for (const part of ['Pyreon Zero', 'Next steps', 'cd app', 'bun install', 'Cancelled.', 'Happy building!']) {
      expect(s).toContain(part)
    }
  })

  it('colours only on a TTY, and never with NO_COLOR', () => {
    setup(true)
    intro('x')
    expect(printed()).toContain(`${ESC}[`)
    const prev = process.env.NO_COLOR
    process.env.NO_COLOR = '1'
    try {
      setup(true)
      intro('x')
      expect(printed()).not.toContain(`${ESC}[`)
    } finally {
      if (prev === undefined) delete process.env.NO_COLOR
      else process.env.NO_COLOR = prev
    }
    setup(false)
    intro('x')
    expect(printed()).not.toContain(`${ESC}[`)
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
