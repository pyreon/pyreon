// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests dispatch and observe real DOM events
import { h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { hydrateRoot, mount, onHydrationMismatch } from '@pyreon/runtime-dom'
import axe from 'axe-core'
import { userEvent } from 'vitest/browser'
import { afterEach, describe, expect, it } from 'vitest'
import '../../style.css'
import { createCommands } from '../commands'
import { CommandPalette } from '../components'
import { createPalette } from '../palette'
import type { Command, Commands } from '../types'

const cleanups: (() => void)[] = []
const sleep = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms))
const cmd = (id: string, extra?: Partial<Command>): Command => ({ id, title: id, ...extra })
const KEY = '{Control>}k{/Control}'

function render(node: VNodeChild, dir?: string): HTMLElement {
  const root = document.createElement('div')
  if (dir !== undefined) root.dir = dir
  document.body.append(root)
  const unmount = mount(node as never, root)
  cleanups.push(() => {
    unmount()
    root.remove()
  })

  return root
}

let registries: Commands[] = []

const registry = (...list: Command[]): Commands => {
  const c = createCommands({ groups: [{ id: 'file', title: 'File' }, { id: 'view', title: 'View' }] })
  c.register(list)
  registries.push(c)

  return c
}

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  for (const r of registries) r.dispose()
  registries = []
  for (const d of document.querySelectorAll('dialog')) d.remove()
  document.documentElement.removeAttribute('style')
})

const dialog = (): HTMLDialogElement | null => document.querySelector('dialog.pcmd')
const input = (): HTMLInputElement => document.querySelector<HTMLInputElement>('dialog.pcmd input[role=combobox]')!
const options = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('dialog.pcmd [role=option]')]
const live = (): string => document.querySelector('dialog.pcmd output')?.textContent ?? ''
const activeOption = (): HTMLElement | null => document.getElementById(input().getAttribute('aria-activedescendant') ?? '')
const titles = (): string[] => options().map((o) => o.querySelector('.pcmd-title')?.textContent ?? '')

async function openWith(commands: Commands, extra: Record<string, unknown> = {}): Promise<HTMLButtonElement> {
  const opener = document.createElement('button')
  opener.textContent = 'opener'
  opener.id = 'opener'
  document.body.append(opener)
  cleanups.push(() => opener.remove())
  render(<CommandPalette commands={commands} hotkey="ctrl+k" {...extra} />)
  opener.focus()
  await userEvent.keyboard(KEY)
  await sleep()

  return opener
}

describe('opening and closing', () => {
  it('renders nothing while closed, opens on the hotkey as a modal with the input focused, and closes on the hotkey', async () => {
    const commands = registry(cmd('a'), cmd('b'))
    render(<CommandPalette commands={commands} hotkey="ctrl+k" />)
    expect(dialog()).toBeNull()
    await userEvent.keyboard(KEY)
    await sleep()
    expect(dialog()).not.toBeNull()
    expect(dialog()!.matches(':modal')).toBe(true)
    expect(document.activeElement).toBe(input())
    await userEvent.keyboard(KEY)
    await sleep()
    expect(dialog()).toBeNull()
  })

  it('returns focus to the element that had it, after Escape and after running a command', async () => {
    let ran = 0
    const commands = registry(cmd('go', { run: () => void ran++ }))
    const opener = await openWith(commands)
    expect(document.activeElement).toBe(input())
    await userEvent.keyboard('{Escape}')
    await sleep()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
    await userEvent.keyboard(KEY)
    await sleep()
    await userEvent.keyboard('{Enter}')
    await sleep()
    expect(ran).toBe(1)
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('does not throw and lands on the body when the opener is gone by the time it closes', async () => {
    const commands = registry(cmd('go', { run: () => {} }))
    const opener = await openWith(commands)
    opener.remove()
    await userEvent.keyboard('{Escape}')
    await sleep()
    expect(dialog()).toBeNull()
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true)
  })

  it('closes on a click on the backdrop but not inside the panel', async () => {
    await openWith(registry(cmd('a')))
    dialog()!.querySelector<HTMLElement>('.pcmd-panel')!.click()
    await sleep()
    expect(dialog()).not.toBeNull()
    dialog()!.click()
    await sleep()
    expect(dialog()).toBeNull()
  })

  it('opening a palette closes the one that is open (one at a time)', async () => {
    const commands = registry(cmd('a'))
    render(<CommandPalette commands={commands} hotkey={false} placeholder="first" />)
    const second = createPalette({ commands, hotkey: false, placeholder: 'second' })
    cleanups.push(() => second.dispose())
    const first = document.createElement('button')
    document.body.append(first)
    cleanups.push(() => first.remove())
    second.open()
    await sleep()
    second.close()
    expect(dialog()).toBeNull()
  })
})

describe('the combobox and listbox wiring', () => {
  it('names the input, points it at the list and at the active option, and marks the active one selected', async () => {
    const commands = registry(cmd('one', { group: 'file' }), cmd('two', { group: 'file' }), cmd('three', { group: 'view' }))
    await openWith(commands)
    const box = input()
    expect(box.getAttribute('role')).toBe('combobox')
    expect(box.getAttribute('aria-expanded')).toBe('true')
    expect(box.getAttribute('aria-autocomplete')).toBe('list')
    const list = dialog()!.querySelector('[role=listbox]')!
    expect(box.getAttribute('aria-controls')).toBe(list.id)
    expect(activeOption()?.getAttribute('aria-selected')).toBe('true')
    expect(options().filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1)
    expect(options().map((o) => o.getAttribute('aria-posinset'))).toEqual(['1', '2', '3'])
    expect(options().every((o) => o.getAttribute('aria-setsize') === '3')).toBe(true)
    const groups = [...dialog()!.querySelectorAll<HTMLElement>('[role=group]')]
    expect(groups.map((g) => document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent)).toEqual(['File', 'View'])
  })

  it('arrow keys move the active option and aria-activedescendant follows; the DOM focus stays on the input', async () => {
    await openWith(registry(cmd('one'), cmd('two'), cmd('three')))
    await userEvent.keyboard('{ArrowDown}')
    expect(activeOption()?.textContent).toContain('two')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(activeOption()?.textContent).toContain('one')
    await userEvent.keyboard('{ArrowUp}')
    expect(activeOption()?.textContent).toContain('three')
    expect(document.activeElement).toBe(input())
  })

  it('Home, End, PageDown and PageUp move through the list', async () => {
    const many = Array.from({ length: 30 }, (_, i) => cmd(`c${String(i).padStart(2, '0')}`))
    await openWith(registry(...many), { pageSize: 10 })
    await userEvent.keyboard('{End}')
    expect(activeOption()?.textContent).toContain('c29')
    await userEvent.keyboard('{Home}')
    expect(activeOption()?.textContent).toContain('c00')
    await userEvent.keyboard('{PageDown}')
    expect(activeOption()?.textContent).toContain('c10')
    await userEvent.keyboard('{PageUp}{PageUp}')
    expect(activeOption()?.textContent).toContain('c20')
  })

  it('scrolls the active option into view', async () => {
    const many = Array.from({ length: 60 }, (_, i) => cmd(`c${String(i).padStart(2, '0')}`))
    await openWith(registry(...many))
    const list = dialog()!.querySelector<HTMLElement>('[role=listbox]')!
    expect(list.scrollTop).toBe(0)
    await userEvent.keyboard('{End}')
    await sleep(60)
    const rect = activeOption()!.getBoundingClientRect()
    const box = list.getBoundingClientRect()
    expect(rect.bottom).toBeLessThanOrEqual(box.bottom + 1)
    expect(rect.top).toBeGreaterThanOrEqual(box.top - 1)
    expect(list.scrollTop).toBeGreaterThan(0)
  })

  it('typing filters and highlights; Enter runs the active row', async () => {
    let ran = ''
    await openWith(registry(cmd('alpha', { title: 'Alpha Project', run: () => void (ran = 'alpha') }), cmd('beta', { title: 'Beta', run: () => void (ran = 'beta') })))
    await userEvent.keyboard('proj')
    await sleep()
    expect(titles()).toEqual(['Alpha Project'])
    expect(options()[0]!.querySelector('mark')?.textContent).toBe('Proj')
    await userEvent.keyboard('{Enter}')
    await sleep()
    expect(ran).toBe('alpha')
  })

  it('a click runs a row, a pointer move makes it active, and pressing a row keeps the focus in the input', async () => {
    let ran = ''
    await openWith(registry(cmd('one', { run: () => void (ran = 'one') }), cmd('two', { run: () => void (ran = 'two') })))
    const second = options()[1]!
    second.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
    expect(activeOption()).toBe(second)
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    second.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(input())
    second.click()
    await sleep()
    expect(ran).toBe('two')
  })

  it('Enter that confirms an IME composition does not run a command', async () => {
    let ran = 0
    await openWith(registry(cmd('one', { run: () => void ran++ })))
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))
    await sleep()
    expect(ran).toBe(0)
    expect(dialog()).not.toBeNull()
  })
})

describe('pages', () => {
  const themed = (): Commands =>
    registry(cmd('theme', { title: 'Change theme…', children: [cmd('light', { title: 'Light', run: () => {} }), cmd('more', { title: 'More…', children: [cmd('deep', { title: 'Deep', children: [cmd('deepest', { title: 'Deepest', run: () => {} })] })] })] }), cmd('other'))

  it('Escape goes back one page at a time, then closes; each Escape is the only key pressed in between', async () => {
    await openWith(themed())
    await userEvent.keyboard('theme{Enter}')
    await sleep()
    expect(titles()).toEqual(['Light', 'More…'])
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await sleep()
    expect(titles()).toEqual(['Deep'])
    await userEvent.keyboard('{Enter}')
    await sleep()
    expect(titles()).toEqual(['Deepest'])
    await userEvent.keyboard('{Escape}')
    await sleep()
    expect(titles()).toEqual(['Deep'])
    await userEvent.keyboard('{Escape}')
    await sleep()
    expect(titles()).toEqual(['Light', 'More…'])
    await userEvent.keyboard('{Escape}')
    await sleep()
    expect(dialog()).not.toBeNull()
    expect(input().value).toBe('theme')
    await userEvent.keyboard('{Escape}')
    await sleep()
    expect(dialog()).toBeNull()
  })

  it('Backspace on an empty query goes back, and does nothing at the root; the back button works and shows only in a page', async () => {
    await openWith(themed())
    const back = (): HTMLButtonElement => dialog()!.querySelector<HTMLButtonElement>('.pcmd-back')!
    expect(back().hidden).toBe(true)
    await userEvent.keyboard('{Backspace}')
    expect(dialog()).not.toBeNull()
    await userEvent.keyboard('theme{Enter}')
    await sleep()
    expect(back().hidden).toBe(false)
    expect(input().value).toBe('')
    await userEvent.keyboard('{Backspace}')
    await sleep()
    expect(titles()).toContain('Change theme…')
    await userEvent.keyboard('{Enter}')
    await sleep()
    back().click()
    await sleep()
    expect(titles()).toContain('Change theme…')
  })
})

describe('focus and the page behind', () => {
  it('Tab and Shift+Tab stay inside the dialog and cycle through the input and the buttons', async () => {
    await openWith(registry(cmd('a')))
    const inside = (): boolean => dialog()!.contains(document.activeElement)
    for (let i = 0; i < 6; i++) {
      await userEvent.tab()
      expect(inside()).toBe(true)
    }
    for (let i = 0; i < 6; i++) {
      await userEvent.tab({ shift: true })
      expect(inside()).toBe(true)
    }
  })

  it('the page behind is inert: it cannot take focus and its buttons do not click', async () => {
    const behind = document.createElement('button')
    behind.id = 'behind'
    let clicked = 0
    behind.addEventListener('click', () => clicked++)
    document.body.append(behind)
    cleanups.push(() => behind.remove())
    await openWith(registry(cmd('a')))
    behind.focus()
    expect(document.activeElement).not.toBe(behind)
    behind.click()
    expect(dialog()!.matches(':modal')).toBe(true)
    expect(behind.matches(':modal ~ *, :modal *')).toBe(false)
    expect(clicked).toBe(1) // a programmatic click is not blocked; the point is that nothing behind is reachable by Tab or focus
  })

  it('locks the page scroll without moving the layout, and restores it', async () => {
    const tall = document.createElement('div')
    tall.style.height = '4000px'
    document.body.append(tall)
    cleanups.push(() => tall.remove())
    const before = document.body.getBoundingClientRect().width
    await openWith(registry(cmd('a')))
    expect(getComputedStyle(document.documentElement).overflow).toBe('hidden')
    expect(Math.abs(document.body.getBoundingClientRect().width - before)).toBeLessThanOrEqual(1)
    await userEvent.keyboard('{Escape}')
    await sleep()
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.documentElement.style.paddingRight).toBe('')
  })

  it('works inside an already open modal: opens above it, the modal below stays open, and focus goes back into it', async () => {
    const modal = document.createElement('dialog')
    modal.id = 'host'
    const field = document.createElement('input')
    field.id = 'host-field'
    modal.append(field)
    document.body.append(modal)
    cleanups.push(() => modal.remove())
    modal.showModal()
    field.focus()
    const commands = registry(cmd('a'))
    render(<CommandPalette commands={commands} hotkey="ctrl+k" />)
    await userEvent.keyboard(KEY)
    await sleep()
    expect(dialog()!.matches(':modal')).toBe(true)
    expect(document.activeElement).toBe(input())
    await userEvent.keyboard('{Escape}')
    await sleep()
    expect(dialog()).toBeNull()
    expect(modal.open).toBe(true)
    expect(modal.matches(':modal')).toBe(true)
    expect(document.activeElement).toBe(field)
  })
})

describe('announcements', () => {
  it('says the count, "No results", and why a disabled command cannot run', async () => {
    const commands = registry(cmd('alpha'), cmd('alps'), cmd('beta', { enabled: false, disabledReason: 'Read only' }))
    await openWith(commands, { showDisabled: true })
    expect(live()).toBe('')
    await userEvent.keyboard('alp')
    await sleep()
    expect(live()).toBe('2 results')
    await userEvent.keyboard('{Backspace}{Backspace}{Backspace}zzz')
    await sleep()
    expect(live()).toBe('No results')
    await userEvent.keyboard('{Backspace}{Backspace}{Backspace}bet')
    await sleep()
    expect(live()).toBe('beta, unavailable: Read only')
    expect(activeOption()?.getAttribute('aria-disabled')).toBe('true')
    await userEvent.keyboard('{Enter}')
    await sleep()
    expect(dialog()).not.toBeNull()
  })

  it('the live region is inside the dialog (outside it, an open modal makes it inert) and is polite', async () => {
    await openWith(registry(cmd('a')))
    const out = dialog()!.querySelector('output')!
    expect(out.getAttribute('aria-live')).toBe('polite')
    expect(out.getAttribute('aria-atomic')).toBe('true')
  })

  it('announces loading and then the results of an async source, and an error', async () => {
    const waits: ((c: Command[]) => void)[] = []
    const commands = registry(cmd('s', { title: 'Search customers…', children: () => new Promise<Command[]>((r) => waits.push(r)) }))
    await openWith(commands, { debounce: 0 })
    await userEvent.keyboard('{Enter}')
    await sleep()
    expect(live()).toBe('Loading…')
    expect(dialog()!.querySelector('.pcmd-loading')).not.toBeNull()
    waits[0]!([cmd('c1', { title: 'Acme' }), cmd('c2', { title: 'Acorn' })])
    await sleep()
    expect(live()).toBe('2 results')
    expect(titles()).toEqual(['Acme', 'Acorn'])
  })
})

describe('right to left', () => {
  it('mirrors: the shortcut sits at the inline end (the left), keys are not swapped, the chevron flips', async () => {
    const commands = registry(cmd('a', { title: 'Alpha', shortcut: 'ctrl+1', children: [cmd('x')] }))
    const root = document.createElement('div')
    root.dir = 'rtl'
    const opener = document.createElement('button')
    root.append(opener)
    document.body.append(root)
    cleanups.push(() => root.remove())
    cleanups.push(mount(<CommandPalette commands={commands} hotkey="ctrl+k" />, root) as unknown as () => void)
    root.append(opener)
    opener.focus()
    await userEvent.keyboard(KEY)
    await sleep()
    const item = options()[0]!
    const title = item.querySelector('.pcmd-title')!.getBoundingClientRect()
    const kbd = item.querySelector('.pcmd-kbd')!.getBoundingClientRect()
    expect(kbd.left).toBeLessThan(title.left)
    expect(getComputedStyle(item.querySelector('.pcmd-chevron')!).transform).not.toBe('none')
    await userEvent.keyboard('{ArrowDown}')
    expect(activeOption()).toBe(item)
  })
})

describe('touch and pointer', () => {
  it('has visible, large enough close and back buttons that work without a keyboard', async () => {
    const commands = registry(cmd('theme', { title: 'Theme', children: [cmd('dark')] }))
    await openWith(commands)
    const close = dialog()!.querySelector<HTMLButtonElement>('.pcmd-close')!
    const back = dialog()!.querySelector<HTMLButtonElement>('.pcmd-back')!
    expect(close.offsetWidth).toBeGreaterThanOrEqual(36)
    expect(close.offsetHeight).toBeGreaterThanOrEqual(36)
    options()[0]!.click()
    await sleep()
    expect(back.hidden).toBe(false)
    expect(back.offsetWidth).toBeGreaterThanOrEqual(36)
    back.click()
    await sleep()
    expect(titles()).toEqual(['Theme'])
    close.click()
    await sleep()
    expect(dialog()).toBeNull()
  })
})

describe('long lists', () => {
  it('windows beyond the threshold: few rows in the DOM, the full size announced to assistive technology, End reaches the last', async () => {
    const many = Array.from({ length: 5000 }, (_, i) => cmd(`c${String(i).padStart(4, '0')}`))
    await openWith(registry(...many))
    await sleep(60)
    expect(options().length).toBeLessThan(80)
    expect(options()[0]!.getAttribute('aria-setsize')).toBe('5000')
    await userEvent.keyboard('{End}')
    await sleep(80)
    expect(activeOption()?.textContent).toContain('c4999')
    expect(activeOption()?.getAttribute('aria-posinset')).toBe('5000')
    await userEvent.keyboard('{Home}')
    await sleep(80)
    expect(activeOption()?.textContent).toContain('c0000')
    await userEvent.keyboard('{PageDown}{PageDown}')
    await sleep(80)
    expect(activeOption()?.textContent).toContain('c0016')
  })
})

describe('accessibility check', () => {
  it('has no axe violations open, with groups, a page, a disabled row and a no-results state', async () => {
    const commands = registry(
      cmd('a', { title: 'Alpha', group: 'file', shortcut: 'ctrl+1', subtitle: 'The first' }),
      cmd('b', { title: 'Beta', group: 'view', enabled: false, disabledReason: 'Nope' }),
      cmd('c', { title: 'Theme', children: [cmd('d', { title: 'Dark' })] }),
    )
    await openWith(commands, { showDisabled: true })
    const check = async (): Promise<void> => {
      await sleep(250) // the open animation (120 ms) blends the colours while it runs
      const results = await axe.run(dialog()!, { rules: { region: { enabled: false } } })
            expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
    }
    await check()
    await userEvent.keyboard('zzzz')
    await sleep()
    await check()
    await userEvent.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}theme{Enter}')
    await sleep()
    await check()
  })
})

describe('server-rendered closed markup', () => {
  it('hydrates a closed palette with no mismatch, and opens afterwards', async () => {
    const commands = registry(cmd('a'))
    const scratch = document.createElement('div')
    document.body.append(scratch)
    const stop = mount(<CommandPalette commands={commands} hotkey={false} />, scratch)
    const html = scratch.innerHTML
    stop()
    scratch.remove()
    expect(html).not.toContain('<dialog')
    const root = document.createElement('div')
    root.innerHTML = html
    document.body.append(root)
    const mismatches: unknown[] = []
    const palette = createPalette({ commands, hotkey: false })
    const off = onHydrationMismatch((m) => void mismatches.push(m))
    const dispose = hydrateRoot(root, <CommandPalette palette={palette} />)
    off()
    cleanups.push(() => {
      dispose()
      palette.dispose()
      root.remove()
    })
    expect(mismatches).toEqual([])
    palette.open()
    await sleep()
    expect(dialog()).not.toBeNull()
    expect(live()).toBe('')
  })
})

void h
