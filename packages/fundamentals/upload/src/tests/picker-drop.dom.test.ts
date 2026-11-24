// @vitest-environment happy-dom
// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests observe events on real (happy-dom) elements
// The picker, the drop zone and `add()` against a DOM (happy-dom). happy-dom is not a browser: it cannot open a file chooser
// and its DataTransfer reports MIME types instead of "Files", so drag events here are hand-built like a browser's. The real
// chooser input, real DataTransfer and real DragEvents are covered in Chromium by `drop.browser.test.ts`.
import { effectScope } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUploader, useFileDrop, useFilePicker } from '../index'
import { fakeTransport, file } from './helpers'

afterEach(() => {
  vi.restoreAllMocks()
})

/** Put files on an input the way a browser does after a pick, and fire change. */
function pick(input: HTMLInputElement, files: File[]): void {
  const list = input.files as unknown as File[]

  list.splice(0, list.length, ...files)
  input.dispatchEvent(new Event('change'))
}

describe('useFilePicker with no rendered input', () => {
  it('open() makes one detached hidden input with the attributes, clicks it, and reuses it', () => {
    const clicks: HTMLInputElement[] = []

    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) { clicks.push(this) })
    const p = useFilePicker({ accept: ['image/*', '.pdf'], multiple: true, directory: true, capture: 'user' })

    p.open()
    p.open()
    expect(clicks).toHaveLength(2)
    expect(clicks[0]).toBe(clicks[1])
    const el = clicks[0]!

    expect(el.isConnected).toBe(false)
    expect(el.type).toBe('file')
    expect(el.hidden).toBe(true)
    expect(el.multiple).toBe(true)
    expect(el.getAttribute('accept')).toBe('image/*,.pdf')
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.getAttribute('tabindex')).toBe('-1')
    expect(el.getAttribute('capture')).toBe('user')
    expect((el as unknown as { webkitdirectory: boolean }).webkitdirectory).toBe(true)
    p.dispose()
  })

  it('a pick on the detached input sets files and calls onPick; a closed dialog calls onCancel; the same file twice works', () => {
    const clicks: HTMLInputElement[] = []

    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) { clicks.push(this) })
    const picked: string[][] = []
    const onCancel = vi.fn()
    const p = useFilePicker({ onPick: (f) => picked.push(f.map((x) => x.name)), onCancel })
    const a = file('a.txt')

    p.open()
    pick(clicks[0]!, [a])
    expect(p.files()).toEqual([a])
    expect(clicks[0]!.files).toHaveLength(0)
    pick(clicks[0]!, [a])
    expect(picked).toEqual([['a.txt'], ['a.txt']])
    clicks[0]!.dispatchEvent(new Event('cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    p.dispose()
  })

  it('dispose removes the listeners from the detached input, and a later open() makes a fresh one', () => {
    const clicks: HTMLInputElement[] = []

    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) { clicks.push(this) })
    const onPick = vi.fn()
    const onCancel = vi.fn()
    const p = useFilePicker({ onPick, onCancel })

    p.open()
    const first = clicks[0]!

    p.dispose()
    p.dispose()
    pick(first, [file('a')])
    first.dispatchEvent(new Event('cancel'))
    expect(onPick).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    expect(p.files()).toEqual([])
    p.open()
    expect(clicks[1]).not.toBe(first)
    p.dispose()
  })

  it('a picker created in a scope is disposed with it', () => {
    const clicks: HTMLInputElement[] = []

    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) { clicks.push(this) })
    const onPick = vi.fn()
    const scope = effectScope()
    const p = scope.runInScope(() => useFilePicker({ onPick }))!

    p.open()
    scope.stop()
    pick(clicks[0]!, [file('a')])
    expect(onPick).not.toHaveBeenCalled()
  })

  it('a change with no files list (a browser that clears it) picks nothing', () => {
    const p = useFilePicker()
    const input = document.createElement('input')

    input.addEventListener('change', p.inputProps.onChange as EventListener)
    Object.defineProperty(input, 'files', { value: null, configurable: true })
    input.dispatchEvent(new Event('change'))
    expect(p.files()).toEqual([])
  })
})

describe('useFilePicker with a rendered input', () => {
  it('open() clicks the input given through ref, not a detached one; ref(null) falls back to a detached one', () => {
    const clicks: HTMLInputElement[] = []

    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) { clicks.push(this) })
    const p = useFilePicker()
    const mine = document.createElement('input')
    const ref = p.inputProps.ref as (el: HTMLInputElement | null) => void

    ref(mine)
    p.open()
    expect(clicks).toEqual([mine])
    ref(null)
    p.open()
    expect(clicks[1]).not.toBe(mine)
    p.dispose()
  })

  it('the onCancel prop forwards to the option', () => {
    const onCancel = vi.fn()

    ;(useFilePicker({ onCancel }).inputProps.onCancel as () => void)()
    ;(useFilePicker().inputProps.onCancel as () => void)()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('uploader.add with DOM inputs', () => {
  it('takes a FileList, a DataTransfer and an array-like of files', () => {
    const up = createUploader({ transport: fakeTransport().transport, autoStart: false })
    const list = document.createElement('input').files!

    ;(list as unknown as File[]).push(file('a'))
    expect(up.add(list).map((f) => f.name)).toEqual(['a'])
    const dt = new DataTransfer()

    dt.items.add(file('b'))
    expect(up.add(dt).map((f) => f.name)).toEqual(['b'])
    expect(up.add({ length: 1, 0: file('c') } as never).map((f) => f.name)).toEqual(['c'])
    expect(() => up.add({ length: 'x' } as never)).toThrow(/\[Pyreon\] uploader.add: expected a FileList/)
    expect(() => up.add(null as never)).toThrow(/\[Pyreon\] uploader.add: expected a FileList/)
    up.dispose()
  })
})

describe('useFileDrop: drag over', () => {
  const ev = (items: { kind: string; type: string }[] | undefined, extra: Record<string, unknown> = {}) => {
    const dataTransfer = { types: ['Files'], items, files: [], dropEffect: 'none' }

    return { dataTransfer, preventDefault: vi.fn(), ...extra } as unknown as DragEvent & { dataTransfer: { dropEffect: string }; preventDefault: ReturnType<typeof vi.fn> }
  }
  const handlers = (d: ReturnType<typeof useFileDrop>) => d.dropProps as Record<string, (e: DragEvent) => void> & Record<string, unknown>

  it('dragover allows the drop (preventDefault) and shows copy for acceptable files, none for refused ones', () => {
    const d = useFileDrop({ accept: ['image/*'] })
    const h = handlers(d)
    const ok = ev([{ kind: 'file', type: 'image/png' }])

    expect(h['data-drop-valid']).toBeUndefined()
    h.onDragEnter!(ok)
    h.onDragOver!(ok)
    expect(ok.preventDefault).toHaveBeenCalled()
    expect(ok.dataTransfer.dropEffect).toBe('copy')
    expect(h['data-drop-valid']).toBe('true')
    h.onDragLeave!(ok)
    const bad = ev([{ kind: 'file', type: 'application/pdf' }])

    h.onDragEnter!(bad)
    h.onDragOver!(bad)
    expect(bad.dataTransfer.dropEffect).toBe('none')
    expect(h['data-drop-valid']).toBe('false')
    d.dispose()
  })

  it('a disabled zone neither takes the drag nor allows the drop', () => {
    const d = useFileDrop({ disabled: true, paste: true, onDrop: vi.fn() })
    const h = handlers(d)
    const e = ev([{ kind: 'file', type: 'image/png' }])

    h.onDragEnter!(e)
    h.onDragOver!(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(d.isOver()).toBe(false)
    const paste = { clipboardData: { items: [{ kind: 'file', getAsFile: () => file('a') }], files: [] }, preventDefault: vi.fn() }

    ;(h.onPaste as (e: unknown) => void)(paste)
    expect(paste.preventDefault).not.toHaveBeenCalled()
  })

  it('with only extensions in accept the drag cannot be judged by type, so it is allowed; a drag without items is allowed', () => {
    const d = useFileDrop({ accept: ['.png'] })
    const h = handlers(d)

    h.onDragEnter!(ev([{ kind: 'file', type: 'application/pdf' }]))
    expect(d.isValid()).toBe(true)
    d.dispose()
    const any = useFileDrop({ accept: ['image/*'], multiple: false })

    handlers(any).onDragEnter!(ev(undefined))
    expect(any.isValid()).toBe(true)
    any.dispose()
  })

  it('a drag whose types list is missing is not a file drag', () => {
    const d = useFileDrop()
    const e = { dataTransfer: { items: [] }, preventDefault: vi.fn() } as unknown as DragEvent

    handlers(d).onDragEnter!(e)
    expect(d.isOver()).toBe(false)
  })

  it('a drag that ends anywhere on the page (a real window here) resets the zone and removes the listeners', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const d = useFileDrop()
    const h = handlers(d)

    h.onDragEnter!(ev([]))
    h.onDragEnter!(ev([]))
    expect(add).toHaveBeenCalledTimes(2)
    window.dispatchEvent(new Event('drop'))
    expect(d.isOver()).toBe(false)
    expect(remove).toHaveBeenCalledTimes(2)
    d.dispose()
    expect(remove).toHaveBeenCalledTimes(2)
  })
})

describe('useFileDrop: a drop where every file is refused', () => {
  it('reports the refusals and does not call onDrop with an empty list', async () => {
    const onDrop = vi.fn()
    const onReject = vi.fn()
    const d = useFileDrop({ accept: ['image/*'], onDrop, onReject })
    const pdf = file('a.pdf', 3, 'application/pdf')

    ;(d.dropProps.onDrop as (e: unknown) => void)({ dataTransfer: { types: ['Files'], items: [{ kind: 'file', type: pdf.type, getAsFile: () => pdf }], files: [pdf] }, preventDefault() {} })
    await vi.waitFor(() => expect(onReject).toHaveBeenCalledTimes(1))
    expect(onReject.mock.calls[0]![0]).toEqual([{ file: pdf, rejection: expect.objectContaining({ code: 'type' }) }])
    expect(onDrop).not.toHaveBeenCalled()
  })
})
