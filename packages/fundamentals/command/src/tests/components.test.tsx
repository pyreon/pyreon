// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests dispatch and observe real DOM events
/**
 * `<CommandPalette>` and its parts mounted through the real `h()` and `mount()` under happy-dom: the dialog, the ARIA
 * wiring, the keyboard, focus return, pages, the async states, windowing and cleanup. happy-dom implements
 * `<dialog>.showModal()`, focus and `document.activeElement`, so all of that is observable here. What it does not have is
 * layout: the top layer, real inertness, scroll metrics and pointer sequencing are covered by `palette.browser.test.tsx`
 * in Chromium, and where a test below needs a size it sets it on the element and says so.
 */
import type { VNodeChild } from '@pyreon/core'
import { _resetHotkeys, getRegisteredHotkeys } from '@pyreon/hotkeys'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCommands } from '../commands'
import { CommandEmpty, CommandInput, CommandItem, CommandList, CommandLoading, CommandPalette, CommandShortcut, Highlight, usePalette } from '../components'
import { lockScroll, showModal, trapTab } from '../dialog'
import { createPalette } from '../palette'
import type { Palette } from '../palette-types'
import type { Command, Commands } from '../types'

const cmd = (id: string, extra?: Partial<Command>): Command => ({ id, title: id, ...extra })
const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms))

const cleanups: (() => void)[] = []
let registry: Commands

function render(node: VNodeChild, into?: HTMLElement): HTMLElement {
  const root = document.createElement('div')
  ;(into ?? document.body).append(root)
  const unmount = mount(node as never, root)
  cleanups.push(() => {
    unmount()
    root.remove()
  })

  return root
}

/** A focused button outside the palette, as the element that opened it. */
function focusedOpener(parent: HTMLElement = document.body): HTMLButtonElement {
  const opener = document.createElement('button')
  opener.textContent = 'opener'
  parent.append(opener)
  cleanups.push(() => opener.remove())
  opener.focus()

  return opener
}

function palette(options: Parameters<typeof createPalette>[0] = {}): Palette {
  const p = createPalette({ commands: registry, hotkey: false, debounce: 0, ...options })
  cleanups.push(() => p.dispose())

  return p
}

async function openPalette(options: Parameters<typeof createPalette>[0] = {}, props: Record<string, unknown> = {}): Promise<Palette> {
  const p = palette(options)
  render(<CommandPalette palette={p} {...props} />)
  p.open()
  await tick()

  return p
}

const dialog = (): HTMLDialogElement | null => document.querySelector('dialog')
const input = (): HTMLInputElement => document.querySelector<HTMLInputElement>('dialog input[role=combobox]') as HTMLInputElement
const options = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role=option]')]
const titles = (): string[] => options().map((o) => o.querySelector('.pcmd-title')?.textContent ?? '')
const activeOption = (): HTMLElement | null => document.getElementById(input().getAttribute('aria-activedescendant') ?? '')
const live = (): string => document.querySelector('dialog output')?.textContent ?? ''

function key(target: EventTarget, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)

  return event
}

async function type(text: string): Promise<void> {
  input().value = text
  input().dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
}

beforeEach(() => {
  registry = createCommands({ groups: [{ id: 'file', title: 'File' }, { id: 'view', title: 'View' }] })
  _resetHotkeys()
})

afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) c()
  registry.dispose()
  _resetHotkeys()
  for (const d of document.querySelectorAll('dialog')) d.remove()
  document.documentElement.removeAttribute('style')
  vi.restoreAllMocks()
})

describe('the dialog', () => {
  it('renders nothing while closed; open, it is a modal dialog named by the label with the input focused; closed, it is gone', async () => {
    registry.register([cmd('a'), cmd('b')])
    const p = palette({ label: 'Actions' })
    render(<CommandPalette palette={p} />)
    expect(dialog()).toBeNull()
    p.open()
    await tick()
    expect(dialog()?.open).toBe(true)
    expect(dialog()?.getAttribute('aria-label')).toBe('Actions')
    expect(dialog()?.parentElement?.parentElement === document.body || dialog()?.parentElement === document.body).toBe(true)
    expect(document.activeElement).toBe(input())
    p.close()
    await tick()
    expect(dialog()).toBeNull()
  })

  it('opens and closes on its hotkey, and a palette the component made itself goes away with the component', async () => {
    registry.register([cmd('a')])
    const root = render(<CommandPalette commands={registry} hotkey="ctrl+k" />)
    expect(getRegisteredHotkeys().map((h) => h.shortcut)).toEqual(['ctrl+k'])
    key(window, 'k', { ctrlKey: true })
    await tick()
    expect(dialog()).not.toBeNull()
    key(input(), 'k', { ctrlKey: true })
    await tick()
    expect(dialog()).toBeNull()
    key(window, 'k', { ctrlKey: true })
    await tick()
    expect(dialog()).not.toBeNull()
    // Unmounting the component while open disposes its own palette: the dialog, the hotkey and the scroll lock go too.
    cleanups.pop()?.()
    expect(root.isConnected).toBe(false)
    await tick()
    expect(dialog()).toBeNull()
    expect(getRegisteredHotkeys()).toEqual([])
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('returns focus to the opener after Escape and after a run, and not when restoreFocus is false', async () => {
    let ran = 0
    registry.register([cmd('go', { run: () => void ran++ })])
    const opener = focusedOpener()
    const p = await openPalette()
    expect(document.activeElement).toBe(input())
    key(input(), 'Escape')
    await tick()
    expect(p.isOpen()).toBe(false)
    expect(document.activeElement).toBe(opener)

    opener.focus()
    p.open()
    await tick()
    key(input(), 'Enter')
    await tick()
    expect(ran).toBe(1)
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(opener)

    const q = palette({ restoreFocus: false })
    render(<CommandPalette palette={q} />)
    opener.focus()
    q.open()
    await tick()
    q.close()
    await tick()
    expect(document.activeElement).not.toBe(opener)
  })

  it('does not throw when the opener is gone by the time it closes', async () => {
    registry.register([cmd('a')])
    const opener = focusedOpener()
    const p = await openPalette()
    opener.remove()
    p.close()
    await tick()
    expect(dialog()).toBeNull()
    expect(opener.isConnected).toBe(false)
  })

  it('takes the direction of the element that had focus, or the dir prop', async () => {
    registry.register([cmd('a')])
    const host = document.createElement('div')
    document.body.append(host)
    cleanups.push(() => host.remove())
    const opener = focusedOpener(host)
    opener.style.direction = 'rtl'
    const p = await openPalette()
    expect(dialog()?.dir).toBe('rtl')
    p.close()
    await tick()

    const q = palette()
    render(<CommandPalette palette={q} dir="ltr" />)
    opener.focus()
    q.open()
    await tick()
    expect(dialog()?.dir).toBe('ltr')
  })

  it('locks the page scroll while open and restores it on close', async () => {
    registry.register([cmd('a')])
    document.documentElement.style.overflow = 'scroll'
    const p = await openPalette()
    expect(document.documentElement.style.overflow).toBe('hidden')
    p.close()
    await tick()
    expect(document.documentElement.style.overflow).toBe('scroll')
  })

  it('closes on a click on the backdrop (the dialog itself) but not inside the panel', async () => {
    registry.register([cmd('a')])
    const p = await openPalette()
    const panel = document.querySelector<HTMLElement>('dialog .pcmd-panel')
    panel?.click()
    expect(panel).not.toBeNull()
    expect(p.isOpen()).toBe(true)
    dialog()?.click()
    expect(p.isOpen()).toBe(false)
  })

  it('a close the browser makes (the close event) closes the palette; cancel goes back a page first, then closes, and is prevented', async () => {
    registry.register([cmd('theme', { children: [cmd('dark')] })])
    const p = await openPalette()
    p.open('theme')
    const cancel = new Event('cancel', { cancelable: true })
    dialog()?.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(p.page()).toEqual([])
    expect(p.isOpen()).toBe(true)
    dialog()?.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(p.isOpen()).toBe(false)

    p.open()
    await tick()
    dialog()?.dispatchEvent(new Event('close'))
    expect(p.isOpen()).toBe(false)
  })

  it('Escape outside the input (on a button in the dialog) also goes back, then closes; Tab is kept inside', async () => {
    registry.register([cmd('theme', { children: [cmd('dark')] })])
    const p = await openPalette()
    p.open('theme')
    await tick()
    const close = dialog()?.querySelector('.pcmd-close') as HTMLButtonElement
    const back = dialog()?.querySelector('.pcmd-back') as HTMLButtonElement
    expect(back.hidden).toBe(false)
    close.focus()
    const tab = key(close, 'Tab')
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(back)
    const esc = key(back, 'Escape')
    expect(esc.defaultPrevented).toBe(true)
    expect(p.page()).toEqual([])
    expect(p.isOpen()).toBe(true)
    key(close, 'Escape')
    expect(p.isOpen()).toBe(false)
  })

  it('renders a layout of its own instead of the default one, and the parts read the palette from the context', async () => {
    registry.register([cmd('alpha'), cmd('beta')])
    const p = palette()
    render(
      <CommandPalette palette={p} class="mine" panelClass="mine-panel">
        <CommandInput class="mine-input" />
        <CommandList class="mine-list" />
      </CommandPalette>,
    )
    p.open()
    await tick()
    expect(dialog()?.className).toBe('mine')
    expect(dialog()?.querySelector('.mine-panel')).not.toBeNull()
    expect(input().className).toBe('mine-input')
    expect(dialog()?.querySelector('.pcmd-close')).toBeNull()
    expect(document.querySelector('.mine-list')?.getAttribute('role')).toBe('listbox')
    expect(titles()).toEqual(['alpha', 'beta'])
  })
})

describe('the combobox and the listbox', () => {
  it('wires the input to the list: role, aria-controls, aria-expanded, aria-activedescendant, and each option its position', async () => {
    registry.register([cmd('open', { group: 'file' }), cmd('save', { group: 'file' }), cmd('zoom', { group: 'view' })])
    await openPalette()
    const list = document.querySelector('[role=listbox]') as HTMLElement
    expect(input().getAttribute('role')).toBe('combobox')
    expect(input().getAttribute('aria-controls')).toBe(list.id)
    expect(input().getAttribute('aria-autocomplete')).toBe('list')
    expect(input().getAttribute('aria-expanded')).toBe('true')
    expect(list.getAttribute('aria-label')).toBe('Command palette')
    expect(options().map((o) => [o.getAttribute('aria-posinset'), o.getAttribute('aria-setsize')])).toEqual([
      ['1', '3'],
      ['2', '3'],
      ['3', '3'],
    ])
    expect(activeOption()).toBe(options()[0])
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true')
    expect(options()[0]?.hasAttribute('data-active')).toBe(true)
    expect(options()[1]?.getAttribute('aria-selected')).toBe('false')
  })

  it('names each group by its heading, which is hidden from the accessibility tree', async () => {
    registry.register([cmd('loose'), cmd('open', { group: 'file' }), cmd('zoom', { group: 'view' })])
    await openPalette()
    const groups = [...document.querySelectorAll<HTMLElement>('[role=group]')]
    expect(groups).toHaveLength(3)
    expect(groups[0]?.hasAttribute('aria-labelledby')).toBe(false)
    for (const [i, name] of [
      [1, 'File'],
      [2, 'View'],
    ] as const) {
      const heading = document.getElementById(groups[i]?.getAttribute('aria-labelledby') ?? '')
      expect(heading?.textContent).toBe(name)
      expect(heading?.getAttribute('aria-hidden')).toBe('true')
      expect(groups[i]?.contains(heading as Node)).toBe(true)
    }
  })

  it('draws a row: icon, highlighted title and subtitle, shortcut, the page chevron, and the disabled reason', async () => {
    registry.register([
      cmd('settings', { title: 'Settings', subtitle: 'Preferences', icon: '⚙', shortcut: 'shift+s', children: [cmd('x')] }),
      cmd('print', { title: 'Print', enabled: false, disabledReason: 'No printer' }),
    ])
    await openPalette({ showDisabled: true })
    const [settings, print] = options()
    expect(settings?.querySelector('.pcmd-icon')?.textContent).toBe('⚙')
    expect(settings?.querySelector('.pcmd-subtitle')?.textContent).toBe('Preferences')
    expect(settings?.querySelector('.pcmd-kbd')?.textContent).toMatch(/S/)
    expect(settings?.querySelector('.pcmd-chevron')).not.toBeNull()
    expect(settings?.hasAttribute('data-page')).toBe(true)
    expect(print?.getAttribute('aria-disabled')).toBe('true')
    expect(print?.hasAttribute('data-disabled')).toBe(true)
    expect(print?.querySelector('.pcmd-reason')?.textContent).toBe('No printer')
    expect(print?.querySelector('.pcmd-icon')).toBeNull()
    expect(print?.querySelector('.pcmd-chevron')).toBeNull()

    await type('pref')
    expect(options()[0]?.querySelector('.pcmd-subtitle mark')?.textContent).toBe('Pref')
    await type('prin')
    expect(options()[0]?.querySelector('.pcmd-title mark')?.textContent).toBe('Prin')
    expect(live()).toBe('Print, unavailable: No printer')
  })

  it('typing filters the rows; nothing matching shows the empty state and collapses the combobox', async () => {
    registry.register([cmd('alpha'), cmd('beta')])
    await openPalette()
    expect(document.querySelector('.pcmd-empty')).toBeNull()
    await type('alp')
    expect(titles()).toEqual(['alpha'])
    expect(live()).toBe('1 result')
    await type('zzz')
    expect(options()).toEqual([])
    expect(document.querySelector('.pcmd-empty')?.textContent).toBe('No results')
    expect(input().getAttribute('aria-expanded')).toBe('false')
    expect(input().hasAttribute('aria-activedescendant')).toBe(false)
    expect(live()).toBe('No results')
  })

  it('a recent row is marked, and data-running is set on the row while its command runs', async () => {
    let finish!: () => void
    registry.register([cmd('slow', { keepOpen: true, run: () => new Promise<void>((r) => (finish = r)) }), cmd('other')])
    const p = await openPalette()
    key(input(), 'Enter')
    await tick()
    expect(options()[0]?.hasAttribute('data-running')).toBe(true)
    expect(input().getAttribute('aria-busy')).toBe('true')
    expect(live()).toBe('Loading…')
    finish()
    await tick()
    expect(p.running()).toBeNull()
    expect(input().hasAttribute('aria-busy')).toBe(false)
    p.close()
    p.open()
    await tick()
    expect(options()[0]?.hasAttribute('data-recent')).toBe(true)
  })

  it('scrolls the active option into view when it changes', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    registry.register([cmd('a'), cmd('b'), cmd('c')])
    await openPalette()
    scroll.mockClear()
    key(input(), 'ArrowDown')
    await tick()
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
    expect(scroll.mock.contexts.at(-1)).toBe(options()[1])
  })
})

describe('the keyboard', () => {
  beforeEach(() => {
    registry.register([cmd('a1', { group: 'file' }), cmd('a2', { group: 'file' }), cmd('b1', { group: 'view' }), cmd('b2', { group: 'view' })])
  })

  const active = (): string => activeOption()?.querySelector('.pcmd-title')?.textContent ?? ''

  it('Up and Down move and wrap, Home and End jump; each is prevented so the caret does not move', async () => {
    await openPalette()
    expect(active()).toBe('a1')
    expect(key(input(), 'ArrowDown').defaultPrevented).toBe(true)
    expect(active()).toBe('a2')
    key(input(), 'End')
    expect(active()).toBe('b2')
    key(input(), 'ArrowDown')
    expect(active()).toBe('a1')
    key(input(), 'ArrowUp')
    expect(active()).toBe('b2')
    key(input(), 'Home')
    expect(active()).toBe('a1')
  })

  it('PageDown and PageUp move by pageSize', async () => {
    await openPalette({ pageSize: 2 })
    key(input(), 'PageDown')
    expect(active()).toBe('b1')
    key(input(), 'PageUp')
    expect(active()).toBe('a1')
  })

  it('arrows with a modifier, and other keys, are left to the input', async () => {
    await openPalette()
    expect(key(input(), 'ArrowDown', { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(key(input(), 'ArrowDown', { metaKey: true }).defaultPrevented).toBe(false)
    expect(key(input(), 'ArrowDown', { altKey: true }).defaultPrevented).toBe(false)
    expect(key(input(), 'a').defaultPrevented).toBe(false)
    expect(active()).toBe('a1')
  })

  it('Enter that confirms an IME composition runs nothing', async () => {
    const run = vi.fn()
    registry.register([cmd('ime', { run })])
    const p = await openPalette()
    await type('ime')
    expect(key(input(), 'Enter', { isComposing: true }).defaultPrevented).toBe(false)
    expect(key(input(), 'Enter', { keyCode: 229 }).defaultPrevented).toBe(false)
    await tick()
    expect(run).not.toHaveBeenCalled()
    expect(p.isOpen()).toBe(true)
    key(input(), 'Enter')
    await tick()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('pointer: moving over a row makes it active; pressing it keeps focus in the input; clicking runs it', async () => {
    const run = vi.fn()
    registry.register([cmd('click me', { run })])
    const p = await openPalette()
    const row = options().find((o) => o.textContent?.includes('click me')) as HTMLElement
    row.dispatchEvent(new Event('pointermove', { bubbles: true }))
    expect(activeOption()).toBe(row)
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    row.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    row.click()
    await tick()
    expect(run).toHaveBeenCalledTimes(1)
    expect(p.isOpen()).toBe(false)
  })
})

describe('pages', () => {
  it('Enter on a row with children opens its page: the back button shows, Escape and Backspace walk back, restoring the query', async () => {
    registry.register([cmd('theme', { title: 'Change theme', children: [cmd('dark'), cmd('light')] }), cmd('other')])
    const p = await openPalette()
    const back = (): HTMLButtonElement => dialog()?.querySelector('.pcmd-back') as HTMLButtonElement
    expect(back().hidden).toBe(true)
    await type('them')
    key(input(), 'Enter')
    await tick()
    expect(p.page()).toEqual(['theme'])
    expect(input().value).toBe('')
    expect(titles()).toEqual(['dark', 'light'])
    expect(back().hidden).toBe(false)
    expect(back().getAttribute('aria-label')).toBe('Back')

    // Backspace with text left only edits the text; on an empty query it goes back.
    await type('d')
    expect(key(input(), 'Backspace').defaultPrevented).toBe(false)
    expect(p.page()).toEqual(['theme'])
    await type('')
    expect(key(input(), 'Backspace').defaultPrevented).toBe(true)
    expect(p.page()).toEqual([])
    expect(input().value).toBe('them')

    // Backspace at the root with an empty query is the input's own.
    await type('')
    expect(key(input(), 'Backspace').defaultPrevented).toBe(false)

    p.open('theme')
    await tick()
    back().click()
    await tick()
    expect(p.page()).toEqual([])
    p.open('theme')
    key(input(), 'Escape')
    expect(p.page()).toEqual([])
    expect(p.isOpen()).toBe(true)
    key(input(), 'Escape')
    expect(p.isOpen()).toBe(false)
  })

  it('the close button closes from any page', async () => {
    registry.register([cmd('theme', { children: [cmd('dark')] })])
    const p = await openPalette({ messages: { close: 'Schließen' } })
    p.open('theme')
    const close = dialog()?.querySelector('.pcmd-close') as HTMLButtonElement
    expect(close.getAttribute('aria-label')).toBe('Schließen')
    close.click()
    expect(p.isOpen()).toBe(false)
  })
})

describe('async states', () => {
  it('shows the loading part while a source is pending, then its rows; an error is announced and hides the empty state', async () => {
    let answer!: (rows: Command[]) => void
    let fail!: (error: Error) => void
    registry.register([
      cmd('search', {
        children: () =>
          new Promise<Command[]>((resolve, reject) => {
            answer = resolve
            fail = reject
          }),
      }),
    ])
    const p = await openPalette({ messages: { loading: 'Busy' } })
    p.open('search')
    await tick()
    expect(document.querySelector('.pcmd-loading')?.textContent).toBe('Busy')
    expect(document.querySelector('.pcmd-loading')?.getAttribute('aria-hidden')).toBe('true')
    expect(document.querySelector('.pcmd-empty')).toBeNull()
    expect(live()).toBe('Busy')
    answer([cmd('found')])
    await tick()
    expect(document.querySelector('.pcmd-loading')).toBeNull()
    expect(titles()).toEqual(['found'])

    await type('nothing')
    await tick()
    fail(new Error('offline'))
    await tick()
    expect(p.status()).toBe('error')
    expect(live()).toBe('Failed: offline')
    expect(document.querySelector('.pcmd-loading')).toBeNull()
    // The last rows stay on screen with the error; the empty state is not shown for an error.
    expect(titles()).toEqual(['found'])
    answer([])
    await type('again')
    await tick()
    answer([])
    await tick()
    expect(p.status()).toBe('idle')
    expect(document.querySelector('.pcmd-empty')?.textContent).toBe('No results')
  })
})

describe('the parts on their own', () => {
  it('usePalette outside a palette throws an error that says how to fix it', () => {
    expect(() => usePalette()).toThrow(/\[Pyreon\] usePalette\(\): call it inside a <CommandPalette>/)
  })

  it('Highlight wraps each matched run in a mark, keeping the text between and after', () => {
    const root = render(<Highlight text="open file" ranges={[[0, 2], [5, 7]]} markClass="hit" />)
    expect(root.innerHTML).toBe('<mark class="hit">op</mark>en <mark class="hit">fi</mark>le')
    const plain = render(<Highlight text="abc" ranges={[[1, 3]]} />)
    expect(plain.innerHTML).toBe('a<mark class="pcmd-mark">bc</mark>')
  })

  it('CommandShortcut shows its shortcut or its children', () => {
    expect(render(<CommandShortcut shortcut="⌘K" />).innerHTML).toBe('<kbd class="pcmd-kbd">⌘K</kbd>')
    expect(render(<CommandShortcut class="k">Esc</CommandShortcut>).innerHTML).toBe('<kbd class="k">Esc</kbd>')
  })

  it('custom content for a row, the empty state and the loading state', async () => {
    registry.register([cmd('a'), cmd('src', { children: () => new Promise<Command[]>(() => {}) })])
    const p = palette()
    render(
      <CommandPalette palette={p}>
        <CommandInput />
        <CommandList>{() => p.results().map((item) => <CommandItem item={item} class="row">{`#${item.title}`}</CommandItem>)}</CommandList>
        <CommandEmpty class="none">Nothing here</CommandEmpty>
        <CommandLoading class="wait">Hold on</CommandLoading>
      </CommandPalette>,
    )
    p.open()
    await tick()
    expect([...document.querySelectorAll('.row')].map((r) => r.textContent)).toEqual(['#a', '#src'])
    await type('zz')
    expect(document.querySelector('.none')?.textContent).toBe('Nothing here')
    p.open('src')
    await tick()
    expect(document.querySelector('.wait')?.textContent).toBe('Hold on')
  })
})

describe('a long list is windowed', () => {
  const many = (n: number, group?: string): Command[] => Array.from({ length: n }, (_, i) => cmd(`row-${i}`, { title: `Row ${i}`, ...(group === undefined ? {} : { group }) }))

  it('renders only the rows in view (headings as presentation), keeps aria-setsize, and follows the active row to the end and back', async () => {
    registry.register([...many(400, 'file')])
    await openPalette({}, { virtualizeAfter: 50, rowHeight: 20 })
    const list = document.querySelector('[role=listbox]') as HTMLElement
    const win = list.querySelector('.pcmd-window') as HTMLElement
    // 400 rows and one heading, 20px each.
    expect(win.style.height).toBe('8020px')
    expect(list.querySelector('[role=group]')).toBeNull()
    expect(list.querySelector('.pcmd-heading')?.getAttribute('role')).toBe('presentation')
    expect(options().length).toBeLessThan(30)
    expect(options()[0]?.getAttribute('aria-setsize')).toBe('400')
    expect(options()[0]?.style.top).toBe('20px')

    // happy-dom has no layout: give the listbox the height a stylesheet would.
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 200 })
    key(input(), 'End')
    await tick()
    // The last row (index 400, after the heading) sits at the bottom of the 200px view.
    expect(list.scrollTop).toBe(401 * 20 - 200)
    expect(activeOption()?.getAttribute('aria-posinset')).toBe('400')
    expect(options().length).toBeLessThan(30)

    key(input(), 'Home')
    await tick()
    expect(list.scrollTop).toBe(20)
    expect(activeOption()?.getAttribute('aria-posinset')).toBe('1')
  })

  it('redraws the window on scroll, once per frame, and cancels a pending frame on unmount', async () => {
    registry.register(many(200))
    const p = await openPalette({}, { virtualizeAfter: 10, rowHeight: 10 })
    const list = document.querySelector('[role=listbox]') as HTMLElement
    // happy-dom has no layout: give the listbox the height a stylesheet would.
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 })
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame')
    list.scrollTop = 1000
    list.dispatchEvent(new Event('scroll'))
    list.dispatchEvent(new Event('scroll'))
    expect(raf).toHaveBeenCalledTimes(1)
    await new Promise((r) => requestAnimationFrame(() => r(undefined)))
    await tick()
    const positions = options().map((o) => Number(o.getAttribute('aria-posinset')))
    expect(Math.min(...positions)).toBe(1000 / 10 - 6 + 1)
    expect(Math.max(...positions)).toBe((1000 + 100) / 10 + 6)

    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame')
    list.dispatchEvent(new Event('scroll'))
    p.close()
    await tick()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('switches between the windowed and the grouped list as the row count crosses the threshold', async () => {
    registry.register([...many(30), cmd('special')])
    await openPalette({}, { virtualizeAfter: 20 })
    expect(document.querySelector('.pcmd-window')).not.toBeNull()
    await type('special')
    expect(document.querySelector('.pcmd-window')).toBeNull()
    expect(titles()).toEqual(['special'])
  })
})

describe('dialog behaviour, directly', () => {
  it('lockScroll is counted, idempotent per release, and pads the side of the scrollbar it removes', () => {
    const html = document.documentElement
    // happy-dom has no layout: a 15px scrollbar is the gap between the window and the root's client width.
    Object.defineProperty(html, 'clientWidth', { configurable: true, value: window.innerWidth - 15 })
    cleanups.push(() => Reflect.deleteProperty(html, 'clientWidth'))
    html.style.paddingRight = '5px'
    const first = lockScroll()
    expect(html.style.overflow).toBe('hidden')
    expect(html.style.paddingRight).toBe('20px')
    const second = lockScroll()
    first()
    first()
    expect(html.style.overflow).toBe('hidden')
    second()
    expect(html.style.overflow).toBe('')
    expect(html.style.paddingRight).toBe('5px')

    html.style.direction = 'rtl'
    html.style.paddingLeft = '2px'
    const rtl = lockScroll()
    expect(html.style.paddingLeft).toBe('17px')
    expect(html.style.paddingRight).toBe('5px')
    rtl()
    expect(html.style.paddingLeft).toBe('2px')
  })

  it('lockScroll adds no padding when there is no scrollbar', () => {
    const html = document.documentElement
    Object.defineProperty(html, 'clientWidth', { configurable: true, value: window.innerWidth })
    cleanups.push(() => Reflect.deleteProperty(html, 'clientWidth'))
    const release = lockScroll()
    expect(html.style.paddingRight).toBe('')
    expect(html.style.paddingLeft).toBe('')
    release()
  })

  it('trapTab cycles Tab and Shift+Tab inside the root, skips hidden and disabled controls, and ignores other keys', () => {
    const root = document.createElement('div')
    root.innerHTML = '<button id="t1">1</button><button hidden>h</button><input id="t2"><button disabled>d</button><a id="t3" href="#">3</a>'
    document.body.append(root)
    cleanups.push(() => root.remove())
    const [t1, t2, t3] = ['t1', 't2', 't3'].map((id) => document.getElementById(id) as HTMLElement)
    const tab = (shiftKey = false): { moved: boolean; prevented: boolean } => {
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true })
      const moved = trapTab(root, event)
      return { moved, prevented: event.defaultPrevented }
    }
    t3?.focus()
    expect(tab()).toEqual({ moved: true, prevented: true })
    expect(document.activeElement).toBe(t1)
    expect(tab(true)).toEqual({ moved: true, prevented: true })
    expect(document.activeElement).toBe(t3)
    // In the middle the browser moves focus itself.
    t2?.focus()
    expect(tab()).toEqual({ moved: false, prevented: false })
    expect(tab(true)).toEqual({ moved: false, prevented: false })
    // Focus outside the root is pulled in, at the start or the end.
    const outside = focusedOpener()
    expect(tab()).toEqual({ moved: true, prevented: true })
    expect(document.activeElement).toBe(t1)
    outside.focus()
    tab(true)
    expect(document.activeElement).toBe(t3)
    expect(trapTab(root, new KeyboardEvent('keydown', { key: 'a' }))).toBe(false)

    const empty = document.createElement('div')
    document.body.append(empty)
    cleanups.push(() => empty.remove())
    // Nothing focusable: Tab goes nowhere rather than out of the dialog.
    const nowhere = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
    expect(trapTab(empty, nowhere)).toBe(true)
    expect(nowhere.defaultPrevented).toBe(true)
  })

  it('showModal uses the native modal and closes it once', () => {
    const el = document.createElement('dialog')
    document.body.append(el)
    cleanups.push(() => el.remove())
    const close = vi.spyOn(el, 'close')
    const hide = showModal(el)
    expect(el.open).toBe(true)
    hide()
    expect(el.open).toBe(false)
    hide()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('showModal without native support makes the rest of the body inert and restores each sibling as it was', () => {
    const plain = document.createElement('main')
    const alreadyInert = document.createElement('aside')
    alreadyInert.setAttribute('inert', '')
    const hiddenBefore = document.createElement('nav')
    hiddenBefore.setAttribute('aria-hidden', 'false')
    const wrapper = document.createElement('div')
    const el = document.createElement('dialog')
    wrapper.append(el)
    document.body.append(plain, alreadyInert, hiddenBefore, wrapper)
    cleanups.push(() => {
      for (const n of [plain, alreadyInert, hiddenBefore, wrapper]) n.remove()
    })
    // A browser without `showModal` (the fallback path).
    Object.defineProperty(el, 'showModal', { configurable: true, value: undefined })

    const hide = showModal(el)
    expect(el.hasAttribute('open')).toBe(true)
    expect(el.getAttribute('aria-modal')).toBe('true')
    for (const n of [plain, alreadyInert, hiddenBefore]) {
      expect(n.hasAttribute('inert')).toBe(true)
      expect(n.getAttribute('aria-hidden')).toBe('true')
    }
    // The element that holds the dialog is not made inert.
    expect(wrapper.hasAttribute('inert')).toBe(false)

    hide()
    expect(el.hasAttribute('open')).toBe(false)
    expect(plain.hasAttribute('inert')).toBe(false)
    expect(plain.hasAttribute('aria-hidden')).toBe(false)
    expect(alreadyInert.hasAttribute('inert')).toBe(true)
    expect(alreadyInert.hasAttribute('aria-hidden')).toBe(false)
    expect(hiddenBefore.getAttribute('aria-hidden')).toBe('false')
  })
})
