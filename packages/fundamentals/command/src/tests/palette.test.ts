import { _resetHotkeys, getRegisteredHotkeys } from '@pyreon/hotkeys'
import { effectScope, signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCommands } from '../commands'
import { createPalette } from '../palette'
import type { Palette } from '../palette-types'
import type { Command, Commands } from '../types'

const cmd = (id: string, extra?: Partial<Command>): Command => ({ id, title: id, ...extra })
const ids = (p: Palette): string[] => p.results().map((r) => r.id)

let registry: Commands
let palettes: Palette[]

const make = (options?: Parameters<typeof createPalette>[0]): Palette => {
  const p = createPalette({ commands: registry, hotkey: false, debounce: 0, ...options })
  palettes.push(p)
  return p
}

beforeEach(() => {
  registry = createCommands({ groups: [{ id: 'file', title: 'File' }, { id: 'view', title: 'View' }] })
  palettes = []
  _resetHotkeys()
})

afterEach(() => {
  for (const p of palettes) p.dispose()
  registry.dispose()
  _resetHotkeys()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('open, close, query', () => {
  it('lists nothing while closed and the commands once open', () => {
    registry.register([cmd('a'), cmd('b')])
    const p = make()
    expect(p.isOpen()).toBe(false)
    expect(p.results()).toEqual([])
    p.open()
    expect(p.isOpen()).toBe(true)
    expect(ids(p)).toEqual(['a', 'b'])
    p.close()
    expect(p.results()).toEqual([])
  })

  it('opening an open palette does not reset it, closing a closed one does nothing, and onOpenChange fires on changes only', () => {
    const onOpenChange = vi.fn()
    registry.register([cmd('alpha'), cmd('beta')])
    const p = make({ onOpenChange })
    p.close()
    p.open()
    p.setQuery('al')
    p.open()
    expect(p.query()).toBe('al')
    p.close()
    p.close()
    expect(onOpenChange.mock.calls).toEqual([[true], [false]])
  })

  it('toggles', () => {
    const p = make()
    p.toggle()
    expect(p.isOpen()).toBe(true)
    p.toggle()
    expect(p.isOpen()).toBe(false)
  })

  it('a new session starts with an empty query and the root page', () => {
    registry.register([cmd('theme', { children: [cmd('dark')] }), cmd('x')])
    const p = make()
    p.open()
    p.setQuery('the')
    p.close()
    p.open()
    expect(p.query()).toBe('')
    expect(p.page()).toEqual([])
  })

  it('only one palette is open at a time: opening a second closes the first', () => {
    const a = make()
    const b = make()
    a.open()
    b.open()
    expect(a.isOpen()).toBe(false)
    expect(b.isOpen()).toBe(true)
  })

  it('opens at a nested page by id, and warns and opens at the root for an id with no page', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registry.register([cmd('theme', { title: 'Change theme…', children: [cmd('dark')] }), cmd('plain')])
    const p = make()
    p.open('theme')
    expect(p.page()).toEqual(['theme'])
    expect(p.pageTitle()).toBe('Change theme…')
    expect(ids(p)).toEqual(['dark'])
    p.close()
    p.open('plain')
    expect(p.page()).toEqual([])
    expect(String(warn.mock.calls[0]?.[0])).toContain('no registered command with that id has a page')
  })
})

describe('results', () => {
  it('ranks, highlights and carries the group, the shortcut and the disabled state', () => {
    registry.register([
      cmd('save', { title: 'Save File', group: 'file', shortcut: 'ctrl+s' }),
      cmd('open', { title: 'Open File', group: 'file' }),
      cmd('off', { title: 'Save All', enabled: false, disabledReason: 'Nothing changed' }),
    ])
    const p = make({ showDisabled: true })
    p.open()
    p.setQuery('sav')
    const [first, second] = p.results()
    expect(first).toMatchObject({ id: 'save', title: 'Save File', ranges: [[0, 3]], group: 'file', enabled: true, shortcuts: ['Ctrl+S'], index: 0 })
    expect(second).toMatchObject({ id: 'off', enabled: false, disabledReason: 'Nothing changed', index: 1 })
  })

  it('hides disabled commands unless asked', () => {
    registry.register([cmd('a'), cmd('b', { enabled: false })])
    const p = make()
    p.open()
    expect(ids(p)).toEqual(['a'])
  })

  it('groups: recents first, then the declared groups, ungrouped first', async () => {
    registry.register([
      cmd('v', { group: 'view', run: () => {} }),
      cmd('f', { group: 'file', run: () => {} }),
      cmd('u', { run: () => {} }),
    ])
    await registry.run('v')
    const p = make()
    p.open()
    expect(p.groups().map((g) => [g.id, g.title, g.items.map((i) => i.id)])).toEqual([
      ['$recent', 'Recent', ['v']],
      [undefined, undefined, ['u']],
      ['file', 'File', ['f']],
    ])
    expect(p.results().map((r) => r.index)).toEqual([0, 1, 2])
  })

  it('emptyQuery "groups" keeps recents in their groups, "all" is one flat list in registration order', async () => {
    registry.register([cmd('v', { group: 'view', run: () => {} }), cmd('f', { group: 'file' }), cmd('u')])
    await registry.run('v')
    const groups = make({ emptyQuery: 'groups' })
    groups.open()
    expect(groups.groups().map((g) => [g.id, g.items.map((i) => i.id)])).toEqual([[undefined, ['u']], ['file', ['f']], ['view', ['v']]])
    groups.close()
    const all = make({ emptyQuery: 'all' })
    all.open()
    expect(all.groups()).toHaveLength(1)
    expect(ids(all)).toEqual(['v', 'f', 'u'])
  })

  it('a typed query keeps the ranking and groups the rows by first appearance', () => {
    registry.register([cmd('a', { title: 'Zoom Out', group: 'view' }), cmd('b', { title: 'Zoom Save', group: 'file' }), cmd('c', { title: 'Zoom In', group: 'view' })])
    const p = make()
    p.open()
    p.setQuery('zoom')
    expect(p.groups().map((g) => g.id)).toEqual(['view', 'file'])
    expect(p.groups()[0]!.items.map((i) => i.id)).toEqual(['c', 'a'])
  })

  it('a custom filter replaces the matching and lists in registration order', () => {
    registry.register([cmd('x1', { title: 'One' }), cmd('x2', { title: 'Two' }), cmd('y', { title: 'Three' })])
    const p = make({ filter: (command, query) => command.id.startsWith(query) })
    p.open()
    p.setQuery('x')
    expect(ids(p)).toEqual(['x1', 'x2'])
    expect(p.results()[0]!.ranges).toEqual([])
  })

  it('follows the registry: a command added or removed while open appears and goes', () => {
    const p = make()
    p.open()
    expect(ids(p)).toEqual([])
    const off = registry.register(cmd('late'))
    expect(ids(p)).toEqual(['late'])
    off()
    expect(ids(p)).toEqual([])
  })
})

describe('active row and movement', () => {
  const list = (): Palette => {
    registry.register([cmd('a', { group: 'file' }), cmd('b', { group: 'file' }), cmd('c', { group: 'view' }), cmd('d', { group: 'view' })])
    const p = make()
    p.open()

    return p
  }

  it('the first row is active, and stays on the first row when the query changes', () => {
    const p = list()
    expect(p.activeId()).toBe('a')
    p.move(1)
    expect(p.activeId()).toBe('b')
    p.setQuery('d')
    expect(p.activeId()).toBe('d')
  })

  it('wraps at both ends, and jumps with first, last, and by group', () => {
    const p = list()
    p.move(-1)
    expect(p.activeId()).toBe('d')
    p.move(1)
    expect(p.activeId()).toBe('a')
    p.move('last')
    expect(p.activeId()).toBe('d')
    p.move('first')
    expect(p.activeId()).toBe('a')
    p.move('nextGroup')
    expect(p.activeId()).toBe('c')
    p.move('nextGroup')
    expect(p.activeId()).toBe('a')
    p.move('prevGroup')
    expect(p.activeId()).toBe('c')
    p.move(3)
    expect(p.activeId()).toBe('b')
  })

  it('moves nothing in an empty list, and the active id is null', () => {
    const p = make()
    p.open()
    p.move(1)
    expect(p.activeId()).toBeNull()
  })

  it('when the active command is unregistered the first row becomes active', () => {
    const off = registry.register(cmd('gone'))
    registry.register(cmd('stay'))
    const p = make()
    p.open()
    p.setActive('gone')
    off()
    expect(p.activeId()).toBe('stay')
  })
})

describe('pages', () => {
  const themes = (): Palette => {
    registry.register(cmd('theme', { title: 'Change theme…', children: [cmd('light', { run: () => {} }), cmd('more', { title: 'More…', children: [cmd('deep', { title: 'Deep', children: [cmd('deepest', { run: () => {} })] })] })] }))
    const p = make()
    p.open()

    return p
  }

  it('Enter on a command with children opens its page, with an empty query; back returns and restores the query', async () => {
    const p = themes()
    p.setQuery('theme')
    await p.runActive()
    expect(p.page()).toEqual(['theme'])
    expect(p.query()).toBe('')
    expect(ids(p)).toEqual(['light', 'more'])
    expect(p.back()).toBe(true)
    expect(p.query()).toBe('theme')
    expect(p.page()).toEqual([])
  })

  it('goes three pages deep and back, and back on the root does nothing', async () => {
    const p = themes()
    await p.runActive()
    p.setActive('more')
    await p.runActive()
    p.setActive('deep')
    await p.runActive()
    expect(p.page()).toEqual(['theme', 'more', 'deep'])
    expect(ids(p)).toEqual(['deepest'])
    expect(p.back()).toBe(true)
    expect(p.back()).toBe(true)
    expect(p.back()).toBe(true)
    expect(p.back()).toBe(false)
    expect(p.page()).toEqual([])
    expect(p.isOpen()).toBe(true)
  })

  it('when the page a source row opened is below a page that is unregistered, both go', async () => {
    const off = registry.register(cmd('s', { children: () => [cmd('r', { title: 'Row', children: [cmd('inner')] })] }))
    registry.register(cmd('other'))
    const p = make({ debounce: 0 })
    p.open('s')
    p.setActive('r')
    await p.runActive()
    expect(p.page()).toEqual(['s', 'r'])
    off()
    expect(p.page()).toEqual([])
    expect(ids(p)).toEqual(['other'])
  })

  it('a page whose command is unregistered while it is open closes itself back to the root', async () => {
    const off = registry.register(cmd('theme', { children: [cmd('light')] }))
    registry.register(cmd('other'))
    const p = make()
    p.open('theme')
    off()
    expect(p.page()).toEqual([])
    expect(ids(p)).toEqual(['other'])
  })
})

describe('running', () => {
  it('runs the active command with the palette as the source, then closes', async () => {
    const run = vi.fn()
    registry.register(cmd('go', { run }))
    const p = make()
    p.open()
    p.setQuery('go')
    await p.runActive()
    expect(run.mock.calls[0]![0]).toMatchObject({ id: 'go', source: 'palette', query: 'go' })
    expect(p.isOpen()).toBe(false)
  })

  it('keepOpen leaves it open', async () => {
    registry.register(cmd('toggle', { keepOpen: true, run: () => {} }))
    const p = make()
    p.open()
    await p.runActive()
    expect(p.isOpen()).toBe(true)
  })

  it('a pending async run shows the loading state and closes when it succeeds', async () => {
    let finish!: () => void
    registry.register(cmd('slow', { run: () => new Promise<void>((r) => (finish = r)) }))
    const p = make()
    p.open()
    const done = p.runActive()
    expect(p.status()).toBe('loading')
    expect(p.running()).toBe('slow')
    finish()
    await done
    expect(p.isOpen()).toBe(false)
    expect(p.status()).toBe('idle')
    expect(p.running()).toBeNull()
  })

  it('a run that throws leaves the palette open with the error, announced; typing clears it', async () => {
    registry.register(cmd('boom', { run: () => { throw new Error('disk full') } }))
    const p = make()
    p.open()
    await p.runActive()
    expect(p.isOpen()).toBe(true)
    expect(p.status()).toBe('error')
    expect((p.error() as Error).message).toBe('disk full')
    expect(p.announcement()).toBe('Failed: disk full')
    p.setQuery('b')
    expect(p.status()).toBe('idle')
  })

  it('closing during an async run aborts its signal and nothing is written afterwards', async () => {
    let signal!: AbortSignal
    let finish!: () => void
    registry.register(cmd('slow', { run: (ctx) => new Promise<void>((r) => { signal = ctx.signal; finish = r }) }))
    const p = make()
    p.open()
    const done = p.runActive()
    p.close()
    expect(signal.aborted).toBe(true)
    expect(p.running()).toBeNull()
    p.open()
    finish()
    await done
    expect(p.isOpen()).toBe(true)
    expect(p.running()).toBeNull()
  })

  it('a run that never settles does not block the next session', async () => {
    registry.register([cmd('hang', { run: () => new Promise<void>(() => {}) }), cmd('ok', { run: () => {} })])
    const p = make()
    p.open()
    void p.runActive()
    expect(p.running()).toBe('hang')
    p.close()
    p.open()
    p.setActive('ok')
    await p.runActive()
    expect(p.isOpen()).toBe(false)
  })

  it('ignores a second Enter while a command runs, and does not run a disabled command', async () => {
    let calls = 0
    registry.register([cmd('slow', { run: () => { calls++; return new Promise<void>(() => {}) } }), cmd('off', { enabled: false, run: () => { calls += 100 } })])
    const p = make({ showDisabled: true })
    p.open()
    void p.runActive()
    void p.runActive()
    expect(calls).toBe(1)
    p.setActive('off')
    await p.runActive()
    expect(calls).toBe(1)
  })
})

describe('a run that outlives its session', () => {
  it('a rejection that arrives after the palette was closed and reopened does not show up in the new session', async () => {
    let fail!: (e: Error) => void
    registry.register(cmd('slow', { run: () => new Promise<void>((_, reject) => (fail = reject)) }))
    const p = make()
    p.open()
    const done = p.runActive()
    p.close()
    p.open()
    fail(new Error('late'))
    await done
    expect(p.error()).toBeUndefined()
    expect(p.status()).toBe('idle')
  })

  it('the old run settling does not clear the pending state of the new one', async () => {
    const finish: (() => void)[] = []
    registry.register(cmd('slow', { run: () => new Promise<void>((r) => finish.push(r)) }))
    const p = make()
    p.open()
    const first = p.runActive()
    p.close()
    p.open()
    const second = p.runActive()
    expect(p.running()).toBe('slow')
    finish[0]!()
    await first
    expect(p.running()).toBe('slow')
    finish[1]!()
    await second
    expect(p.running()).toBeNull()
  })

  it('a disabled row is ignored quietly: no run, no error state', async () => {
    registry.register(cmd('off', { enabled: false, disabledReason: 'Nope', run: () => {} }))
    const p = make({ showDisabled: true })
    p.open()
    await p.runActive()
    expect(p.status()).toBe('idle')
    expect(p.error()).toBeUndefined()
    expect(p.isOpen()).toBe(true)
  })
})

describe('announcements', () => {
  it('says nothing for an empty query at the root, then the count, "No results", and why a disabled command cannot run', () => {
    registry.register([cmd('a'), cmd('b'), cmd('c', { enabled: false, disabledReason: 'Read only' })])
    const p = make({ showDisabled: true })
    expect(p.announcement()).toBe('')
    p.open()
    expect(p.announcement()).toBe('')
    p.setQuery('a')
    expect(p.announcement()).toBe('1 result')
    p.setQuery('zzz')
    expect(p.announcement()).toBe('No results')
    p.setQuery('c')
    expect(p.announcement()).toBe('c, unavailable: Read only')
  })

  it('uses the messages it is given', () => {
    registry.register([cmd('a'), cmd('b')])
    const p = make({ messages: { results: (n) => `${n} výsledků`, noResults: 'Nic' } })
    p.open()
    p.setQuery('a')
    expect(p.announcement()).toBe('1 výsledků')
    p.setQuery('q')
    expect(p.announcement()).toBe('Nic')
  })
})

describe('the hotkey', () => {
  it('toggles the palette through @pyreon/hotkeys, once, and removes it on dispose', () => {
    const p = createPalette({ commands: registry })
    expect(getRegisteredHotkeys().map((h) => h.shortcut)).toEqual(['mod+k'])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
    expect(p.isOpen()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
    expect(p.isOpen()).toBe(false)
    p.dispose()
    expect(getRegisteredHotkeys()).toHaveLength(0)
  })

  it('hotkey false registers none, a custom one replaces it, and a palette created in a component goes with it', () => {
    make({ hotkey: false })
    expect(getRegisteredHotkeys()).toHaveLength(0)
    const scope = effectScope()
    scope.runInScope(() => createPalette({ commands: registry, hotkey: 'ctrl+j' }))
    expect(getRegisteredHotkeys().map((h) => h.shortcut)).toEqual(['ctrl+j'])
    scope.stop()
    expect(getRegisteredHotkeys()).toHaveLength(0)
  })
})

describe('async sources', () => {
  const deferred = <T,>(): { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void } => {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((a, b) => {
      resolve = a
      reject = b
    })

    return { promise, resolve, reject }
  }

  it('debounces: only the last query of a burst is asked', async () => {
    vi.useFakeTimers()
    const asked: string[] = []
    registry.register(cmd('customers', { title: 'Search customers…', children: (q) => { asked.push(q); return [cmd(`c-${q}`, { title: `Customer ${q}` })] } }))
    const p = make({ debounce: 100 })
    p.open('customers')
    expect(asked).toEqual([''])
    p.setQuery('a')
    p.setQuery('ac')
    p.setQuery('acm')
    expect(asked).toEqual([''])
    await vi.advanceTimersByTimeAsync(99)
    expect(asked).toEqual([''])
    await vi.advanceTimersByTimeAsync(2)
    expect(asked).toEqual(['', 'acm'])
    expect(ids(p)).toEqual(['c-acm'])
  })

  it('latest wins: a slow earlier answer never overwrites a newer one (out-of-order resolution)', async () => {
    const waiting = new Map<string, ReturnType<typeof deferred<Command[]>>>()
    registry.register(cmd('s', { children: (q) => { const d = deferred<Command[]>(); waiting.set(q, d); return d.promise } }))
    const p = make({ debounce: 0 })
    p.open('s')
    p.setQuery('a')
    p.setQuery('ab')
    expect([...waiting.keys()]).toEqual(['', 'a', 'ab'])
    waiting.get('ab')!.resolve([cmd('ab-result')])
    await Promise.resolve()
    expect(ids(p)).toEqual(['ab-result'])
    waiting.get('a')!.resolve([cmd('a-result')])
    waiting.get('')!.resolve([cmd('empty-result')])
    await Promise.resolve()
    await Promise.resolve()
    expect(ids(p)).toEqual(['ab-result'])
    expect(p.status()).toBe('idle')
  })

  it('aborts the superseded request through its signal, and every pending one on close', async () => {
    const signals: AbortSignal[] = []
    registry.register(cmd('s', { children: (_q, signal) => { signals.push(signal); return new Promise<Command[]>(() => {}) } }))
    const p = make({ debounce: 0 })
    p.open('s')
    p.setQuery('a')
    expect(signals.map((s) => s.aborted)).toEqual([true, false])
    p.close()
    expect(signals.map((s) => s.aborted)).toEqual([true, true])
  })

  it('shows loading, keeps the previous rows while a newer request is pending (no flicker), and then replaces them', async () => {
    const first = deferred<Command[]>()
    const second = deferred<Command[]>()
    const answers = [first, second]
    registry.register(cmd('s', { children: () => answers.shift()!.promise }))
    const p = make({ debounce: 0 })
    p.open('s')
    expect(p.status()).toBe('loading')
    expect(p.announcement()).toBe('Loading…')
    first.resolve([cmd('one')])
    await Promise.resolve()
    expect(ids(p)).toEqual(['one'])
    p.setQuery('x')
    expect(p.status()).toBe('loading')
    expect(ids(p)).toEqual(['one'])
    second.resolve([cmd('two')])
    await Promise.resolve()
    expect(ids(p)).toEqual(['two'])
    expect(p.status()).toBe('idle')
  })

  it('an error is exposed and announced, the rows stay, and the next query recovers', async () => {
    const answers: (() => Promise<Command[]>)[] = [() => Promise.resolve([cmd('ok')]), () => Promise.reject(new Error('offline')), () => Promise.resolve([cmd('back')])]
    registry.register(cmd('s', { children: () => answers.shift()!() }))
    const p = make({ debounce: 0 })
    p.open('s')
    await Promise.resolve()
    p.setQuery('x')
    await Promise.resolve()
    await Promise.resolve()
    expect(p.status()).toBe('error')
    expect(p.announcement()).toBe('Failed: offline')
    expect(ids(p)).toEqual(['ok'])
    p.setQuery('xy')
    await Promise.resolve()
    await Promise.resolve()
    expect(p.status()).toBe('idle')
    expect(ids(p)).toEqual(['back'])
  })

  it('a synchronous source answers at once, and one that throws or returns a non-array is an error', async () => {
    registry.register([cmd('sync', { children: (q) => [cmd(`r-${q}`)] }), cmd('bad', { children: (() => 'nope') as never }), cmd('throws', { children: () => { throw new Error('x') } })])
    const p = make({ debounce: 0 })
    p.open('sync')
    expect(ids(p)).toEqual(['r-'])
    p.close()
    p.open('bad')
    expect(p.status()).toBe('error')
    expect(String((p.error() as Error).message)).toContain('must return an array')
    p.close()
    p.open('throws')
    expect(p.status()).toBe('error')
  })

  it('rows with the same id are listed once, so option ids stay unique', async () => {
    registry.register(cmd('s', { children: () => [cmd('same', { title: 'First' }), cmd('same', { title: 'Second' }), cmd('other')] }))
    const p = make({ debounce: 0 })
    p.open('s')
    expect(p.results().map((r) => [r.id, r.title, r.index])).toEqual([['same', 'First', 0], ['other', 'other', 1]])
  })

  it('rows from a source can be run, and can open a page of their own', async () => {
    const run = vi.fn()
    registry.register(cmd('s', { children: () => [cmd('r1', { run }), cmd('r2', { children: [cmd('inner', { run })] })] }))
    const p = make({ debounce: 0 })
    p.open('s')
    p.setActive('r2')
    await p.runActive()
    expect(p.page()).toEqual(['s', 'r2'])
    expect(ids(p)).toEqual(['inner'])
    p.back()
    p.setActive('r1')
    await p.runActive()
    expect(run).toHaveBeenCalledOnce()
  })

  it('highlights the query inside the titles the source returned', async () => {
    registry.register(cmd('s', { children: () => [cmd('c1', { title: 'Acme Corp' })] }))
    const p = make({ debounce: 0 })
    p.open('s')
    p.setQuery('acm')
    await Promise.resolve()
    expect(p.results()[0]!.ranges).toEqual([[0, 3]])
  })
})

describe('inline async sources (searched from the root while typing)', () => {
  const deferred = <T,>(): { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void } => {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((a, b) => {
      resolve = a
      reject = b
    })

    return { promise, resolve, reject }
  }
  const customers = (children: NonNullable<Command['children']>, extra?: Partial<Command>): Command => cmd('customers', { title: 'Customers', inline: true, children, ...extra })

  it('the matching commands are listed at once and stay while the source loads; its rows follow under its title', async () => {
    const d = deferred<Command[]>()
    registry.register([cmd('acme-settings', { title: 'Acme settings' }), customers(() => d.promise)])
    const p = make({ debounce: 0 })
    p.open()
    p.setQuery('acme')
    expect(ids(p)).toEqual(['acme-settings'])
    expect(p.status()).toBe('loading')
    expect(p.announcement()).toBe('1 result')
    d.resolve([cmd('c1', { title: 'Acme Corp' }), cmd('c2', { title: 'Acme Ltd' })])
    await Promise.resolve()
    expect(ids(p)).toEqual(['acme-settings', 'c1', 'c2'])
    expect(p.groups().map((g) => [g.id, g.title, g.items.length])).toEqual([[undefined, undefined, 1], ['$source:customers', 'Customers', 2]])
    expect(p.status()).toBe('idle')
    expect(p.results()[1]!.ranges).toEqual([[0, 4]])
    expect(p.announcement()).toBe('3 results')
  })

  it('a source is only searched from the root when it asks for it, is enabled, and the query is not empty', () => {
    const asked: string[] = []
    registry.register([
      customers((q) => { asked.push(`inline:${q}`); return [] }),
      cmd('page-only', { children: (q) => { asked.push(`page:${q}`); return [] } }),
      cmd('off', { inline: true, enabled: false, children: (q) => { asked.push(`off:${q}`); return [] } }),
    ])
    const p = make({ debounce: 0 })
    p.open()
    expect(asked).toEqual([])
    p.setQuery('a')
    expect(asked).toEqual(['inline:a'])
  })

  it('the first request is immediate, the next ones debounced; latest wins out of order', async () => {
    vi.useFakeTimers()
    const waiting = new Map<string, ReturnType<typeof deferred<Command[]>>>()
    registry.register(customers((q) => { const d = deferred<Command[]>(); waiting.set(q, d); return d.promise }))
    const p = make({ debounce: 100 })
    p.open()
    p.setQuery('a')
    expect([...waiting.keys()]).toEqual(['a'])
    p.setQuery('ab')
    p.setQuery('abc')
    expect([...waiting.keys()]).toEqual(['a'])
    await vi.advanceTimersByTimeAsync(101)
    expect([...waiting.keys()]).toEqual(['a', 'abc'])
    waiting.get('abc')!.resolve([cmd('new', { title: 'abc newest' })])
    await vi.advanceTimersByTimeAsync(0)
    waiting.get('a')!.resolve([cmd('old', { title: 'a stale' })])
    await vi.advanceTimersByTimeAsync(0)
    expect(ids(p)).toEqual(['new'])
  })

  it('closing, going into a page and clearing the query abort the request and drop the rows', async () => {
    const signals: AbortSignal[] = []
    registry.register([customers((_q, signal) => { signals.push(signal); return Promise.resolve([cmd('r', { title: 'row' })]) }), cmd('theme', { children: [cmd('dark')] })])
    const p = make({ debounce: 0 })
    p.open()
    p.setQuery('r')
    await Promise.resolve()
    expect(ids(p)).toContain('r')
    p.setQuery('')
    expect(p.results().some((r) => r.id === 'r')).toBe(false)
    expect(signals.at(-1)!.aborted).toBe(true)
    p.setQuery('ro')
    await Promise.resolve()
    expect(ids(p)).toContain('r')
    p.close()
    expect(p.results()).toEqual([])
    expect(signals.at(-1)!.aborted).toBe(true)
    p.open()
    p.setQuery('row')
    await Promise.resolve()
    p.open('theme')
    expect(ids(p)).toEqual(['dark'])
  })

  it('a source whose command is unregistered, or disabled, while the palette is open is aborted and forgotten', () => {
    const signals: AbortSignal[] = []
    const off = registry.register(customers((_q, signal) => { signals.push(signal); return new Promise<Command[]>(() => {}) }))
    registry.register(cmd('x'))
    const p = make({ debounce: 0 })
    p.open()
    p.setQuery('x')
    expect(signals.map((s) => s.aborted)).toEqual([false])
    off()
    expect(signals[0]!.aborted).toBe(true)
    expect(p.status()).toBe('idle')
  })

  it('an error from the source is announced and exposed, the commands stay, and rows already listed are not repeated', async () => {
    registry.register([cmd('shared', { title: 'Shared item' }), customers(() => Promise.reject(new Error('offline')))])
    const p = make({ debounce: 0 })
    p.open()
    p.setQuery('shared')
    await Promise.resolve()
    await Promise.resolve()
    expect(p.status()).toBe('error')
    expect(p.announcement()).toBe('Failed: offline')
    expect(ids(p)).toEqual(['shared'])
    registry.dispose()
    registry = createCommands()
    registry.register([cmd('dup', { title: 'Dup' }), customers(() => [cmd('dup', { title: 'Dup again' }), cmd('fresh', { title: 'Dup fresh' })])])
    const q = make({ debounce: 0 })
    q.open()
    q.setQuery('dup')
    expect(ids(q)).toEqual(['dup', 'fresh'])
  })
})

describe('title functions', () => {
  it('follow the locale: switching re-ranks and re-renders the rows', () => {
    const locale = signal<'en' | 'cs'>('en')
    registry.register(cmd('open', { title: () => (locale() === 'en' ? 'Open file' : 'Otevřít soubor') }))
    const p = make()
    p.open()
    p.setQuery('otevrit')
    expect(ids(p)).toEqual([])
    locale.set('cs')
    expect(p.results()[0]!.title).toBe('Otevřít soubor')
    expect(p.results()[0]!.ranges).toEqual([[0, 7]])
  })
})

describe('cleanup', () => {
  it('closing drops the debounce timer and aborts the pending request; nothing is left running', () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    registry.register(cmd('s', { children: (_q, signal) => { signals.push(signal); return new Promise<Command[]>(() => {}) } }))
    const p = make({ debounce: 100 })
    p.open('s')
    p.setQuery('a')
    expect(vi.getTimerCount()).toBe(1)
    p.close()
    expect(vi.getTimerCount()).toBe(0)
    expect(signals.every((s) => s.aborted)).toBe(true)
  })

  it('dispose stops the palette reacting to the registry, and a disposed palette cannot be opened', () => {
    const tick = signal(0)
    let reads = 0
    registry.register(cmd('x', { title: () => { reads++; return `x${tick()}` } }))
    const p = make()
    p.open()
    const before = reads
    tick.set(1)
    expect(reads).toBeGreaterThan(before)
    p.dispose()
    const after = reads
    tick.set(2)
    tick.set(3)
    expect(reads).toBe(after)
    p.open()
    expect(p.isOpen()).toBe(false)
  })

  it('a thousand open, type and close cycles leave no timer, no hotkey, and no open palette', () => {
    vi.useFakeTimers()
    registry.register(cmd('s', { children: () => new Promise<Command[]>(() => {}) }))
    const p = createPalette({ commands: registry, debounce: 50 })
    palettes.push(p)
    for (let i = 0; i < 1000; i++) {
      p.open('s')
      p.setQuery(`q${i}`)
      p.close()
    }
    expect(vi.getTimerCount()).toBe(0)
    expect(p.isOpen()).toBe(false)
    p.dispose()
    expect(getRegisteredHotkeys()).toHaveLength(0)
  })
})
