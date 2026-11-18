import { effect } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUploader, useFileDrop, useFilePicker, useUploader } from '../index'
import { fakeTransport, file, flush } from './helpers'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const types = (...t: string[]) => ({ types: t, items: [], files: [] })

const dragEvent = (data: ReturnType<typeof types> | null) => {
  const e = { dataTransfer: data, prevented: false, preventDefault() { this.prevented = true } }

  return e as unknown as DragEvent & { prevented: boolean }
}

const dropData = (files: File[]) => ({ types: ['Files'], files, items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })) })

describe('the server: creating things is inert', () => {
  it('creates an uploader, a picker and a drop zone with no browser API and no timers', () => {
    vi.useFakeTimers()
    expect(typeof window).toBe('undefined')
    const up = createUploader({ transport: fakeTransport().transport })
    const picker = useFilePicker({ accept: ['image/*'], multiple: true })
    const drop = useFileDrop({ accept: ['image/*'], paste: true })
    const second = useUploader({ transport: fakeTransport().transport })

    expect(up.files()).toEqual([])
    expect(up.status()).toBe('idle')
    expect(up.progress()).toEqual({ loaded: 0, total: 0, ratio: 0 })
    expect(() => picker.open()).not.toThrow()
    expect(picker.files()).toEqual([])
    expect(picker.inputProps).toMatchObject({ type: 'file', multiple: true, accept: 'image/*', hidden: true })
    expect(drop.isOver()).toBe(false)
    expect(drop.isValid()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    for (const x of [up, second]) x.dispose()
    picker.dispose()
    drop.dispose()
  })
})

describe('useFilePicker', () => {
  it('describes a hidden, correctly wired input, with directory and capture', () => {
    const p = useFilePicker({ directory: true, capture: 'environment' })

    expect(p.inputProps).toMatchObject({ webkitdirectory: true, capture: 'environment', multiple: false, 'aria-hidden': 'true', tabIndex: -1 })
    expect(useFilePicker({ capture: true }).inputProps.capture).toBe('')
    expect(useFilePicker({ multiple: true }).inputProps).not.toHaveProperty('accept')
  })

  it('copies the files out before emptying the input, so picking the same file again fires change', () => {
    const picked: File[][] = []
    const p = useFilePicker({ onPick: (f) => picked.push(f) })
    const a = file('a')
    const input = { files: [a], value: 'C:\\a' }

    ;(p.inputProps.onChange as (e: unknown) => void)({ target: input })
    expect(input.value).toBe('')
    expect(p.files()).toEqual([a])
    expect(picked).toEqual([[a]])
  })
})

describe('useFileDrop', () => {
  it('counts enter and leave across child elements so it does not flicker', () => {
    const d = useFileDrop()
    const p = d.dropProps as Record<string, (e: DragEvent) => void>
    const over: boolean[] = []
    const stop = effect(() => { over.push(d.isOver()) })
    const ev = () => dragEvent(types('Files'))

    p.onDragEnter!(ev())
    p.onDragEnter!(ev())
    p.onDragLeave!(ev())
    expect(d.isOver()).toBe(true)
    p.onDragLeave!(ev())
    expect(d.isOver()).toBe(false)
    expect(over).toEqual([false, true, false])
    p.onDragLeave!(ev())
    expect(d.isOver()).toBe(false)
    stop.dispose()
  })

  it('ignores drags that are not files (text, links) and lets the page keep them', () => {
    const d = useFileDrop()
    const p = d.dropProps as Record<string, (e: DragEvent) => void>
    const e = dragEvent(types('text/plain'))

    p.onDragEnter!(e)
    p.onDragOver!(e)
    expect(d.isOver()).toBe(false)
    expect(e.prevented).toBe(false)
  })

  it('judges the dragged types against accept and the count against multiple while dragging', () => {
    const img = { kind: 'file', type: 'image/png' }
    const pdf = { kind: 'file', type: 'application/pdf' }
    const none = { kind: 'file', type: '' }
    const d = useFileDrop({ accept: ['image/*'], multiple: false })
    const p = d.dropProps as Record<string, (e: DragEvent) => void>
    const enter = (items: unknown[]) => { p.onDragEnter!(dragEvent({ types: ['Files'], items, files: [] } as never)); const v = d.isValid(); p.onDragLeave!(dragEvent(types('Files'))); return v }

    expect(enter([img])).toBe(true)
    expect(enter([pdf])).toBe(false)
    expect(enter([img, img])).toBe(false)
    expect(enter([none])).toBe(true)
    expect(d.isValid()).toBeNull()
  })

  it('a drop hands accepted files to onDrop and refused ones to onReject, keeping the first when only one is allowed', async () => {
    const got: File[][] = []
    const refused: string[] = []
    const d = useFileDrop({ accept: ['image/*'], multiple: false, onDrop: (f) => got.push(f), onReject: (r) => refused.push(...r.map((x) => `${x.file.name}:${x.rejection.code}`)) })
    const p = d.dropProps as Record<string, (e: DragEvent) => void>
    const a = file('a.png', 5, 'image/png')
    const b = file('b.png', 5, 'image/png')
    const c = file('c.pdf', 5, 'application/pdf')
    const e = dragEvent(dropData([a, b, c]) as never)

    p.onDrop!(e)
    await flush()
    expect(e.prevented).toBe(true)
    expect(got).toEqual([[a]])
    expect(refused).toEqual(['b.png:too-many', 'c.pdf:type'])
    expect(d.isOver()).toBe(false)
  })

  it('a disabled zone does nothing; paste is opt in and only takes files', async () => {
    const got: File[][] = []
    const off = useFileDrop({ disabled: true, onDrop: (f) => got.push(f) })
    const e = dragEvent(dropData([file('a')]) as never)

    ;(off.dropProps as Record<string, (e: DragEvent) => void>).onDrop!(e)
    await flush()
    expect(got).toEqual([])
    expect(e.prevented).toBe(false)
    expect(useFileDrop().dropProps).not.toHaveProperty('onPaste')
    const on = useFileDrop({ paste: true, onDrop: (f) => got.push(f) })
    const onPaste = on.dropProps.onPaste as (e: ClipboardEvent) => void
    const img = file('image.png', 4, 'image/png')
    const text = { clipboardData: { items: [{ kind: 'string' }], files: [] }, preventDefault: vi.fn() }
    const pic = { clipboardData: { items: [{ kind: 'file', getAsFile: () => img }], files: [] }, preventDefault: vi.fn() }

    onPaste(text as never)
    expect(text.preventDefault).not.toHaveBeenCalled()
    onPaste(pic as never)
    expect(pic.preventDefault).toHaveBeenCalled()
    expect(got).toEqual([[img]])
  })

  it('exposes reactive data attributes and removes its window listeners when the drag ends elsewhere', () => {
    const target = new EventTarget()
    const add = vi.spyOn(target, 'addEventListener')
    const remove = vi.spyOn(target, 'removeEventListener')

    vi.stubGlobal('window', target)
    const d = useFileDrop()
    const p = d.dropProps as Record<string, unknown> & { onDragEnter(e: DragEvent): void }

    expect(p['data-drag-over']).toBeUndefined()
    p.onDragEnter(dragEvent(types('Files')))
    expect(p['data-drag-over']).toBe('true')
    expect(p['data-drop-valid']).toBe('true')
    expect(add).toHaveBeenCalledTimes(2)
    target.dispatchEvent(new Event('dragend'))
    expect(d.isOver()).toBe(false)
    expect(p['data-drag-over']).toBeUndefined()
    expect(remove).toHaveBeenCalledTimes(2)
  })
})
