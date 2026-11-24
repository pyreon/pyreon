// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests dispatch and observe real DOM events
import { afterEach, describe, expect, it } from 'vitest'
import { createUploader, useFileDrop, useFilePicker, type FileDropOptions } from '../index'
import { xhrTransport } from '../transport-xhr'

const mounted: HTMLElement[] = []

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove()
})

/** A real element tree with the drop handlers attached as DOM listeners (what a compiled JSX spread does). */
function zone(options: FileDropOptions = {}) {
  const drop = useFileDrop(options)
  const root = document.createElement('div')
  const child = document.createElement('span')

  child.textContent = 'inner'
  root.appendChild(child)
  document.body.appendChild(root)
  mounted.push(root)
  const props = drop.dropProps as Record<string, (e: Event) => void>

  for (const [key, fn] of Object.entries(props)) if (/^on[A-Z]/.test(key)) root.addEventListener(key.slice(2).toLowerCase(), fn as EventListener)

  return { drop, root, child }
}

const transfer = (...files: File[]): DataTransfer => {
  const dt = new DataTransfer()

  for (const f of files) dt.items.add(f)

  return dt
}

const fire = (el: Element, type: string, dataTransfer: DataTransfer): DragEvent => {
  const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer })

  el.dispatchEvent(e)

  return e
}

const png = (name = 'a.png'): File => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 30))

describe('drag and drop with a real DataTransfer', () => {
  it('is over while files are dragged, also over children, and judges the files while dragging', () => {
    const { drop, root, child } = zone({ accept: ['image/*'] })
    const images = transfer(png())

    fire(root, 'dragenter', images)
    expect(drop.isOver()).toBe(true)
    expect(drop.isValid()).toBe(true)
    // Moving onto a child fires dragenter on the child, then dragleave on the parent: still over.
    fire(child, 'dragenter', images)
    fire(root, 'dragleave', images)
    expect(drop.isOver()).toBe(true)
    fire(child, 'dragleave', images)
    expect(drop.isOver()).toBe(false)
    expect(drop.isValid()).toBeNull()
    fire(root, 'dragenter', transfer(new File(['x'], 'a.pdf', { type: 'application/pdf' })))
    expect(drop.isValid()).toBe(false)
    const over = fire(root, 'dragover', transfer(new File(['x'], 'a.pdf', { type: 'application/pdf' })))

    expect(over.defaultPrevented).toBe(true)
    expect(over.dataTransfer!.dropEffect).toBe('none')
  })

  it('a drop delivers the real File objects, and non-file drags are left alone', async () => {
    const got: File[] = []
    const { drop, root } = zone({ onDrop: (f) => got.push(...f) })
    const a = png('a.png')
    const b = png('b.png')
    const e = fire(root, 'drop', transfer(a, b))

    await settle()
    expect(e.defaultPrevented).toBe(true)
    expect(got.map((f) => f.name)).toEqual(['a.png', 'b.png'])
    expect(got[0]).toBe(a)
    expect(drop.isOver()).toBe(false)
    const text = new DataTransfer()

    text.setData('text/plain', 'hello')
    const t = fire(root, 'dragenter', text)

    expect(t.defaultPrevented).toBe(false)
    expect(drop.isOver()).toBe(false)
  })

  it('dropped files go straight into an uploader and are validated there', async () => {
    const up = createUploader({ transport: xhrTransport({ url: '/__u/sink?every=0' }), rules: { accept: ['image/*'] } })
    const { root } = zone({ onDrop: (f) => up.add(f) })

    fire(root, 'drop', transfer(png('ok.png'), new File(['x'], 'bad.exe', { type: 'application/x-msdownload' })))
    await settle()
    await new Promise((r) => setTimeout(r, 300))
    expect(up.files().map((f) => f.status()).sort()).toEqual(['done', 'rejected'])
    up.dispose()
  })

  it('a drag that ends outside the zone resets it', () => {
    const { drop, root } = zone()

    fire(root, 'dragenter', transfer(png()))
    expect(drop.isOver()).toBe(true)
    window.dispatchEvent(new Event('dragend'))
    expect(drop.isOver()).toBe(false)
  })

  it('paste takes a pasted image and leaves a pasted text alone', () => {
    const got: File[] = []
    const { root } = zone({ paste: true, onDrop: (f) => got.push(...f) })
    const dt = transfer(png('image.png'))
    const e = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })

    root.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(got.map((f) => f.name)).toEqual(['image.png'])
    const text = new DataTransfer()

    text.setData('text/plain', 'hi')
    const t = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: text })

    root.dispatchEvent(t)
    expect(t.defaultPrevented).toBe(false)
  })
})

describe('the file picker', () => {
  it('opens a detached input when none is rendered, and picking the same file twice works because the input is emptied', () => {
    const picked: string[][] = []
    const p = useFilePicker({ accept: ['image/*'], multiple: true, onPick: (f) => picked.push(f.map((x) => x.name)) })
    let clicks = 0
    const click = HTMLInputElement.prototype.click

    HTMLInputElement.prototype.click = function (this: HTMLInputElement) { clicks++; expect(this.type).toBe('file'); expect(this.accept).toBe('image/*'); expect(this.multiple).toBe(true) }
    try {
      p.open()
      p.open()
    } finally {
      HTMLInputElement.prototype.click = click
    }
    expect(clicks).toBe(2)
    // A rendered input: choose the same file twice; the input is emptied after each change.
    const input = document.createElement('input')

    for (const [k, v] of Object.entries(p.inputProps)) if (k === 'type') input.type = v as string
    input.addEventListener('change', p.inputProps.onChange as EventListener)
    document.body.appendChild(input)
    mounted.push(input)
    const file = png('same.png')

    for (let i = 0; i < 2; i++) {
      const dt = transfer(file)

      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      expect(input.files!.length).toBe(0)
      expect(input.value).toBe('')
    }
    expect(picked).toEqual([['same.png'], ['same.png']])
    expect(p.files()[0]).toBe(file)
    p.dispose()
  })

  it('reports a cancelled dialog', () => {
    let cancelled = 0
    const p = useFilePicker({ onCancel: () => cancelled++ })
    const input = document.createElement('input')

    input.type = 'file'
    input.addEventListener('cancel', p.inputProps.onCancel as EventListener)
    input.dispatchEvent(new Event('cancel'))
    expect(cancelled).toBe(1)
  })
})

describe('object URLs of previews', () => {
  it('every URL created for a preview is revoked on remove, clear and dispose', async () => {
    const created = new Set<string>()
    const revoked = new Set<string>()
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)

    URL.createObjectURL = ((b: Blob) => { const u = create(b); created.add(u); return u }) as never
    URL.revokeObjectURL = ((u: string) => { revoked.add(u); revoke(u) }) as never
    try {
      const up = createUploader({ transport: { upload: () => new Promise(() => {}) }, preview: true })
      const [a, b, c] = up.add([png('a.png'), png('b.png'), png('c.png')])

      expect(created.size).toBe(3)
      expect(await fetch(a!.preview()!).then((r) => r.blob()).then((x) => x.size)).toBe(3)
      up.remove(a!.id)
      expect(revoked.has(created.values().next().value!)).toBe(true)
      up.clear()
      up.add([png('d.png')])
      up.dispose()
      expect(revoked.size).toBe(created.size)
      expect([b, c].every((f) => f!.preview() === null)).toBe(true)
    } finally {
      URL.createObjectURL = create
      URL.revokeObjectURL = revoke
    }
  })
})
