/**
 * State-machine coverage for `FileUploadBase` — the headless file-upload
 * primitive. It exposes a `FileUploadState` object (files signal, filtering by
 * accept/maxSize/maxFiles, drag state, clear/removeFile, dropZoneProps +
 * inputProps handlers). The tests drive that object directly with real `File`
 * objects (happy-dom supports `File`), exercising the filter matrix + handlers
 * — pure logic that runs identically in happy-dom and Chromium.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { FileUploadBase, type FileUploadState } from './index'

// dropZoneProps is typed Record<string, unknown> (it is spread, not called, in
// real usage) — cast its handlers to a callable when invoking them directly.
type Fn = (...args: unknown[]) => void

const mount = (props: Record<string, unknown> = {}): FileUploadState => {
  let captured: FileUploadState | undefined
  mountInBrowser(
    h(FileUploadBase as never, {
      ...props,
      children: (s: FileUploadState) => {
        captured = s
        return h('div', null)
      },
    }),
  )
  if (!captured) throw new Error('render child did not run')
  return captured
}

const file = (name: string, type = '', size = 10): File =>
  new File(['x'.repeat(size)], name, { type })

/** Fire the hidden <input>'s onChange with a set of selected files. */
const pickFiles = (s: FileUploadState, files: File[]) =>
  s.inputProps.onChange({ target: { files, value: '' } } as unknown as Event)

/** Cast + invoke a dropZoneProps handler. */
const dz = (s: FileUploadState, name: string, e: unknown) =>
  (s.dropZoneProps[name] as Fn | undefined)?.(e)

describe('FileUploadBase — filtering', () => {
  it('accept: extension (.png), wildcard (image/*), and exact (text/plain) patterns', () => {
    const got: File[][] = []
    const s = mount({
      accept: ['.png', 'image/*', 'text/plain'],
      onChange: (fs: File[]) => got.push(fs),
    })
    pickFiles(s, [
      file('a.png', ''), // matches .png extension
      file('b.jpg', 'image/jpeg'), // matches image/*
      file('c.txt', 'text/plain'), // matches exact
      file('d.pdf', 'application/pdf'), // matches nothing → dropped
    ])
    expect(s.files().map((f) => f.name)).toEqual(['a.png', 'b.jpg', 'c.txt'])
    expect(got[0]?.map((f) => f.name)).toEqual(['a.png', 'b.jpg', 'c.txt'])
  })

  it('maxSize drops oversized files', () => {
    const s = mount({ maxSize: 20 })
    pickFiles(s, [file('small.txt', '', 10), file('big.txt', '', 50)])
    expect(s.files().map((f) => f.name)).toEqual(['small.txt'])
  })

  it('maxFiles truncates to the first N', () => {
    const s = mount({ maxFiles: 2 })
    pickFiles(s, [file('1'), file('2'), file('3')])
    expect(s.files().map((f) => f.name)).toEqual(['1', '2'])
  })

  it('disabled: selecting files is a no-op (onChange never fires)', () => {
    const got: File[][] = []
    const s = mount({ disabled: true, onChange: (fs: File[]) => got.push(fs) })
    pickFiles(s, [file('a.txt')])
    expect(s.files()).toEqual([])
    expect(got).toEqual([])
  })
})

describe('FileUploadBase — files list ops', () => {
  it('clear empties the list + fires onChange([])', () => {
    const got: File[][] = []
    const s = mount({ onChange: (fs: File[]) => got.push(fs) })
    pickFiles(s, [file('a'), file('b')])
    s.clear()
    expect(s.files()).toEqual([])
    expect(got[got.length - 1]).toEqual([])
  })

  it('removeFile drops the file at the given index', () => {
    const s = mount()
    pickFiles(s, [file('a'), file('b'), file('c')])
    s.removeFile(1)
    expect(s.files().map((f) => f.name)).toEqual(['a', 'c'])
  })
})

describe('FileUploadBase — drop zone', () => {
  it('onDrop reads dataTransfer.files through the filter', () => {
    const s = mount({ maxFiles: 1 })
    dz(s, 'onDragOver', { preventDefault() {} })
    expect(s.isDragging()).toBe(true)
    dz(s, 'onDrop', {
      preventDefault() {},
      dataTransfer: { files: [file('x'), file('y')] },
    })
    expect(s.isDragging()).toBe(false)
    expect(s.files().map((f) => f.name)).toEqual(['x']) // maxFiles: 1
  })

  it('onDragLeave clears the dragging flag; a disabled zone never drags', () => {
    const s = mount()
    dz(s, 'onDragOver', { preventDefault() {} })
    dz(s, 'onDragLeave', {})
    expect(s.isDragging()).toBe(false)

    const dis = mount({ disabled: true })
    dz(dis, 'onDragOver', { preventDefault() {} })
    expect(dis.isDragging()).toBe(false)
  })

  it('dropZoneProps ARIA: role=button, tabIndex, aria-label (default + custom), disabled/busy', () => {
    const s = mount()
    const p = s.dropZoneProps as Record<string, unknown>
    expect(p.role).toBe('button')
    expect(p.tabIndex).toBe(0)
    expect(String(p['aria-label'])).toMatch(/drag and drop/i)
    expect(p['aria-disabled']).toBeUndefined()
    expect(p['aria-busy']).toBeUndefined()

    const dis = mount({ disabled: true, busy: true, label: 'Drop CSVs' })
      .dropZoneProps as Record<string, unknown>
    expect(dis.tabIndex).toBe(-1)
    expect(dis['aria-label']).toBe('Drop CSVs')
    expect(dis['aria-disabled']).toBe('true')
    expect(dis['aria-busy']).toBe('true')
  })

  it('Enter/Space on the zone open the picker (no-op openPicker when input absent); disabled bails', () => {
    const s = mount()
    expect(() => dz(s, 'onKeyDown', { key: 'Enter', preventDefault() {} })).not.toThrow()
    expect(() => dz(s, 'onKeyDown', { key: ' ', preventDefault() {} })).not.toThrow()
    const dis = mount({ disabled: true })
    expect(() => dz(dis, 'onKeyDown', { key: 'Enter', preventDefault() {} })).not.toThrow()
  })
})

describe('FileUploadBase — inputProps + openPicker + degenerate children', () => {
  it('inputProps carries type=file, multiple, and joined accept', () => {
    const s = mount({ multiple: true, accept: ['.png', '.jpg'] })
    expect(s.inputProps.type).toBe('file')
    expect(s.inputProps.multiple).toBe(true)
    expect(s.inputProps.accept).toBe('.png,.jpg')
  })

  it('openPicker clicks the registered input when enabled, and bails when disabled', () => {
    let clicks = 0
    const s = mount()
    const fake = { click: () => clicks++ } as unknown as HTMLInputElement
    s.inputRef(fake)
    s.openPicker()
    expect(clicks).toBe(1)

    const dis = mount({ disabled: true })
    dis.inputRef(fake)
    dis.openPicker()
    expect(clicks).toBe(1) // unchanged — disabled never opens
  })

  it('renders null (no throw) when children is not a render function', () => {
    expect(() => mountInBrowser(h(FileUploadBase as never, {}))).not.toThrow()
  })
})
