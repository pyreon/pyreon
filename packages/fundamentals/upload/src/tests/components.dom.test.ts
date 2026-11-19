// @vitest-environment happy-dom
// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests dispatch and observe DOM events on mounted elements
// <FileDrop> and <FilePicker> mounted with the real h() and mount() in happy-dom. happy-dom is not a browser: it opens no file
// dialog and its DataTransfer reports MIME types instead of "Files", so drops are dispatched as events carrying a hand-built
// DataTransfer, and picks put files on the real hidden input. The real path (real DragEvent and DataTransfer, real focus,
// keyboard through userEvent, axe, hydration) is `components.browser.test.tsx` and `components-edge.browser.test.tsx` in Chromium.
import { h, type VNodeChild } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileDrop, type FileIntakeProps, type FileIntakeState, FilePicker } from '../components'
import { describeIntake } from '../intake'

const cleanups: (() => void)[] = []

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  vi.restoreAllMocks()
})

function render(node: VNodeChild): HTMLElement {
  const root = document.createElement('div')

  document.body.appendChild(root)
  const unmount = mount(node as never, root)

  cleanups.push(() => {
    unmount()
    root.remove()
  })

  return root
}

const drop = (props: FileIntakeProps, ...children: VNodeChild[]) => render(h(FileDrop as never, props as Record<string, unknown>, ...children))
const picker = (props: FileIntakeProps, ...children: VNodeChild[]) => render(h(FilePicker as never, props as Record<string, unknown>, ...children))
const png = (name = 'a.png'): File => new File([new Uint8Array(3)], name, { type: 'image/png' })
const pdf = (name = 'a.pdf'): File => new File([new Uint8Array(3)], name, { type: 'application/pdf' })

const zoneOf = (root: HTMLElement): HTMLElement => root.querySelector('[role="button"]')!
const inputOf = (root: HTMLElement): HTMLInputElement => root.querySelector('input[type="file"]')!
const liveOf = (root: HTMLElement): HTMLOutputElement | null => root.querySelector('output')

/** A drag event as a browser sends it: `types` has "Files" and `items` describe the dragged files. */
function dragEvent(type: string, files: File[]): Event {
  const e = new Event(type, { bubbles: true, cancelable: true })
  const data = { types: ['Files'], files, items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })), dropEffect: 'none' }

  Object.defineProperty(e, 'dataTransfer', { value: data })

  return e
}

/** What a pick does: the browser puts the files on the input and fires change. */
function pick(input: HTMLInputElement, files: File[]): void {
  const list = input.files as unknown as File[]

  list.splice(0, list.length, ...files)
  // A real change event bubbles; the framework may listen higher up.
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

function clicks(): HTMLInputElement[] {
  const seen: HTMLInputElement[] = []

  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) { seen.push(this) })

  return seen
}

describe('<FileDrop>: markup and ARIA', () => {
  it('a labelled role=button zone in the tab order, a hidden file input, and a visually hidden polite live region', () => {
    const root = drop({ accept: ['image/*', '.PDF'] }, 'Drop files')
    const zone = zoneOf(root)

    expect(zone.getAttribute('tabindex')).toBe('0')
    expect(zone.getAttribute('aria-label')).toBe('Upload files')
    expect(zone.hasAttribute('aria-disabled')).toBe(false)
    expect(zone.hasAttribute('aria-busy')).toBe(false)
    expect(zone.textContent).toBe('Drop files')
    const input = inputOf(root)

    expect(input.hidden).toBe(true)
    expect(input.getAttribute('tabindex')).toBe('-1')
    expect(input.getAttribute('aria-hidden')).toBe('true')
    expect(input.getAttribute('accept')).toBe('image/*,.PDF')
    expect(input.multiple).toBe(true)
    const live = liveOf(root)!

    expect(live.getAttribute('aria-live')).toBe('polite')
    expect(live.getAttribute('aria-atomic')).toBe('true')
    expect(live.style.position).toBe('absolute')
    expect(live.style.width).toBe('1px')
    expect(live.textContent).toBe('')
  })

  it('label, labelledby (which replaces the label), busy, class, disabled, single file and folders', () => {
    const root = drop({ label: 'Upload photos', busy: true, class: 'zone', multiple: false, directories: true })
    const zone = zoneOf(root)

    expect(zone.getAttribute('aria-label')).toBe('Upload photos')
    expect(zone.getAttribute('aria-busy')).toBe('true')
    expect(zone.className).toBe('zone')
    expect(inputOf(root).multiple).toBe(false)
    expect(inputOf(root).hasAttribute('webkitdirectory')).toBe(true)
    expect(inputOf(drop({})).hasAttribute('webkitdirectory')).toBe(false)
    const named = zoneOf(drop({ label: 'ignored', labelledby: 'title' }))

    expect(named.getAttribute('aria-labelledby')).toBe('title')
    expect(named.hasAttribute('aria-label')).toBe(false)
    const empty = zoneOf(drop({ label: '' }))

    expect(empty.getAttribute('aria-label')).toBe('Upload files')
    const off = zoneOf(drop({ disabled: true }))

    expect(off.getAttribute('tabindex')).toBe('-1')
    expect(off.getAttribute('aria-disabled')).toBe('true')
    expect(off.hasAttribute('data-disabled')).toBe(true)
  })

  it('live={false} renders no region (place your own with state.liveRegionProps); liveClass styles it instead of hiding it', () => {
    let state!: FileIntakeState

    expect(liveOf(drop({ live: false, children: (s) => { state = s; return 'x' } }))).toBeNull()
    expect(state.liveRegionProps).toEqual({ role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', 'data-pyreon-live': '' })
    const live = liveOf(drop({ liveClass: 'sr' }))!

    expect(live.className).toBe('sr')
    expect(live.hasAttribute('style')).toBe(false)
  })
})

describe('<FileDrop>: opening the dialog', () => {
  it('click, Enter and Space open the picker on the hidden input; a held key, other keys and a disabled zone do not', () => {
    const seen = clicks()
    const root = drop({})
    const zone = zoneOf(root)

    zone.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })

    zone.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(true)
    zone.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true }))
    zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(seen).toEqual([inputOf(root), inputOf(root), inputOf(root)])
    const off = zoneOf(drop({ disabled: true }))

    off.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    off.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(seen).toHaveLength(3)
  })

  it('children as a function get the state: open() opens the dialog', () => {
    const seen = clicks()
    let state!: FileIntakeState
    const root = drop({ children: (s) => { state = s; return 'zone' } })

    state.open()
    expect(seen).toEqual([inputOf(root)])
  })
})

describe('<FileDrop>: taking files', () => {
  it('a drop takes the accepted files (accept ignores case), announces them, and returns focus to the zone', async () => {
    const onFiles = vi.fn()
    // Both sides vary in case: the pattern (as an app may write it) and the name (as a camera writes it).
    const root = drop({ accept: ['.PNG'], onFiles })
    const zone = zoneOf(root)
    const a = png('photo.Png')

    zone.dispatchEvent(dragEvent('drop', [a]))
    await settle()
    expect(onFiles).toHaveBeenCalledWith([a])
    expect(liveOf(root)!.textContent).toBe('1 file added.')
    expect(document.activeElement).toBe(zone)
    expect(zone.hasAttribute('data-has-rejections')).toBe(false)
  })

  it('refused files are reported with every reason: onReject, the rejected slot, the announcement and data-has-rejections', async () => {
    const onFiles = vi.fn()
    const onReject = vi.fn()
    const root = drop({ accept: ['image/*'], rules: { maxSize: 2 }, onFiles, onReject, rejected: (list) => h('ul', { class: 'why' }, ...list.map((r) => h('li', null, `${r.file.name}: ${r.rejections.map((x) => x.code).join(',')}`))) })
    const zone = zoneOf(root)

    zone.dispatchEvent(dragEvent('drop', [png('a.png'), pdf('b.pdf')]))
    await settle()
    expect(onFiles).not.toHaveBeenCalled()
    expect(onReject.mock.calls[0]![0].map((r: { file: File }) => r.file.name)).toEqual(['a.png', 'b.pdf'])
    expect([...root.querySelectorAll('.why li')].map((li) => li.textContent)).toEqual(['a.png: too-large', 'b.pdf: too-large,type'])
    expect(liveOf(root)!.textContent).toMatch(/^2 files were not accepted\. a\.png: The file is 3 B; the limit is 2 B\. b\.pdf: /)
    expect(zone.hasAttribute('data-has-rejections')).toBe(true)
  })

  it('with multiple={false} the first file is taken and the others refused as too many', async () => {
    const onFiles = vi.fn()
    const onReject = vi.fn()
    const root = drop({ multiple: false, onFiles, onReject })

    zoneOf(root).dispatchEvent(dragEvent('drop', [png('a.png'), png('b.png')]))
    await settle()
    expect(onFiles.mock.calls[0]![0].map((f: File) => f.name)).toEqual(['a.png'])
    expect(onReject.mock.calls[0]![0][0].rejections[0].code).toBe('too-many')
    expect(liveOf(root)!.textContent).toMatch(/^1 file added\. 1 file was not accepted\. b\.png: At most 1 file is allowed\.$/)
  })

  it('state.clearRejections empties the reasons and the announcement', async () => {
    let state!: FileIntakeState
    const root = drop({ accept: ['image/*'], children: (s) => { state = s; return 'x' } })

    zoneOf(root).dispatchEvent(dragEvent('drop', [pdf()]))
    await settle()
    expect(state.rejections()).toHaveLength(1)
    state.clearRejections()
    expect(state.rejections()).toEqual([])
    expect(state.announcement()).toBe('')
    await settle()
    expect(zoneOf(root).hasAttribute('data-has-rejections')).toBe(false)
  })

  it('a pick through the hidden input goes through the same rules', async () => {
    const onFiles = vi.fn()
    const root = drop({ accept: ['image/*'], onFiles })

    pick(inputOf(root), [png()])
    await settle()
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(zoneOf(root))
  })

  it('paste is taken only with paste; a disabled zone takes nothing', async () => {
    const onFiles = vi.fn()
    const pasteEvent = (f: File): Event => {
      const e = new Event('paste', { bubbles: true, cancelable: true })

      Object.defineProperty(e, 'clipboardData', { value: { items: [{ kind: 'file', getAsFile: () => f }], files: [f] } })

      return e
    }
    const on = drop({ paste: true, onFiles })

    zoneOf(on).dispatchEvent(pasteEvent(png()))
    await settle()
    expect(onFiles).toHaveBeenCalledTimes(1)
    zoneOf(drop({ onFiles })).dispatchEvent(pasteEvent(png()))
    const off = drop({ disabled: true, onFiles })

    zoneOf(off).dispatchEvent(dragEvent('drop', [png()]))
    pick(inputOf(off), [png()])
    await settle()
    expect(onFiles).toHaveBeenCalledTimes(1)
  })

  it('dragging over shows data-drag-over and data-drop-valid and isOver in the state; leaving clears them', () => {
    let state!: FileIntakeState
    const root = drop({ accept: ['image/*'], children: (s) => { state = s; return 'x' } })
    const zone = zoneOf(root)

    zone.dispatchEvent(dragEvent('dragenter', [pdf()]))
    expect(zone.getAttribute('data-drag-over')).toBe('true')
    expect(zone.getAttribute('data-drop-valid')).toBe('false')
    expect(state.isOver()).toBe(true)
    expect(state.isValid()).toBe(false)
    zone.dispatchEvent(dragEvent('dragleave', [pdf()]))
    expect(zone.hasAttribute('data-drag-over')).toBe(false)
    expect(zone.hasAttribute('data-drop-valid')).toBe(false)
  })

  it('a drop with no files does nothing', async () => {
    const onFiles = vi.fn()
    const root = drop({ onFiles })

    zoneOf(root).dispatchEvent(dragEvent('drop', []))
    await settle()
    expect(onFiles).not.toHaveBeenCalled()
    expect(liveOf(root)!.textContent).toBe('')
  })
})

describe('<FileDrop>: failures stay inside', () => {
  it('rules that cannot be applied are announced as "could not be checked", and the app is told in the console', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onFiles = vi.fn()
    const root = drop({ rules: { maxSize: 'huge' }, onFiles })

    zoneOf(root).dispatchEvent(dragEvent('drop', [png()]))
    await settle()
    expect(liveOf(root)!.textContent).toBe('The files could not be checked.')
    expect(onFiles).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('could not be applied'), expect.anything())
  })

  it('an onFiles that throws is contained and reported; the announcement still happens', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const root = drop({ onFiles: () => { throw new Error('app bug') } })

    zoneOf(root).dispatchEvent(dragEvent('drop', [png()]))
    await settle()
    expect(liveOf(root)!.textContent).toBe('1 file added.')
    expect(error).toHaveBeenCalledWith('[Pyreon] upload: a callback threw', expect.any(Error))
  })

  it('unmounting while a check is running delivers nothing afterwards', async () => {
    let pass!: (v: string | null) => void
    const onFiles = vi.fn()
    const root = drop({ rules: { custom: () => new Promise((r) => { pass = r }) }, onFiles })

    zoneOf(root).dispatchEvent(dragEvent('drop', [png()]))
    await settle()
    for (const c of cleanups.splice(0)) c()
    pass(null)
    await settle()
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('unmounting while bad rules are being applied announces nothing; files that arrive after unmount are ignored', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let state!: FileIntakeState
    const root = drop({ rules: { maxSize: 'huge' }, children: (s) => { state = s; return 'x' } })
    const input = inputOf(root)

    // A pick starts the check synchronously; the unmount lands before the check fails.
    pick(input, [png()])
    for (const c of cleanups.splice(0)) c()
    await settle()
    expect(error).toHaveBeenCalledTimes(1)
    expect(state.announcement()).toBe('')
    pick(input, [png()])
    await settle()
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('quick successive drops each deliver their files; the reasons and the announcement are those of the latest', async () => {
    const releases: (() => void)[] = []
    const onFiles = vi.fn()
    let state!: FileIntakeState
    const root = drop({ rules: { custom: (f) => new Promise((r) => { releases.push(() => r((f as File).name === 'bad.png' ? 'nope' : null)) }) }, onFiles, children: (s) => { state = s; return 'x' } })
    const zone = zoneOf(root)

    zone.dispatchEvent(dragEvent('drop', [png('bad.png'), png('first.png')]))
    await settle()
    zone.dispatchEvent(dragEvent('drop', [png('second.png')]))
    await settle()
    releases[2]!()
    await settle()
    for (const r of releases.slice(0, 2)) r()
    await settle()
    expect(onFiles.mock.calls.map((c) => c[0].map((f: File) => f.name))).toEqual([['second.png'], ['first.png']])
    expect(state.rejections()).toEqual([])
    expect(state.announcement()).toBe('1 file added.')
  })
})

describe('<FilePicker>', () => {
  it('is a native button that opens the dialog; picking takes the files and returns focus to the button', async () => {
    const seen = clicks()
    const onFiles = vi.fn()
    const root = picker({ label: 'Choose a photo', busy: true, class: 'pick', accept: ['image/*'], onFiles }, 'Choose')
    const button = root.querySelector('button')!

    expect(button.type).toBe('button')
    expect(button.getAttribute('aria-label')).toBe('Choose a photo')
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.className).toBe('pick')
    expect(button.disabled).toBe(false)
    expect(button.textContent).toBe('Choose')
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(seen).toEqual([inputOf(root)])
    pick(inputOf(root), [png()])
    await settle()
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(button)
  })

  it('a refused pick shows the reasons and data-has-rejections; disabled is the native attribute', async () => {
    const root = picker({ accept: ['image/*'], rejected: (list) => h('p', { class: 'why' }, list.map((r) => r.rejections[0]!.message).join(' ')) })

    pick(inputOf(root), [pdf()])
    await settle()
    expect(root.querySelector('.why')!.textContent).toMatch(/not accepted/)
    expect(root.querySelector('button')!.hasAttribute('data-has-rejections')).toBe(true)
    expect(picker({ disabled: true }).querySelector('button')!.disabled).toBe(true)
  })
})

describe('describeIntake', () => {
  it('counts in words, singular and plural, taken first', () => {
    const r = (name: string) => ({ file: png(name), rejections: [{ code: 'type' as const, message: 'Wrong type.', params: {} }] })

    expect(describeIntake(0, [])).toBe('')
    expect(describeIntake(1, [])).toBe('1 file added.')
    expect(describeIntake(3, [r('a'), r('b')])).toBe('3 files added. 2 files were not accepted. a: Wrong type. b: Wrong type.')
  })
})
