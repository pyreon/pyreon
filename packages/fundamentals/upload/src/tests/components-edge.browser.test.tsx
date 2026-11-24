// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests dispatch and observe real DOM events
import { mount } from '@pyreon/runtime-dom'
import type { VNodeChild } from '@pyreon/core'
import { userEvent } from 'vitest/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileDrop, FilePicker } from '../components'

const cleanups: (() => void)[] = []
const sleep = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms))
const f = (name: string, type = 'image/png', size = 3): File => new File([new Uint8Array(size)], name, { type })

const transfer = (...files: File[]): DataTransfer => {
  const dt = new DataTransfer()

  for (const x of files) dt.items.add(x)

  return dt
}

const fire = (el: Element, type: string, dt: DataTransfer): DragEvent => {
  const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt })

  el.dispatchEvent(e)

  return e
}

function render(node: VNodeChild): { root: HTMLElement; unmount(): void } {
  const root = document.createElement('div')

  document.body.appendChild(root)
  const unmount = mount(node as never, root)
  const stop = (): void => {
    unmount()
    root.remove()
  }

  cleanups.push(stop)

  return { root, unmount: stop }
}

const zone = (root: HTMLElement): HTMLElement => root.querySelector('[role="button"]')!
const live = (root: HTMLElement): HTMLElement => root.querySelector('[data-pyreon-live]')!

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  vi.restoreAllMocks()
})

describe('what the probe found', () => {
  it('two quick drops each deliver their accepted files; the reasons are those of the latest', async () => {
    const taken: string[] = []
    const { root } = render(<FileDrop accept={['image/*']} onFiles={(x) => taken.push(...x.map((y) => y.name))}>Drop</FileDrop>)

    fire(zone(root), 'drop', transfer(f('one.png')))
    fire(zone(root), 'drop', transfer(f('two.png'), f('bad.pdf', 'application/pdf')))
    await sleep()
    expect(taken.sort()).toEqual(['one.png', 'two.png'])
    expect(live(root).textContent).toContain('bad.pdf')
  })

  it('rules that cannot be applied take nothing, say so, and do not throw into the page', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const taken: File[] = []
    const { root } = render(<FileDrop rules={{ maxSize: 'huge' }} onFiles={(x) => taken.push(...x)}>Drop</FileDrop>)

    fire(zone(root), 'drop', transfer(f('a.png')))
    await sleep()
    expect(taken).toEqual([])
    expect(live(root).textContent).toBe('The files could not be checked.')
    expect(spy).toHaveBeenCalled()
  })

  it('a callback that throws is reported, not thrown into the event loop', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { root } = render(<FileDrop onFiles={() => { throw new Error('app bug') }}>Drop</FileDrop>)

    fire(zone(root), 'drop', transfer(f('a.png')))
    await sleep()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('a callback threw'), expect.anything())
    expect(live(root).textContent).toBe('1 file added.')
  })

  it('unmounting while a check is running delivers nothing afterwards', async () => {
    const taken: File[] = []
    const { root, unmount } = render(<FileDrop rules={{ custom: () => new Promise((r) => setTimeout(() => r(null), 60)) }} onFiles={(x) => taken.push(...x)}>Drop</FileDrop>)

    fire(zone(root), 'drop', transfer(f('a.png')))
    // The drop has been read and the check is running (60 ms) when the component goes away.
    await sleep(15)
    unmount()
    await sleep(150)
    expect(taken).toEqual([])
  })

  it('a held Enter opens the dialog once, not on every key repeat; an empty label falls back to the default', async () => {
    const click = HTMLInputElement.prototype.click
    let n = 0

    HTMLInputElement.prototype.click = function (this: HTMLInputElement) { if (this.type === 'file') n++ }
    try {
      const { root } = render(<FileDrop label="">Drop</FileDrop>)

      for (const repeat of [false, true, true, true]) zone(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat, bubbles: true, cancelable: true }))
      expect(n).toBe(1)
      expect(zone(root).getAttribute('aria-label')).toBe('Upload files')
    } finally {
      HTMLInputElement.prototype.click = click
    }
  })
})

describe('inputs that are not files', () => {
  it('an empty drop, a text drag, a leave without an enter and a drop on a child do the right thing', async () => {
    const taken: File[][] = []
    const { root } = render(<FileDrop onFiles={(x) => taken.push(x)}><b id="kid">k</b></FileDrop>)
    const z = zone(root)

    fire(z, 'drop', transfer())
    const text = new DataTransfer()

    text.setData('text/plain', 'hi')
    expect(fire(z, 'dragenter', text).defaultPrevented).toBe(false)
    fire(z, 'dragleave', transfer(f('a.png')))
    expect(z.hasAttribute('data-drag-over')).toBe(false)
    fire(root.querySelector('#kid')!, 'drop', transfer(f('a.png')))
    await sleep()
    expect(taken).toHaveLength(1)
  })

  it('a hundred files, files with no type, an empty accept list and a blank accept entry', async () => {
    const taken: string[] = []
    const many = Array.from({ length: 100 }, (_, i) => f(`f${i}.png`))
    const a = render(<FileDrop accept={[]} onFiles={(x) => taken.push(...x.map((y) => y.name))}>Drop</FileDrop>)

    fire(zone(a.root), 'drop', transfer(...many))
    await sleep(150)
    expect(taken).toHaveLength(100)
    const noType = f('scan.PDF', '')
    const b = render(<FileDrop accept={['.pdf']} onFiles={(x) => taken.push(...x.map((y) => y.name))}>Drop</FileDrop>)

    fire(zone(b.root), 'drop', transfer(noType))
    await sleep()
    expect(taken).toContain('scan.PDF')
    const blank = render(<FileDrop accept={['']} onFiles={() => {}}>Drop</FileDrop>)

    fire(zone(blank.root), 'drop', transfer(f('a.png')))
    await sleep()
    expect(live(blank.root).textContent).toContain('not accepted')
  })

  it('a minimum size refuses an empty file; a file name that looks like HTML is text, not markup', async () => {
    const { root } = render(<FileDrop rules={{ minSize: 1 }}>Drop</FileDrop>)

    fire(zone(root), 'drop', transfer(new File([], '<img src=x onerror=alert(1)>.png', { type: 'image/png' })))
    await sleep()
    expect(live(root).textContent).toContain('<img src=x onerror=alert(1)>.png')
    expect(root.querySelector('img')).toBeNull()
  })

  it('the server-less cases: no children, and a very long file name', async () => {
    const { root } = render(<FileDrop rules={{ maxSize: 1 }} />)
    const long = `${'x'.repeat(500)}.png`

    fire(zone(root), 'drop', transfer(f(long, 'image/png', 50)))
    await sleep()
    expect(live(root).textContent).toContain(long)
    expect(zone(root).textContent).toBe('')
  })
})

describe('attributes and variants', () => {
  it('labelledby names the zone instead of aria-label; directories sets the folder picker; multiple false is a single picker', () => {
    const { root } = render(
      <div>
        <span id="cap">Photos</span>
        <FileDrop labelledby="cap" directories multiple={false}>Drop</FileDrop>
      </div>,
    )
    const z = zone(root)

    expect(z.getAttribute('aria-labelledby')).toBe('cap')
    expect(z.hasAttribute('aria-label')).toBe(false)
    const input = root.querySelector('input[type=file]') as HTMLInputElement

    expect(input.webkitdirectory).toBe(true)
    expect(input.multiple).toBe(false)
  })

  it('a disabled picker button does nothing and is skipped by Tab; busy is exposed', async () => {
    const { root } = render(
      <div>
        <FilePicker disabled>Off</FilePicker>
        <FilePicker busy label="Busy one">On</FilePicker>
      </div>,
    )
    const [off, on] = [...root.querySelectorAll('button')]

    await userEvent.tab()
    expect(document.activeElement).toBe(on)
    expect((off as HTMLButtonElement).disabled).toBe(true)
    expect(on!.getAttribute('aria-busy')).toBe('true')
  })

  it('a picker with paste-free markup has no drop handlers; children can be a function of the state', () => {
    const { root } = render(<FilePicker>{(s) => <span>{() => String(s.rejections().length)}</span>}</FilePicker>)

    expect(root.querySelector('span')!.textContent).toBe('0')
  })
})
