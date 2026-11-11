// ─── Terminal prompts for the scaffolder ────────────────────────────────────
//
// First-party replacement for `@clack/prompts`. The scaffolder uses nine of
// its functions — `intro` / `outro` / `cancel` / `note` / `spinner` and the
// five prompts `text` / `select` / `multiselect` / `groupMultiselect` /
// `confirm` (+ `isCancel`) — and this module implements exactly those, with
// the same call shapes, so `prompts.ts` reads the same.
//
// Two modes, chosen per prompt from the input stream:
//
//   - TTY (a person at a terminal): raw-mode keyboard UI. ↑/↓ (or k/j) move,
//     SPACE toggles a multiselect item (`a` toggles all), ←/→ or y/n answer a
//     confirm, ENTER submits, Ctrl-C or ESC cancels. The prompt redraws in
//     place and collapses to a one-line summary when answered.
//
//   - Not a TTY (piped input, a script, CI): each prompt reads ONE LINE.
//     An empty line takes the default (select: `initialValue` or the first
//     option; multiselect: `initialValues`; confirm: `initialValue`).
//     select takes an option VALUE or its 1-based number; multiselect takes
//     values/numbers separated by commas or spaces, or `-` for none; confirm
//     takes y/yes/n/no. An invalid answer is reported and the next line is
//     read. End of input CANCELS — a script that runs out of answers stops
//     instead of hanging. (`@clack/prompts` hung on piped input: it echoed
//     keystrokes into a UI nothing could submit.)
//
// Cancellation returns the `CANCEL` symbol, tested with `isCancel`, as clack
// did; the caller decides what to print and how to exit.

import { createTerm, header, type Term, verdict, visibleWidth } from '@pyreon/ansi'

export const CANCEL: unique symbol = Symbol('create-zero.cancel')
export type Cancel = typeof CANCEL

export function isCancel(value: unknown): value is Cancel {
  return value === CANCEL
}

// ─── IO ─────────────────────────────────────────────────────────────────────

export interface PromptInput {
  isTTY?: boolean | undefined
  setRawMode?: (mode: boolean) => unknown
  setEncoding(encoding: BufferEncoding): unknown
  on(event: 'data', listener: (chunk: string) => void): unknown
  on(event: 'end', listener: () => void): unknown
  off(event: 'data', listener: (chunk: string) => void): unknown
  off(event: 'end', listener: () => void): unknown
  resume(): unknown
  pause(): unknown
}

export interface PromptOutput {
  isTTY?: boolean | undefined
  columns?: number | undefined
  write(text: string): unknown
}

/**
 * Render for a specific terminal instead of detecting one: colour level
 * (0 plain, 1 sixteen colours, 2 256 colours, 3 truecolor), background and symbol set.
 * Anything left out is detected by `@pyreon/ansi` from the environment and
 * the OUTPUT stream's `isTTY`.
 */
export interface PromptStyle {
  color?: 0 | 1 | 2 | 3 | undefined
  theme?: 'dark' | 'light' | undefined
  unicode?: boolean | undefined
}

interface Io {
  input: PromptInput
  output: PromptOutput
  style?: PromptStyle | undefined
}

let io: Io = {
  input: process.stdin as unknown as PromptInput,
  output: process.stdout as unknown as PromptOutput,
}

/** Swap the streams the prompts use. Returns a restore function. */
export function setPromptIo(next: Io): () => void {
  const prev = io
  io = next
  return () => {
    io = prev
  }
}

// ─── Styling ────────────────────────────────────────────────────────────────
//
// Palette, colour level (NO_COLOR, FORCE_COLOR, TERM=dumb, TTY), theme
// (PYREON_CLI_THEME, COLORFGBG) and the Unicode/ASCII decision all come from
// `@pyreon/ansi`, so the scaffolder looks like every other Pyreon command.
// Detection runs per write against the CURRENT output stream, so a swapped
// stream (tests, a non-TTY pipe) is judged on its own `isTTY`.

const ESC = String.fromCharCode(27)

/** The `Term` for the current output stream. */
export function currentTerm(): Term {
  const s = io.style
  return createTerm({
    level: s?.color,
    theme: s?.theme,
    unicode: s?.unicode,
    isTTY: io.output.isTTY === true,
  })
}

/**
 * The prompt-frame glyphs `@pyreon/ansi` has no token for, with their ASCII
 * fallbacks. Which column is used is decided by the theme's Unicode
 * detection (`t.unicode`), never here.
 */
const FRAME = {
  start: ['┌', '+'],
  end: ['└', '+'],
  boxOn: ['◼', '[x]'],
  boxOff: ['◻', '[ ]'],
  cursor: ['█', '_'],
  upDown: ['↑/↓', 'up/down'],
  leftRight: ['←/→', 'left/right'],
} as const

const SPINNER = { unicode: ['◒', '◐', '◓', '◑'], ascii: ['-', '\\', '|', '/'] } as const

const glyph = (t: Term, name: keyof typeof FRAME): string => FRAME[name][t.unicode ? 0 : 1]

/** The gray gutter `│` between steps. */
const gutter = (t: Term): string => t.gray(t.sym('frameSide'))
/** The gutter of the prompt being answered, in the accent colour. */
const activeGutter = (t: Term): string => t.accent(t.sym('frameSide'))

/** The dim key-hint footer of an active prompt: `└  ↑/↓ move · enter select · esc cancel`. */
const hintFooter = (t: Term, hints: ReadonlyArray<string>): string =>
  `${t.accent(glyph(t, 'end'))}  ${t.dim(hints.join(` ${t.sym('bullet')} `))}`

/** The footer of an active prompt whose last submit was refused. */
const errorFooter = (t: Term, message: string): string =>
  `${t.warn(glyph(t, 'end'))}  ${t.warn(`${t.sym('warn')} ${message}`)}`

function write(chunk: string): void {
  io.output.write(chunk)
}

// ─── Messages ───────────────────────────────────────────────────────────────

/** Rule 1 first line: `┌  create-zero · 0.53.0`. */
export function intro(name: string, context?: string): void {
  const t = currentTerm()
  write(`${t.accent(glyph(t, 'start'))}  ${header(t, name, context)}\n`)
}

export interface OutroVerdict {
  status: 'ok' | 'err' | 'warn' | 'info'
  /** Counts, totals, elapsed — real data only. */
  meta?: ReadonlyArray<string> | undefined
}

/**
 * The last line. With a verdict it is rule 1's verdict line,
 * `└  ✓ created my-app · 42 files · 180 ms`; without one, the plain message.
 */
export function outro(message: string, result?: OutroVerdict): void {
  const t = currentTerm()
  const body = result ? verdict(t, result.status, message, result.meta ?? []) : message
  write(`${gutter(t)}\n${t.gray(glyph(t, 'end'))}  ${body}\n\n`)
}

/** Stop the flow: `└  ✗ Cancelled.` — the symbol and the words carry the state. */
export function cancel(message: string): void {
  const t = currentTerm()
  write(`${t.gray(glyph(t, 'end'))}  ${t.err(`${t.sym('err')} ${message}`)}\n\n`)
}

export function note(body: string, title: string): void {
  const t = currentTerm()
  const lines = body.split('\n').map((line) => `${gutter(t)}  ${line}`)
  write(`${gutter(t)}\n${t.info(t.sym('info'))}  ${t.bold(title)}\n${lines.join('\n')}\n`)
}

export interface Spinner {
  start(message: string): void
  stop(message: string): void
}

export function spinner(): Spinner {
  let timer: ReturnType<typeof setInterval> | undefined
  const showCursor = () => write(`${ESC}[?25h`)
  return {
    start(message) {
      const t = currentTerm()
      const frames = t.unicode ? SPINNER.unicode : SPINNER.ascii
      write(`${gutter(t)}\n`)
      if (!io.output.isTTY) {
        write(`${t.accent(frames[0])}  ${message}\n`)
        return
      }
      let frame = 0
      write(`${ESC}[?25l`)
      process.once('exit', showCursor)
      const draw = () => {
        write(`\r${ESC}[K${t.accent(frames[frame % frames.length] as string)}  ${message}`)
        frame++
      }
      draw()
      timer = setInterval(draw, 80)
      timer.unref?.()
    },
    stop(message) {
      const t = currentTerm()
      const done = `${t.ok(t.sym('promptDone'))}  ${message}\n`
      if (timer !== undefined) {
        clearInterval(timer)
        timer = undefined
        write(`\r${ESC}[K${done}`)
        showCursor()
        process.off('exit', showCursor)
        return
      }
      write(done)
    },
  }
}

// ─── Keys (TTY) ─────────────────────────────────────────────────────────────

type Key =
  | { name: 'up' | 'down' | 'left' | 'right' | 'enter' | 'space' | 'backspace' | 'cancel' | 'tab' }
  | { name: 'char'; char: string }

/** Decode a raw-mode chunk (which may hold several keys, e.g. a paste). */
export function decodeKeys(chunk: string): Key[] {
  const keys: Key[] = []
  let i = 0
  while (i < chunk.length) {
    const ch = chunk[i] as string
    if (ch === ESC) {
      const next = chunk[i + 1]
      if (next === '[' || next === 'O') {
        // CSI / SS3: parameters, then one final byte in @–~.
        let j = i + 2
        while (j < chunk.length && !/[@-~]/.test(chunk[j] as string)) j++
        const final = chunk[j]
        const arrow = { A: 'up', B: 'down', C: 'right', D: 'left' } as const
        if (final && final in arrow) keys.push({ name: arrow[final as keyof typeof arrow] })
        i = j + 1
        continue
      }
      keys.push({ name: 'cancel' }) // a bare ESC
      i++
      continue
    }
    i++
    if (ch === '\r' || ch === '\n') keys.push({ name: 'enter' })
    else if (ch === '\u0003') keys.push({ name: 'cancel' })
    else if (ch === ' ') keys.push({ name: 'space' })
    else if (ch === '\t') keys.push({ name: 'tab' })
    else if (ch === '\u007f' || ch === '\b') keys.push({ name: 'backspace' })
    else if (ch >= ' ') keys.push({ name: 'char', char: ch })
  }
  return keys
}

type Step = 'submit' | 'cancel' | undefined

interface TtyPrompt {
  /** The frame for the current state. */
  render(state: 'active' | 'submit' | 'cancel'): string
  /** Apply a key; return `submit` / `cancel` to finish. */
  key(key: Key): Step
}

function runTty(prompt: TtyPrompt): Promise<boolean> {
  const { input } = io
  return new Promise((resolve) => {
    let lines = 0
    const draw = (state: 'active' | 'submit' | 'cancel') => {
      const frame = prompt.render(state)
      // Clear the previous frame: back to its first line, then to the end.
      if (lines > 0) write(`${ESC}[${lines}A\r${ESC}[J`)
      write(`${frame}\n`)
      // A pseudo-terminal with no size set (`script`, some CI runners and
      // container shells) reports 0 columns; counting with that made every
      // CHARACTER a line, so the next redraw moved the cursor up past the
      // frame and `ESC[J` erased the earlier answers. 0 means unknown.
      const cols = io.output.columns || 80
      lines = frame
        .split('\n')
        .reduce((n, line) => n + Math.max(1, Math.ceil(visibleWidth(line) / Math.max(cols, 1))), 0)
    }
    const finish = (submitted: boolean) => {
      input.off('data', onData)
      input.setRawMode?.(false)
      input.pause()
      draw(submitted ? 'submit' : 'cancel')
      write(`${ESC}[?25h`)
      resolve(submitted)
    }
    const onData = (chunk: string) => {
      for (const key of decodeKeys(chunk)) {
        const step = prompt.key(key)
        if (step) {
          finish(step === 'submit')
          return
        }
      }
      draw('active')
    }
    write(`${gutter(currentTerm())}\n${ESC}[?25l`)
    input.setEncoding('utf8')
    input.setRawMode?.(true)
    input.on('data', onData)
    input.resume()
    draw('active')
  })
}

// ─── Lines (not a TTY) ──────────────────────────────────────────────────────

interface LineReader {
  next(): Promise<string | null>
}

const readers = new WeakMap<PromptInput, LineReader>()

/** One buffered line reader per input stream, shared by every prompt. */
function lineReader(input: PromptInput): LineReader {
  const existing = readers.get(input)
  if (existing) return existing
  let buffer = ''
  let ended = false
  const waiting: Array<(line: string | null) => void> = []
  const flush = () => {
    while (waiting.length > 0) {
      const nl = buffer.indexOf('\n')
      if (nl !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, '')
        buffer = buffer.slice(nl + 1)
        ;(waiting.shift() as (l: string | null) => void)(line)
      } else if (ended) {
        const rest = buffer
        buffer = ''
        ;(waiting.shift() as (l: string | null) => void)(rest === '' ? null : rest)
      } else return
    }
    input.pause()
  }
  input.setEncoding('utf8')
  input.on('data', (chunk: string) => {
    buffer += chunk
    flush()
  })
  input.on('end', () => {
    ended = true
    flush()
  })
  const reader: LineReader = {
    next() {
      return new Promise((resolve) => {
        waiting.push(resolve)
        input.resume()
        flush()
      })
    },
  }
  readers.set(input, reader)
  return reader
}

/**
 * Ask on a non-TTY: print the question, read lines until `accept` returns a
 * value (not `undefined`), reporting each rejection. End of input cancels.
 */
async function askLine<T>(
  question: string,
  accept: (line: string) => { value: T } | { error: string },
): Promise<T | Cancel> {
  const reader = lineReader(io.input)
  const t = currentTerm()
  write(`${gutter(t)}\n${t.accent(t.sym('promptActive'))}  ${question}\n`)
  for (;;) {
    const line = await reader.next()
    if (line === null) return CANCEL
    const result = accept(line.trim())
    if ('value' in result) return result.value
    write(`${t.warn(`${t.sym('warn')}  ${result.error}`)}\n`)
  }
}

const isTty = () => io.input.isTTY === true

type PromptState = 'active' | 'submit' | 'cancel'

/**
 * A prompt's title line: `◆` (accent) while it is asked, `◇` (ok) once
 * answered, `✗` (err) when cancelled — each state has its own symbol, so
 * it reads the same without colour.
 */
function promptHead(t: Term, state: PromptState, message: string): string {
  const icon =
    state === 'active'
      ? t.accent(t.sym('promptActive'))
      : state === 'submit'
        ? t.ok(t.sym('promptDone'))
        : t.err(t.sym('err'))
  return `${icon}  ${message}`
}

/** The collapsed frame of an answered or cancelled prompt. */
function settled(t: Term, state: 'submit' | 'cancel', message: string, answer: string): string {
  return `${promptHead(t, state, message)}\n${gutter(t)}  ${t.dim(answer)}`
}

/** `↑/↓ move` with the ASCII fallback. */
const moveHint = (t: Term): string => `${glyph(t, 'upDown')} move`
const CANCEL_HINT = 'esc cancel'

/** A radio / select row: `● label — hint` (accent, bold) or `○ label — hint` (gray). */
function choiceRow(t: Term, on: boolean, label: string, hint: string | undefined): string {
  const desc = hint ? ` ${t.dim(`${t.sym('dash')} ${hint}`)}` : ''
  return on
    ? `${t.accent(t.sym('selected'))} ${t.bold(label)}${desc}`
    : `${t.gray(t.sym('unselected'))} ${label}${desc}`
}

// ─── text ───────────────────────────────────────────────────────────────────

export interface TextOptions {
  message: string
  placeholder?: string
  /** Return a message to reject the value, nothing to accept it. */
  validate?: (value: string) => string | undefined | void
}

export async function text(opts: TextOptions): Promise<string | Cancel> {
  if (!isTty()) {
    return askLine(opts.message, (line) => {
      const error = opts.validate?.(line)
      return error ? { error } : { value: line }
    })
  }
  let value = ''
  let error: string | undefined
  const submitted = await runTty({
    render(state) {
      const t = currentTerm()
      if (state !== 'active') return settled(t, state, opts.message, value)
      const cursor = t.accent(glyph(t, 'cursor'))
      const shown = value === '' && opts.placeholder ? `${cursor}${t.dim(opts.placeholder)}` : `${value}${cursor}`
      const body = `${promptHead(t, state, opts.message)}\n${activeGutter(t)}  ${shown}`
      return `${body}\n${error ? errorFooter(t, error) : hintFooter(t, ['enter submit', CANCEL_HINT])}`
    },
    key(key) {
      if (key.name === 'cancel') return 'cancel'
      if (key.name === 'enter') {
        const problem = opts.validate?.(value)
        if (problem) {
          error = problem
          return undefined
        }
        return 'submit'
      }
      error = undefined
      if (key.name === 'backspace') value = value.slice(0, -1)
      else if (key.name === 'space') value += ' '
      else if (key.name === 'char') value += key.char
      return undefined
    },
  })
  return submitted ? value : CANCEL
}

// ─── select ─────────────────────────────────────────────────────────────────

export interface Option<T> {
  value: T
  label: string
  hint?: string
}

export interface SelectOptions<T> {
  message: string
  options: Array<Option<T>>
  initialValue?: T
}

function indexOfValue<T>(options: ReadonlyArray<Option<T>>, value: T | undefined): number {
  const i = value === undefined ? -1 : options.findIndex((o) => o.value === value)
  return i === -1 ? 0 : i
}

/** Resolve a non-TTY answer token to an option: its value, or 1-based number. */
function pickToken<T>(options: ReadonlyArray<Option<T>>, token: string): Option<T> | undefined {
  const byValue = options.find((o) => String(o.value) === token)
  if (byValue) return byValue
  const n = Number(token)
  return Number.isInteger(n) && n >= 1 && n <= options.length ? options[n - 1] : undefined
}

function listing<T>(options: ReadonlyArray<Option<T>>): string {
  return options.map((o, i) => `${i + 1}) ${String(o.value)}`).join('  ')
}

export async function select<T>(opts: SelectOptions<T>): Promise<T | Cancel> {
  const { options } = opts
  if (!isTty()) {
    const fallback = options[indexOfValue(options, opts.initialValue)] as Option<T>
    return askLine(`${opts.message} ${currentTerm().dim(`(${listing(options)}; default ${String(fallback.value)})`)}`, (line) => {
      if (line === '') return { value: fallback.value }
      const hit = pickToken(options, line)
      return hit ? { value: hit.value } : { error: `"${line}" is not one of: ${options.map((o) => String(o.value)).join(', ')}` }
    })
  }
  let cursor = indexOfValue(options, opts.initialValue)
  const submitted = await runTty({
    render(state) {
      const t = currentTerm()
      const chosen = options[cursor] as Option<T>
      if (state !== 'active') return settled(t, state, opts.message, chosen.label)
      const rows = options.map((o, i) => `${activeGutter(t)}  ${choiceRow(t, i === cursor, o.label, o.hint)}`)
      const foot = hintFooter(t, [moveHint(t), 'enter select', CANCEL_HINT])
      return `${promptHead(t, state, opts.message)}\n${rows.join('\n')}\n${foot}`
    },
    key(key) {
      if (key.name === 'cancel') return 'cancel'
      if (key.name === 'enter') return 'submit'
      if (key.name === 'up' || (key.name === 'char' && key.char === 'k')) {
        cursor = (cursor - 1 + options.length) % options.length
      } else if (key.name === 'down' || key.name === 'tab' || (key.name === 'char' && key.char === 'j')) {
        cursor = (cursor + 1) % options.length
      }
      return undefined
    },
  })
  return submitted ? (options[cursor] as Option<T>).value : CANCEL
}

// ─── multiselect / groupMultiselect ─────────────────────────────────────────

export interface MultiSelectOptions<T> {
  message: string
  options: Array<Option<T>>
  initialValues?: T[]
  /** When true (the default), submitting an empty selection is refused. */
  required?: boolean
}

export interface GroupMultiSelectOptions<T> {
  message: string
  options: Record<string, Array<Option<T>>>
  initialValues?: T[]
  required?: boolean
}

interface Row<T> {
  option?: Option<T>
  group?: string
}

async function multi<T>(
  message: string,
  rows: ReadonlyArray<Row<T>>,
  initialValues: readonly T[] | undefined,
  required: boolean,
): Promise<T[] | Cancel> {
  const items = rows.flatMap((r) => (r.option ? [r.option] : []))
  const initial = items.filter((o) => initialValues?.includes(o.value)).map((o) => o.value)
  const order = (values: Iterable<T>) => {
    const set = new Set(values)
    return items.filter((o) => set.has(o.value)).map((o) => o.value)
  }
  const emptyError = 'Select at least one option.'

  if (!isTty()) {
    const shown = initial.length > 0 ? initial.map(String).join(',') : '-'
    return askLine(`${message} ${currentTerm().dim(`(${listing(items)}; comma-separated, - for none; default ${shown})`)}`, (line) => {
      if (line === '') return required && initial.length === 0 ? { error: emptyError } : { value: initial }
      if (line === '-') return required ? { error: emptyError } : { value: [] }
      const picked: T[] = []
      for (const token of line.split(/[\s,]+/).filter(Boolean)) {
        const hit = pickToken(items, token)
        if (!hit) return { error: `"${token}" is not one of: ${items.map((o) => String(o.value)).join(', ')}` }
        picked.push(hit.value)
      }
      return { value: order(picked) }
    })
  }

  const selected = new Set<T>(initial)
  const selectable = rows.map((r, i) => (r.option ? i : -1)).filter((i) => i !== -1)
  let at = 0 // index into `selectable`
  let error: string | undefined
  const submitted = await runTty({
    render(state) {
      const t = currentTerm()
      if (state !== 'active') {
        const labels = items.filter((o) => selected.has(o.value)).map((o) => o.label).join(', ') || 'none'
        return settled(t, state, message, labels)
      }
      const grouped = rows.some((r) => r.group !== undefined)
      const lines = rows.map((row, i) => {
        if (!row.option) return `${activeGutter(t)}  ${t.dim(row.group as string)}`
        // The focused row carries `▸` so focus reads without colour too.
        const on = selectable[at] === i
        const pointer = on ? t.accent(t.sym('step')) : ' '.repeat(t.sym('step').length)
        const box = selected.has(row.option.value) ? t.accent(glyph(t, 'boxOn')) : t.gray(glyph(t, 'boxOff'))
        const label = on ? t.bold(row.option.label) : row.option.label
        const hint = row.option.hint ? ` ${t.dim(`${t.sym('dash')} ${row.option.hint}`)}` : ''
        return `${activeGutter(t)}  ${grouped ? '  ' : ''}${pointer} ${box} ${label}${hint}`
      })
      const foot = error
        ? errorFooter(t, error)
        : hintFooter(t, [moveHint(t), 'space toggle', 'a all', 'enter submit', CANCEL_HINT])
      return `${promptHead(t, state, message)}\n${lines.join('\n')}\n${foot}`
    },
    key(key) {
      if (key.name === 'cancel') return 'cancel'
      if (key.name === 'enter') {
        if (required && selected.size === 0) {
          error = emptyError
          return undefined
        }
        return 'submit'
      }
      error = undefined
      const current = rows[selectable[at] as number]?.option as Option<T>
      if (key.name === 'up' || (key.name === 'char' && key.char === 'k')) {
        at = (at - 1 + selectable.length) % selectable.length
      } else if (key.name === 'down' || key.name === 'tab' || (key.name === 'char' && key.char === 'j')) {
        at = (at + 1) % selectable.length
      } else if (key.name === 'space') {
        if (selected.has(current.value)) selected.delete(current.value)
        else selected.add(current.value)
      } else if (key.name === 'char' && key.char === 'a') {
        const all = selected.size === items.length
        selected.clear()
        if (!all) for (const o of items) selected.add(o.value)
      }
      return undefined
    },
  })
  return submitted ? order(selected) : CANCEL
}

export function multiselect<T>(opts: MultiSelectOptions<T>): Promise<T[] | Cancel> {
  return multi(
    opts.message,
    opts.options.map((option) => ({ option })),
    opts.initialValues,
    opts.required ?? true,
  )
}

export function groupMultiselect<T>(opts: GroupMultiSelectOptions<T>): Promise<T[] | Cancel> {
  const rows: Array<Row<T>> = []
  for (const [group, options] of Object.entries(opts.options)) {
    rows.push({ group })
    for (const option of options) rows.push({ option, group })
  }
  return multi(opts.message, rows, opts.initialValues, opts.required ?? true)
}

// ─── confirm ────────────────────────────────────────────────────────────────

export interface ConfirmOptions {
  message: string
  initialValue?: boolean
}

export async function confirm(opts: ConfirmOptions): Promise<boolean | Cancel> {
  const initial = opts.initialValue ?? true
  if (!isTty()) {
    return askLine(`${opts.message} ${currentTerm().dim(`(y/n; default ${initial ? 'y' : 'n'})`)}`, (line) => {
      const answer = line.toLowerCase()
      if (answer === '') return { value: initial }
      if (answer === 'y' || answer === 'yes') return { value: true }
      if (answer === 'n' || answer === 'no') return { value: false }
      return { error: `Answer y or n (got "${line}").` }
    })
  }
  let value = initial
  const submitted = await runTty({
    render(state) {
      const t = currentTerm()
      if (state !== 'active') return settled(t, state, opts.message, value ? 'Yes' : 'No')
      const choices = `${choiceRow(t, value, 'Yes', undefined)} ${t.dim('/')} ${choiceRow(t, !value, 'No', undefined)}`
      const foot = hintFooter(t, [`${glyph(t, 'leftRight')} or y/n`, 'enter submit', CANCEL_HINT])
      return `${promptHead(t, state, opts.message)}\n${activeGutter(t)}  ${choices}\n${foot}`
    },
    key(key) {
      if (key.name === 'cancel') return 'cancel'
      if (key.name === 'enter') return 'submit'
      if (key.name === 'char' && (key.char === 'y' || key.char === 'Y')) {
        value = true
        return 'submit'
      }
      if (key.name === 'char' && (key.char === 'n' || key.char === 'N')) {
        value = false
        return 'submit'
      }
      if (key.name === 'left' || key.name === 'right' || key.name === 'up' || key.name === 'down' || key.name === 'tab') {
        value = !value
      }
      return undefined
    },
  })
  return submitted ? value : CANCEL
}
