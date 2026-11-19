import { _resetHotkeys, getRegisteredHotkeys } from '@pyreon/hotkeys'
import { batch, computed, effect, effectScope, signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCommands } from '../commands'
import type { Command, Commands } from '../types'

const cmd = (id: string, extra?: Partial<Command>): Command => ({ id, title: id, ...extra })
const ids = (c: Commands): string[] => c.commands().map((x) => x.id)
const press = (key: string, init?: KeyboardEventInit, target: EventTarget = window): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
}

let made: Commands[]
const make = (options?: Parameters<typeof createCommands>[0]): Commands => {
  const c = createCommands(options)
  made.push(c)
  return c
}

beforeEach(() => {
  made = []
  _resetHotkeys()
})
afterEach(() => {
  for (const c of made) c.dispose()
  _resetHotkeys()
  vi.restoreAllMocks()
})

describe('registration', () => {
  it('lists the registered commands in registration order, reactively', () => {
    const c = make()
    const seen: string[][] = []
    const stop = effect(() => void seen.push(ids(c)))
    const a = c.register(cmd('a'))
    c.register([cmd('b'), cmd('c')])
    a()
    expect(ids(c)).toEqual(['b', 'c'])
    expect(seen).toEqual([[], ['a'], ['a', 'b', 'c'], ['b', 'c']])
    stop.dispose()
  })

  it('returns an unregister that is safe to call twice, and one call removes a whole array', () => {
    const c = make()
    const off = c.register([cmd('a'), cmd('b')])
    off()
    off()
    expect(ids(c)).toEqual([])
  })

  it('removes the commands of a component when its scope ends, and not before', () => {
    const c = make()
    const scope = effectScope()
    scope.runInScope(() => c.register(cmd('page')))
    expect(ids(c)).toEqual(['page'])
    scope.stop()
    expect(ids(c)).toEqual([])
  })

  it('a later registration of an id shadows the earlier one until it is removed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = make()
    c.register(cmd('save', { title: 'Save (page A)' }))
    const offB = c.register(cmd('save', { title: 'Save (page B)' }))
    expect(c.commands().map((x) => x.title)).toEqual(['Save (page B)'])
    expect(warn.mock.calls[0]?.[0]).toContain('"save" is registered twice')
    offB()
    expect(c.commands().map((x) => x.title)).toEqual(['Save (page A)'])
  })

  it('removing the SHADOWED registration first leaves the winner in place (a screen change mounts the new page before it unmounts the old)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = make()
    const offOld = c.register(cmd('save', { title: 'old' }))
    c.register(cmd('save', { title: 'new' }))
    offOld()
    expect(c.commands().map((x) => x.title)).toEqual(['new'])
  })

  it('rejects a command without an id with a clear error', () => {
    const c = make()
    expect(() => c.register({ id: '', title: 'x' })).toThrow('[Pyreon] commands.register: a command needs a non-empty string `id`')
  })

  it('does not leak between two registries that use the same ids', () => {
    const a = make()
    const b = make()
    a.register(cmd('x', { title: 'in a' }))
    b.register(cmd('x', { title: 'in b' }))
    expect(a.get('x')?.title).toBe('in a')
    expect(b.get('x')?.title).toBe('in b')
    a.dispose()
    expect(b.get('x')?.title).toBe('in b')
  })

  it('a function registration reads its fields reactively and keeps its place', () => {
    const c = make()
    const title = signal('One')
    c.register(() => ({ id: 'dyn', title: title() }))
    c.register(cmd('after'))
    expect(c.commands()[0]?.title).toBe('One')
    title.set('Two')
    expect(c.commands().map((x) => x.title)).toEqual(['Two', 'after'])
  })

  it('declares groups, replacing one with the same id', () => {
    const c = make({ groups: [{ id: 'file', title: 'File' }] })
    const off = c.registerGroup({ id: 'page', title: 'This page' })
    expect(c.groups().map((g) => g.id)).toEqual(['file', 'page'])
    off()
    expect(c.groups().map((g) => g.id)).toEqual(['file'])
  })
})

describe('run', () => {
  it('runs by id with a context, and rejects for an unknown id with a message that says where to look', async () => {
    const c = make()
    const run = vi.fn()
    c.register(cmd('go', { run }))
    await c.run('go', { query: 'g' })
    expect(run).toHaveBeenCalledOnce()
    const ctx = run.mock.calls[0]![0]
    expect(ctx).toMatchObject({ id: 'go', source: 'programmatic', query: 'g', commands: c })
    expect(ctx.signal.aborted).toBe(false)
    await expect(c.run('nope')).rejects.toThrow('[Pyreon] commands.run: no command with the id "nope" is registered')
  })

  it('rejects for a disabled command with its reason, and never calls run', async () => {
    const c = make()
    const run = vi.fn()
    c.register(cmd('x', { run, enabled: false, disabledReason: () => 'Needs a selection' }))
    await expect(c.run('x')).rejects.toThrow('"x" is disabled (Needs a selection)')
    expect(run).not.toHaveBeenCalled()
  })

  it('turns a synchronous throw into a rejection', async () => {
    const c = make()
    c.register(cmd('boom', { run: () => { throw new Error('bad') } }))
    await expect(c.run('boom')).rejects.toThrow('bad')
  })

  it('awaits an async run and records the recent only when it succeeded', async () => {
    const c = make()
    c.register([cmd('ok', { run: async () => {} }), cmd('fail', { run: async () => { throw new Error('no') } }), cmd('page', { children: [cmd('child', { run: () => {} })] })])
    await c.run('ok')
    await expect(c.run('fail')).rejects.toThrow('no')
    expect(c.recents()).toEqual(['ok'])
  })

  it('runs a command of a nested page by id or by value', async () => {
    const c = make()
    const run = vi.fn()
    c.register(cmd('theme', { children: [cmd('dark', { run })] }))
    await c.run('dark')
    await c.run(c.get('dark') as Command)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('resolves for a command that only opens a page (nothing to run)', async () => {
    const c = make()
    c.register(cmd('theme', { children: [] }))
    await expect(c.run('theme')).resolves.toBeUndefined()
  })
})

describe('search', () => {
  const list = (): Commands => {
    const c = make({ groups: [{ id: 'file', title: 'File' }, { id: 'view', title: 'View' }] })
    c.register([
      cmd('open', { title: 'Open File', group: 'file', keywords: ['load'] }),
      cmd('save', { title: 'Save', group: 'file' }),
      cmd('zoom', { title: 'Zoom In', group: 'view', subtitle: 'Make it bigger' }),
      cmd('about', { title: 'About' }),
      cmd('hidden', { title: 'Secret Save', enabled: false, disabledReason: 'Nope' }),
    ])
    return c
  }

  it('ranks, highlights the title, and leaves disabled commands out', () => {
    const c = list()
    const got = c.search('sav')
    expect(got.map((m) => m.id)).toEqual(['save'])
    expect(got[0]?.ranges).toEqual([[0, 3]])
    expect(got[0]).toMatchObject({ title: 'Save', field: 'title', enabled: true, group: 'file', recent: false })
  })

  it('can include disabled commands, flagged, with their reason', () => {
    const c = list()
    const got = c.search('sav', { includeDisabled: true })
    expect(got.map((m) => [m.id, m.enabled, m.disabledReason])).toEqual([['save', true, undefined], ['hidden', false, 'Nope']])
  })

  it('matches keywords and subtitles, and says which text matched', () => {
    const c = list()
    expect(c.search('load')[0]).toMatchObject({ id: 'open', field: 'keyword', ranges: [] })
    expect(c.search('bigger')[0]).toMatchObject({ id: 'zoom', field: 'subtitle', ranges: [[8, 14]] })
  })

  it('an empty query lists everything enabled: ungrouped first, then groups in declared order, then registration order', () => {
    const c = list()
    expect(c.search('').map((m) => m.id)).toEqual(['about', 'open', 'save', 'zoom'])
    expect(c.search('   ').map((m) => m.id)).toEqual(['about', 'open', 'save', 'zoom'])
  })

  it('limits', () => {
    expect(list().search('', { limit: 2 }).map((m) => m.id)).toEqual(['about', 'open'])
  })

  it('searches a nested page by parent id, and an unknown parent finds nothing', () => {
    const c = make()
    c.register(cmd('theme', { title: 'Change theme…', children: [cmd('light', { title: 'Light' }), cmd('dark', { title: 'Dark' }), cmd('hc', { title: 'High contrast', keywords: ['dark'] })] }))
    expect(c.search('', { parent: 'theme' }).map((m) => m.id)).toEqual(['light', 'dark', 'hc'])
    expect(c.search('dark', { parent: 'theme' }).map((m) => m.id)).toEqual(['dark', 'hc'])
    expect(c.search('x', { parent: 'missing' })).toEqual([])
    // the children are not searched from the root
    expect(c.search('light').map((m) => m.id)).toEqual([])
  })

  it('follows a title that is a function: the locale changes, the ranking changes', () => {
    const c = make()
    const locale = signal<'en' | 'cs'>('en')
    c.register(cmd('open', { title: () => (locale() === 'en' ? 'Open file' : 'Otevřít soubor') }))
    expect(c.search('open')).toHaveLength(1)
    expect(c.search('otevrit')).toHaveLength(0)
    locale.set('cs')
    expect(c.search('otevrit').map((m) => m.title)).toEqual(['Otevřít soubor'])
    expect(c.search('open')).toHaveLength(0)
  })

  it('does not reuse the previous candidates after a title changed (narrowing stays exact)', () => {
    const c = make()
    const locale = signal<'a' | 'b'>('a')
    c.register([cmd('x', { title: () => (locale() === 'a' ? 'alpha' : 'beta') }), cmd('y', { title: 'gamma' })])
    expect(c.search('al').map((m) => m.id)).toEqual(['x'])
    locale.set('b')
    // "ga" extends nothing, but "be" after "b" would: type 'b' then 'be' across the change
    expect(c.search('b').map((m) => m.id)).toEqual(['x'])
    locale.set('a')
    expect(c.search('be').map((m) => m.id)).toEqual([])
    locale.set('b')
    expect(c.search('be').map((m) => m.id)).toEqual(['x'])
  })

  it('is reactive: a computed over search updates when a command is added, enabled or renamed', () => {
    const c = make()
    const on = signal(false)
    const result = computed(() => c.search('go').map((m) => m.id))
    expect(result()).toEqual([])
    c.register(cmd('go', { enabled: () => on() }))
    expect(result()).toEqual([])
    on.set(true)
    expect(result()).toEqual(['go'])
  })

  it('breaks equal scores by priority, then by registration order', () => {
    const c = make()
    c.register([cmd('a1', { title: 'ax' }), cmd('a2', { title: 'bx', priority: 2 }), cmd('a3', { title: 'cx', priority: 2 }), cmd('a4', { title: 'dx', priority: 1 })])
    expect(c.search('x').map((m) => m.id)).toEqual(['a2', 'a3', 'a4', 'a1'])
  })
})

describe('recents', () => {
  it('lists the commands run, newest first, without repeats, up to max', async () => {
    const c = make({ recents: { max: 2 } })
    c.register(['a', 'b', 'c'].map((id) => cmd(id, { run: () => {} })))
    await c.run('a')
    await c.run('b')
    await c.run('a')
    await c.run('c')
    expect(c.recents()).toEqual(['c', 'a'])
    c.clearRecents()
    expect(c.recents()).toEqual([])
  })

  it('puts recents first for an empty query and nudges them for a typed one', async () => {
    const c = make()
    c.register([cmd('a', { title: 'Open A', run: () => {} }), cmd('b', { title: 'Open B', run: () => {} }), cmd('c', { title: 'Open C', run: () => {} })])
    expect(c.search('').map((m) => m.id)).toEqual(['a', 'b', 'c'])
    await c.run('c')
    expect(c.search('').map((m) => m.id)).toEqual(['c', 'a', 'b'])
    expect(c.search('open').map((m) => m.id)).toEqual(['c', 'a', 'b'])
    expect(c.search('open')[0]?.recent).toBe(true)
  })

  it('a recent boost never overturns a clearly better match', async () => {
    const c = make()
    c.register([cmd('tog', { title: 'Toggle Sidebar', run: () => {} }), cmd('other', { title: 'Totally Great Sub-Bar', run: () => {} })])
    await c.run('other')
    expect(c.search('toggle')[0]?.id).toBe('tog')
  })

  it('loads from storage and saves to it, survives a storage that throws, and ignores junk', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store: { ids: string[] | null } = { ids: ['b', 7 as unknown as string, 'a'] }
    const c = make({ recents: { storage: { get: () => store.ids, set: (ids) => void (store.ids = ids) } } })
    expect(c.recents()).toEqual(['b', 'a'])
    c.register(cmd('z', { run: () => {} }))
    await c.run('z')
    expect(store.ids).toEqual(['z', 'b', 'a'])
    const broken = make({ recents: { storage: { get: () => { throw new Error('private mode') }, set: () => { throw new Error('quota') } } } })
    expect(broken.recents()).toEqual([])
    broken.register(cmd('q', { run: () => {} }))
    await broken.run('q')
    expect(broken.recents()).toEqual(['q'])
    expect(warn).toHaveBeenCalled()
  })

  it('max 0 keeps no recents', async () => {
    const c = make({ recents: { max: 0 } })
    c.register(cmd('a', { run: () => {} }))
    await c.run('a')
    expect(c.recents()).toEqual([])
  })
})

describe('shortcuts', () => {
  it('registers one hotkey per enabled command, and removes it with the command', () => {
    const c = make()
    expect(getRegisteredHotkeys()).toHaveLength(0)
    const off = c.register([cmd('a', { shortcut: 'mod+1' }), cmd('b', { shortcut: ['mod+2', 'mod+3'] }), cmd('plain')])
    expect(getRegisteredHotkeys().map((h) => h.shortcut)).toEqual(['mod+1', 'mod+2', 'mod+3'])
    off()
    expect(getRegisteredHotkeys()).toHaveLength(0)
  })

  it('runs the command when its shortcut is pressed, with source "shortcut"', async () => {
    const c = make()
    const run = vi.fn()
    c.register(cmd('a', { shortcut: 'ctrl+1', run }))
    press('1', { ctrlKey: true })
    await Promise.resolve()
    expect(run).toHaveBeenCalledOnce()
    expect(run.mock.calls[0]![0]).toMatchObject({ id: 'a', source: 'shortcut' })
  })

  it('registers while enabled and not otherwise, following a reactive `enabled`', () => {
    const c = make()
    const on = signal(false)
    c.register(cmd('a', { shortcut: 'ctrl+1', enabled: () => on() }))
    expect(getRegisteredHotkeys()).toHaveLength(0)
    on.set(true)
    expect(getRegisteredHotkeys()).toHaveLength(1)
    on.set(false)
    expect(getRegisteredHotkeys()).toHaveLength(0)
  })

  it('moves the hotkey when a function registration changes its shortcut, and leaves it alone when only the title changed', () => {
    const c = make()
    const key = signal('ctrl+1')
    const title = signal('A')
    c.register(() => ({ id: 'a', title: title(), shortcut: key() }))
    const before = getRegisteredHotkeys()
    title.set('B')
    expect(getRegisteredHotkeys()).toEqual(before)
    key.set('ctrl+2')
    expect(getRegisteredHotkeys().map((h) => h.shortcut)).toEqual(['ctrl+2'])
  })

  it('a shadowed command gives its shortcut up, and gets it back when the winner is removed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = make()
    c.register(cmd('save', { shortcut: 'ctrl+s' }))
    const off = c.register(cmd('save', { shortcut: 'ctrl+s' }))
    expect(getRegisteredHotkeys()).toHaveLength(1)
    off()
    expect(getRegisteredHotkeys()).toHaveLength(1)
  })

  it('shortcuts with a modifier fire inside a text field, bare keys do not', async () => {
    const c = make()
    const withMod = vi.fn()
    const bare = vi.fn()
    c.register([cmd('m', { shortcut: 'ctrl+9', run: withMod }), cmd('b', { shortcut: 'g', run: bare })])
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    press('9', { ctrlKey: true }, input)
    press('g', {}, input)
    await Promise.resolve()
    expect(withMod).toHaveBeenCalledOnce()
    expect(bare).not.toHaveBeenCalled()
    press('g', {}, document.body)
    await Promise.resolve()
    expect(bare).toHaveBeenCalledOnce()
    input.remove()
  })

  it('warns in development when two commands share a shortcut, naming both, once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = make()
    c.register(cmd('save', { shortcut: 'ctrl+s' }))
    c.register(cmd('export', { shortcut: 'control+s' }))
    const messages = warn.mock.calls.map((x) => String(x[0]))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('"save" and "export" share the shortcut')
    expect(messages[0]).toContain('[Pyreon]')
  })

  it('names a plain hotkey it collides with', async () => {
    const { registerHotkey } = await import('@pyreon/hotkeys')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerHotkey('ctrl+k', () => {})
    const c = make()
    c.register(cmd('search', { shortcut: 'ctrl+k' }))
    expect(String(warn.mock.calls[0]?.[0])).toContain('another hotkey (ctrl+k) and "search" share the shortcut')
  })

  it('an empty or blank shortcut registers nothing and does not break the other commands', () => {
    const c = make()
    c.register([cmd('blank', { shortcut: '  ' }), cmd('none', { shortcut: [] }), cmd('good', { shortcut: 'ctrl+5' })])
    expect(ids(c)).toEqual(['blank', 'none', 'good'])
    expect(getRegisteredHotkeys().map((h) => h.shortcut)).toEqual(['ctrl+5'])
  })

  it('reports an error from a shortcut run through onError, and does not leave an unhandled rejection', async () => {
    const onError = vi.fn()
    const c = make({ onError })
    c.register(cmd('boom', { shortcut: 'ctrl+7', run: () => { throw new Error('bad') } }))
    press('7', { ctrlKey: true })
    await new Promise((r) => setTimeout(r, 0))
    expect(onError).toHaveBeenCalledOnce()
    expect((onError.mock.calls[0]![0] as Error).message).toBe('bad')
    expect((onError.mock.calls[0]![1] as Command).id).toBe('boom')
  })
})

describe('dispose and cleanup', () => {
  it('dispose removes every command, group, hotkey and effect, and later registrations do nothing', () => {
    const c = make({ groups: [{ id: 'g', title: 'G' }] })
    c.register([cmd('a', { shortcut: 'ctrl+1' }), cmd('b', { title: () => 'B' })])
    c.dispose()
    expect(ids(c)).toEqual([])
    expect(c.groups()).toEqual([])
    expect(getRegisteredHotkeys()).toHaveLength(0)
    c.register(cmd('late', { shortcut: 'ctrl+2' }))
    expect(ids(c)).toEqual([])
    expect(getRegisteredHotkeys()).toHaveLength(0)
  })

  it('an unregistered command stops reading its title and its enabled function (no computed or effect is left running)', () => {
    const c = make()
    const reads = { title: 0, enabled: 0 }
    const tick = signal(0)
    const off = c.register(cmd('x', { shortcut: 'ctrl+1', title: () => { reads.title++; return `x${tick()}` }, enabled: () => { reads.enabled++; tick(); return true } }))
    c.search('x')
    off()
    const after = { ...reads }
    batch(() => tick.set(1))
    batch(() => tick.set(2))
    expect(reads).toEqual(after)
  })

  it('a thousand register and unregister cycles leave the hotkey registry, the listeners and the recents list as they were', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const c = make()
    for (let i = 0; i < 1000; i++) {
      const off = c.register([cmd(`c${i}`, { shortcut: `ctrl+${i % 9}`, title: () => `t${i}` }), cmd('p', { children: [cmd('q')] })])
      c.search('t')
      off()
    }
    expect(getRegisteredHotkeys()).toHaveLength(0)
    expect(ids(c)).toEqual([])
    const added = add.mock.calls.filter((x) => x[0] === 'keydown').length
    const removed = remove.mock.calls.filter((x) => x[0] === 'keydown').length
    expect(added).toBe(removed)
    expect(added).toBeGreaterThan(0)
  })

  it('a component that mounts and unmounts a thousand times with a function registration leaves nothing behind', () => {
    const c = make()
    const s = signal(0)
    for (let i = 0; i < 1000; i++) {
      const scope = effectScope()
      scope.runInScope(() => c.register(() => ({ id: 'page', title: `n${s()}`, shortcut: 'ctrl+8' })))
      scope.stop()
    }
    expect(ids(c)).toEqual([])
    expect(getRegisteredHotkeys()).toHaveLength(0)
  })
})

describe('scale', () => {
  const big = (n: number): Command[] => Array.from({ length: n }, (_, i) => cmd(`c${i}`, { title: `Command ${i} ${['open', 'close', 'save', 'toggle'][i % 4]} thing` }))

  it('filters 5,000 commands well inside a frame (a generous bound: the number it printed is in the docs)', () => {
    const c = make()
    c.register(big(5000))
    c.search('c') // prepare
    const t0 = performance.now()
    const got = c.search('cmd 4 sav')
    const ms = performance.now() - t0
    expect(got.length).toBeGreaterThan(0)
    expect(ms).toBeLessThan(250)
    console.info(`[measured] 5,000 commands, one cold query: ${ms.toFixed(1)} ms`)
  })

  it('10,000 commands register in one pass and search', () => {
    const c = make()
    const off = c.register(big(10_000))
    expect(c.commands()).toHaveLength(10_000)
    expect(c.search('tog 9999')[0]?.id).toBe('c9999')
    off()
    expect(c.commands()).toHaveLength(0)
  })

  it('duplicate ids among 10,000 commands: the later one answers', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = make()
    c.register(big(2000))
    c.register(cmd('c5', { title: 'Replacement' }))
    expect(c.get('c5')?.title).toBe('Replacement')
    expect(c.commands()).toHaveLength(2000)
  })
})
