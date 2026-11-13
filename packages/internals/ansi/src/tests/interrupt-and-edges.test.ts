import { afterEach, describe, expect, it, vi } from 'vitest'
import { onInterrupt } from '../interrupt'
import { columns, createTerm, finding, verdict, xterm256Rgb } from '../index'

const plain = createTerm({ level: 0, unicode: true, width: 40 })

describe('onInterrupt', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints the rendered line, then exits 130 by default', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const write = vi.fn()
    const before = process.listenerCount('SIGINT')
    onInterrupt(() => '! interrupted', { write })
    expect(process.listenerCount('SIGINT')).toBe(before + 1)
    process.emit('SIGINT')
    expect(write).toHaveBeenCalledWith('\n! interrupted\n')
    expect(exit).toHaveBeenCalledWith(130)
    // One-shot: the handler removed itself.
    expect(process.listenerCount('SIGINT')).toBe(before)
  })

  it('honours a custom exit code and can print without exiting', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const write = vi.fn()
    onInterrupt(() => 'a', { write, code: 0 })
    process.emit('SIGINT')
    expect(exit).toHaveBeenCalledWith(0)

    exit.mockClear()
    onInterrupt(() => 'b', { write, exit: false })
    process.emit('SIGINT')
    expect(write).toHaveBeenLastCalledWith('\nb\n')
    expect(exit).not.toHaveBeenCalled()
  })

  it('writes to stderr when no writer is given, so --json stdout stays valid', () => {
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    onInterrupt(() => 'x')
    process.emit('SIGINT')
    expect(err).toHaveBeenCalledWith('\nx\n')
  })

  it('the disposer detaches the handler so a later Ctrl-C falls through', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const write = vi.fn()
    const before = process.listenerCount('SIGINT')
    const off = onInterrupt(() => 'y', { write })
    off()
    expect(process.listenerCount('SIGINT')).toBe(before)
    expect(write).not.toHaveBeenCalled()
    expect(exit).not.toHaveBeenCalled()
  })
})

describe('layout edges', () => {
  it('verdict without a status has no mark, and a too-wide line with no meta is returned whole', () => {
    expect(verdict(plain, null, 'done')).toBe('done')
    const long = 'x'.repeat(60)
    expect(verdict(plain, 'ok', long)).toBe(`✓ ${long}`)
  })

  it('verdict moves whole meta parts onto indented lines when too wide, keeping those that fit on the first', () => {
    const out = verdict(plain, 'ok', 'finished the run', ['a', 'b'.repeat(30), 'c'])
    const lines = out.split('\n')
    expect(lines[0]).toContain('finished the run')
    expect(lines[0]).toContain('a')
    expect(lines[1]).toBe(`  ${'b'.repeat(30)} · c`)
  })

  it('columns stacks a table that is too wide, dropping empty cells and single-cell rows keep one line', () => {
    const rows = [['one', 'alpha', 'beta'], ['two', '', ''], []]
    expect(columns(rows, { width: 5 })).toEqual(['  one', '    alpha  beta', '  two', ''])
    // Fits: aligned, right-aligned columns honoured.
    expect(
      columns(
        [
          ['a', '1'],
          ['bb', '22'],
        ],
        { align: ['left', 'right'], width: 40 },
      ),
    ).toEqual(['  a    1', '  bb  22'])
  })

  it('finding wraps a long fix and shows related locations without a label', () => {
    const lines = finding(plain, {
      severity: 'error',
      source: 'gate',
      message: 'm',
      related: [
        { path: 'a.ts', line: 1 },
        { path: 'b.ts', label: 'also' },
      ],
      fix: 'change the thing '.repeat(6),
    })
    const text = lines.join('\n')
    expect(text).toContain('a.ts:1')
    expect(text).toContain('b.ts (also)')
    expect(lines.filter((l) => l.includes('fix:'))).toHaveLength(1)
    expect(lines.length).toBeGreaterThan(4)
  })
})

describe('palette edges', () => {
  it('xterm256Rgb yields zero channels, not NaN, for an index outside the colour cube', () => {
    expect(xterm256Rgb(16)).toEqual([0, 0, 0])
    expect(xterm256Rgb(15)).toEqual([0, 0, 0])
    expect(xterm256Rgb(231)).toEqual([255, 255, 255])
  })
})

describe('createTerm width from the real stream', () => {
  const desc = Object.getOwnPropertyDescriptor(process.stdout, 'columns')
  const ttyDesc = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
  afterEach(() => {
    if (desc) Object.defineProperty(process.stdout, 'columns', desc)
    else delete (process.stdout as unknown as Record<string, unknown>).columns
    if (ttyDesc) Object.defineProperty(process.stdout, 'isTTY', ttyDesc)
    else delete (process.stdout as unknown as Record<string, unknown>).isTTY
  })

  it('uses the detected stream width only when isTTY was detected rather than given', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    Object.defineProperty(process.stdout, 'columns', { value: 72, configurable: true })
    expect(createTerm({ env: {}, level: 0 }).width).toBe(72)
    // A caller that describes its own terminal does not inherit the real window.
    expect(createTerm({ env: {}, level: 0, isTTY: true }).width).toBe(100)
  })
})
