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

export const CANCEL: unique symbol = Symbol('create-zero.cancel')
export type Cancel = typeof CANCEL

export function isCancel(value: unknown): value is Cancel {
  return value === CANCEL
}

// ─── IO ─────────────────────────────────────────────────────────────────────

export interface PromptInput {
  isTTY?: boolean
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
  isTTY?: boolean
  columns?: number
  write(text: string): unknown
}

interface Io {
  input: PromptInput
  output: PromptOutput
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

const ESC = '\u001b'
/**
 * Whether the terminal can draw the box/radio glyphs. Every platform but
 * legacy Windows consoles can; Windows Terminal and editor terminals set one
 * of these variables.
 */
export function supportsUnicode(platform: string, env: Record<string, string | undefined>): boolean {
  return platform !== 'win32' || Boolean(env.WT_SESSION || env.TERM_PROGRAM)
}

export function symbolSet(unicode: boolean) {
  const sym = (u: string, ascii: string) => (unicode ? u : ascii)
  return {
    bar: sym('│', '|'),
    start: sym('┌', 'T'),
    end: sym('└', '-'),
    active: sym('◆', '*'),
    submit: sym('◇', 'o'),
    cancel: sym('■', 'x'),
    error: sym('▲', 'x'),
    radioOn: sym('●', '>'),
    radioOff: sym('○', ' '),
    boxOn: sym('◼', '[+]'),
    boxOff: sym('◻', '[ ]'),
    spinner: unicode ? ['◒', '◐', '◓', '◑'] : ['-', '\\', '|', '/'],
  }
}

const S = symbolSet(supportsUnicode(process.platform, process.env))

function useColor(): boolean {
  return io.output.isTTY === true && !process.env.NO_COLOR
}
const paint = (code: string) => (str: string) => (useColor() ? `${ESC}[${code}m${str}${ESC}[0m` : str)
const c = {
  dim: paint('2'),
  cyan: paint('36'),
  green: paint('32'),
  yellow: paint('33'),
  red: paint('31'),
  strike: paint('9'),
  inverse: paint('7'),
}

function write(chunk: string): void {
  io.output.write(chunk)
}

// ─── Messages ───────────────────────────────────────────────────────────────

export function intro(title: string): void {
  write(`${c.dim(S.start)}  ${c.inverse(` ${title} `)}\n`)
}

export function outro(message: string): void {
  write(`${c.dim(S.bar)}\n${c.dim(S.end)}  ${message}\n\n`)
}

export function cancel(message: string): void {
  write(`${c.dim(S.end)}  ${c.red(message)}\n\n`)
}

export function note(body: string, title: string): void {
  const lines = body.split('\n').map((line) => `${c.dim(S.bar)}  ${c.dim(line)}`)
  write(`${c.dim(S.bar)}\n${c.green(S.submit)}  ${title}\n${lines.join('\n')}\n`)
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
      write(`${c.dim(S.bar)}\n`)
      if (!io.output.isTTY) {
        write(`${c.cyan(S.spinner[0] as string)}  ${message}\n`)
        return
      }
      let frame = 0
      write(`${ESC}[?25l`)
      process.once('exit', showCursor)
      const draw = () => {
        write(`\r${ESC}[K${c.cyan(S.spinner[frame % S.spinner.length] as string)}  ${message}`)
        frame++
      }
      draw()
      timer = setInterval(draw, 80)
      timer.unref?.()
    },
    stop(message) {
      if (timer !== undefined) {
        clearInterval(timer)
        timer = undefined
        write(`\r${ESC}[K${c.green(S.submit)}  ${message}\n`)
        showCursor()
        process.off('exit', showCursor)
        return
      }
      write(`${c.green(S.submit)}  ${message}\n`)
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

/** Visible width of a line, ignoring ANSI styling. */
function visibleLength(line: string): number {
  // oxlint-disable-next-line no-control-regex -- matching ANSI escapes is the point
  return line.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '').length
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
      const cols = io.output.columns ?? 80
      lines = frame
        .split('\n')
        .reduce((n, line) => n + Math.max(1, Math.ceil(visibleLength(line) / Math.max(cols, 1))), 0)
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
    write(`${c.dim(S.bar)}\n${ESC}[?25l`)
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
  write(`${c.dim(S.bar)}\n${c.cyan(S.active)}  ${question}\n`)
  for (;;) {
    const line = await reader.next()
    if (line === null) return CANCEL
    const result = accept(line.trim())
    if ('value' in result) return result.value
    write(`${c.yellow(S.error)}  ${result.error}\n`)
  }
}

const isTty = () => io.input.isTTY === true

function header(state: 'active' | 'submit' | 'cancel', message: string): string {
  const icon = state === 'active' ? c.cyan(S.active) : state === 'submit' ? c.green(S.submit) : c.red(S.cancel)
  return `${icon}  ${message}`
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
      const bar = c.dim(S.bar)
      if (state === 'submit') return `${header(state, opts.message)}\n${bar}  ${c.dim(value)}`
      if (state === 'cancel') return `${header(state, opts.message)}\n${bar}  ${c.strike(c.dim(value))}`
      const shown = value === '' && opts.placeholder ? c.dim(opts.placeholder) : value
      const body = `${header(state, opts.message)}\n${c.cyan(S.bar)}  ${shown}${c.inverse(' ')}`
      return error ? `${body}\n${c.yellow(S.end)}  ${c.yellow(error)}` : `${body}\n${c.cyan(S.end)}`
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
    return askLine(`${opts.message} ${c.dim(`(${listing(options)}; default ${String(fallback.value)})`)}`, (line) => {
      if (line === '') return { value: fallback.value }
      const hit = pickToken(options, line)
      return hit ? { value: hit.value } : { error: `"${line}" is not one of: ${options.map((o) => String(o.value)).join(', ')}` }
    })
  }
  let cursor = indexOfValue(options, opts.initialValue)
  const submitted = await runTty({
    render(state) {
      const chosen = options[cursor] as Option<T>
      if (state !== 'active') {
        const label = state === 'submit' ? c.dim(chosen.label) : c.strike(c.dim(chosen.label))
        return `${header(state, opts.message)}\n${c.dim(S.bar)}  ${label}`
      }
      const rows = options.map((o, i) => {
        const on = i === cursor
        const hint = on && o.hint ? ` ${c.dim(`(${o.hint})`)}` : ''
        return `${c.cyan(S.bar)}  ${on ? `${c.green(S.radioOn)} ${o.label}${hint}` : c.dim(`${S.radioOff} ${o.label}`)}`
      })
      return `${header(state, opts.message)}\n${rows.join('\n')}\n${c.cyan(S.end)}`
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
    return askLine(`${message} ${c.dim(`(${listing(items)}; comma-separated, - for none; default ${shown})`)}`, (line) => {
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
      if (state !== 'active') {
        const labels = items.filter((o) => selected.has(o.value)).map((o) => o.label).join(', ') || 'none'
        return `${header(state, message)}\n${c.dim(S.bar)}  ${state === 'submit' ? c.dim(labels) : c.strike(c.dim(labels))}`
      }
      const lines = rows.map((row, i) => {
        if (!row.option) return `${c.cyan(S.bar)}  ${c.dim(row.group as string)}`
        const on = selectable[at] === i
        const checked = selected.has(row.option.value)
        const box = checked ? c.green(S.boxOn) : c.dim(S.boxOff)
        const indent = rows.some((r) => r.group !== undefined) ? '  ' : ''
        const hint = on && row.option.hint ? ` ${c.dim(`(${row.option.hint})`)}` : ''
        return `${c.cyan(S.bar)}  ${indent}${box} ${on ? row.option.label : c.dim(row.option.label)}${hint}`
      })
      const foot = error ? `${c.yellow(S.end)}  ${c.yellow(error)}` : c.cyan(S.end)
      return `${header(state, message)}\n${lines.join('\n')}\n${foot}`
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
    return askLine(`${opts.message} ${c.dim(`(y/n; default ${initial ? 'y' : 'n'})`)}`, (line) => {
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
      const word = value ? 'Yes' : 'No'
      if (state !== 'active') {
        return `${header(state, opts.message)}\n${c.dim(S.bar)}  ${state === 'submit' ? c.dim(word) : c.strike(c.dim(word))}`
      }
      const yes = value ? `${c.green(S.radioOn)} Yes` : c.dim(`${S.radioOff} Yes`)
      const no = value ? c.dim(`${S.radioOff} No`) : `${c.green(S.radioOn)} No`
      return `${header(state, opts.message)}\n${c.cyan(S.bar)}  ${yes} ${c.dim('/')} ${no}\n${c.cyan(S.end)}`
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
