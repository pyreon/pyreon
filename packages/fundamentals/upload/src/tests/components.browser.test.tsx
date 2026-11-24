// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests dispatch and observe real DOM events
import { h, type VNodeChild } from '@pyreon/core'
import { hydrateRoot, mount, onHydrationMismatch } from '@pyreon/runtime-dom'
import axe from 'axe-core'
import { userEvent } from 'vitest/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { FileDrop, FilePicker, type FileIntakeProps } from '../components'

const cleanups: (() => void)[] = []
const sleep = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms))
const png = (name = 'a.png', size = 3): File => new File([new Uint8Array(size)], name, { type: 'image/png' })
const pdf = (name = 'a.pdf'): File => new File([new Uint8Array(3)], name, { type: 'application/pdf' })

function render(node: VNodeChild, dir?: string): HTMLElement {
  const root = document.createElement('div')

  if (dir !== undefined) root.dir = dir
  document.body.appendChild(root)
  const unmount = mount(node as never, root)

  cleanups.push(() => {
    unmount()
    root.remove()
  })

  return root
}

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

const transfer = (...files: File[]): DataTransfer => {
  const dt = new DataTransfer()

  for (const f of files) dt.items.add(f)

  return dt
}

const fire = (el: Element, type: string, dt: DataTransfer): DragEvent => {
  const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt })

  el.dispatchEvent(e)

  return e
}

const zoneOf = (root: HTMLElement): HTMLElement => root.querySelector('[role="button"]')!
const live = (root: HTMLElement): HTMLElement => root.querySelector('[data-pyreon-live]')!

/** Count `click()` calls on file inputs without opening a real dialog. */
function spyOpen(): { count(): number; restore(): void } {
  const click = HTMLInputElement.prototype.click
  let n = 0

  HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
    if (this.type === 'file') n++
    else click.call(this)
  }

  return { count: () => n, restore: () => void (HTMLInputElement.prototype.click = click) }
}

describe('<FileDrop> markup and attributes', () => {
  it('is a labelled button in the tab order, with busy and disabled state', async () => {
    const root = render(<FileDrop label="Upload photos" class="zone" busy>Drop photos here</FileDrop>)
    const z = zoneOf(root)

    expect(z.getAttribute('aria-label')).toBe('Upload photos')
    expect(z.tabIndex).toBe(0)
    expect(z.getAttribute('aria-busy')).toBe('true')
    expect(z.className).toBe('zone')
    expect(z.textContent).toBe('Drop photos here')
    expect(root.querySelector('input[type=file]')!.hasAttribute('hidden')).toBe(true)
    const off = render(<FileDrop disabled />)

    expect(zoneOf(off).tabIndex).toBe(-1)
    expect(zoneOf(off).getAttribute('aria-disabled')).toBe('true')
    expect(zoneOf(off).hasAttribute('data-disabled')).toBe(true)
    expect(zoneOf(render(<FileDrop />)).getAttribute('aria-label')).toBe('Upload files')
  })

  it('passes an automated accessibility check: idle, disabled, busy, with refusal reasons', async () => {
    const root = render(
      <div>
        <FileDrop label="Drop photos here" accept={['image/*']} rules={{ maxSize: 10 }} rejected={(list) => <ul>{list.map((r) => <li>{r.file.name}: {r.rejections[0]!.message}</li>)}</ul>}>Drop photos here</FileDrop>
        <FileDrop label="Nothing" disabled>Nothing</FileDrop>
        <FileDrop label="Uploading" busy>Uploading</FileDrop>
        <FilePicker>Choose files</FilePicker>
      </div>,
    )

    fire(zoneOf(root), 'drop', transfer(pdf('refused.pdf')))
    await sleep()
    expect(root.querySelector('li')!.textContent).toContain('refused.pdf')
    const results = await axe.run(root, { rules: { region: { enabled: false } } })

    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
  })
})

describe('keyboard operation', () => {
  it('Enter and Space on the focused zone open the picker; a disabled zone does not', async () => {
    const spy = spyOpen()

    try {
      const root = render(<FileDrop>Drop</FileDrop>)

      await userEvent.tab()
      expect(document.activeElement).toBe(zoneOf(root))
      await userEvent.keyboard('{Enter}')
      await userEvent.keyboard(' ')
      expect(spy.count()).toBe(2)
      const off = render(<FileDrop disabled>Drop</FileDrop>)

      zoneOf(off).focus()
      zoneOf(off).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      zoneOf(off).click()
      expect(spy.count()).toBe(2)
    } finally {
      spy.restore()
    }
  })

  it('Space does not scroll the page (default prevented), other keys are left alone', () => {
    const root = render(<FileDrop>Drop</FileDrop>)
    const spy = spyOpen()

    try {
      const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
      const other = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })

      zoneOf(root).dispatchEvent(space)
      zoneOf(root).dispatchEvent(other)
      expect(space.defaultPrevented).toBe(true)
      expect(other.defaultPrevented).toBe(false)
    } finally {
      spy.restore()
    }
  })

  it('<FilePicker> is a native button: Enter and Space click it; Tab reaches it; disabled is skipped', async () => {
    const spy = spyOpen()

    try {
      const root = render(<FilePicker>Choose</FilePicker>)

      await userEvent.tab()
      expect(document.activeElement).toBe(root.querySelector('button'))
      await userEvent.keyboard('{Enter}')
      await userEvent.keyboard(' ')
      expect(spy.count()).toBe(2)
      const off = render(<FilePicker disabled>Choose</FilePicker>)

      expect((off.querySelector('button') as HTMLButtonElement).disabled).toBe(true)
    } finally {
      spy.restore()
    }
  })
})

describe('drag state', () => {
  it('stays over while the pointer moves across child elements, and shows whether the files fit', async () => {
    const root = render(<FileDrop accept={['image/*']}><span id="inner">inner</span></FileDrop>)
    const z = zoneOf(root)
    const inner = root.querySelector('#inner')!
    const images = transfer(png())

    fire(z, 'dragenter', images)
    expect(z.getAttribute('data-drag-over')).toBe('true')
    expect(z.getAttribute('data-drop-valid')).toBe('true')
    fire(inner, 'dragenter', images)
    fire(z, 'dragleave', images)
    expect(z.getAttribute('data-drag-over')).toBe('true')
    fire(inner, 'dragleave', images)
    expect(z.hasAttribute('data-drag-over')).toBe(false)
    fire(z, 'dragenter', transfer(pdf()))
    expect(z.getAttribute('data-drop-valid')).toBe('false')
  })

  it('the render function receives the state', () => {
    const root = render(<FileDrop>{(s) => <p>{() => (s.isOver() ? 'release to upload' : 'drop files')}</p>}</FileDrop>)

    expect(root.querySelector('p')!.textContent).toBe('drop files')
    fire(zoneOf(root), 'dragenter', transfer(png()))
    expect(root.querySelector('p')!.textContent).toBe('release to upload')
  })
})

describe('intake: rules, reasons, live region and focus', () => {
  it('accepted files go to onFiles; refused ones keep every reason, are announced, and focus returns to the zone', async () => {
    const taken: string[] = []
    const refused: string[] = []
    const root = render(
      <FileDrop accept={['image/*']} rules={{ maxSize: '1 KB' }} onFiles={(f) => taken.push(...f.map((x) => x.name))} onReject={(r) => refused.push(...r.map((x) => `${x.file.name}:${x.rejections.map((y) => y.code)}`))}>
        Drop
      </FileDrop>,
    )
    const big = png('big.png', 5000)

    document.body.focus()
    fire(zoneOf(root), 'drop', transfer(png('ok.png'), pdf('doc.pdf'), big))
    await sleep()
    expect(taken).toEqual(['ok.png'])
    expect(refused).toEqual(['doc.pdf:type', 'big.png:too-large'])
    expect(live(root).textContent).toBe('1 file added. 2 files were not accepted. doc.pdf: Files of this type are not accepted (allowed: image/*). big.png: The file is 5 KB; the limit is 1 KB.')
    expect(document.activeElement).toBe(zoneOf(root))
    expect(zoneOf(root).hasAttribute('data-has-rejections')).toBe(true)
  })

  it('refusing everything still announces and focuses; the next intake replaces the old reasons', async () => {
    const root = render(<FileDrop accept={['image/*']} rejected={(list) => <p data-r="">{list.length}</p>}>Drop</FileDrop>)

    document.body.focus()
    fire(zoneOf(root), 'drop', transfer(pdf()))
    await sleep()
    expect(live(root).textContent).toContain('1 file was not accepted')
    expect(document.activeElement).toBe(zoneOf(root))
    expect(root.querySelector('[data-r]')!.textContent).toBe('1')
    fire(zoneOf(root), 'drop', transfer(png()))
    await sleep()
    expect(live(root).textContent).toBe('1 file added.')
    expect(root.querySelector('[data-r]')).toBeNull()
    expect(zoneOf(root).hasAttribute('data-has-rejections')).toBe(false)
  })

  it('accept ignores case in types and extensions; multiple false keeps one', async () => {
    const taken: string[] = []
    const root = render(<FileDrop accept={['.PNG', 'IMAGE/JPEG']} multiple={false} onFiles={(f) => taken.push(...f.map((x) => x.name))}>Drop</FileDrop>)

    fire(zoneOf(root), 'drop', transfer(new File([new Uint8Array(1)], 'shout.png'), new File([new Uint8Array(1)], 'two.jpg', { type: 'image/jpeg' })))
    await sleep()
    expect(taken).toEqual(['shout.png'])
    expect(live(root).textContent).toContain('two.jpg: At most 1 file is allowed.')
  })

  it('a file chosen in the dialog goes through the same rules, and the same file can be chosen twice', async () => {
    const taken: string[] = []
    const root = render(<FilePicker accept={['image/*']} onFiles={(f) => taken.push(...f.map((x) => x.name))}>Choose</FilePicker>)
    const input = root.querySelector('input[type=file]') as HTMLInputElement
    const same = png('same.png')

    for (let i = 0; i < 2; i++) {
      input.files = transfer(same).files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await sleep()
      expect(input.files!.length).toBe(0)
    }
    expect(taken).toEqual(['same.png', 'same.png'])
    input.files = transfer(pdf()).files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await sleep()
    expect(live(root).textContent).toContain('not accepted')
    expect(document.activeElement).toBe(root.querySelector('button'))
  })

  it('paste is opt in; text is left alone', async () => {
    const taken: string[] = []
    const root = render(<FileDrop paste onFiles={(f) => taken.push(...f.map((x) => x.name))}>Drop</FileDrop>)
    const e = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer(png('pasted.png')) })

    zoneOf(root).dispatchEvent(e)
    await sleep()
    expect(taken).toEqual(['pasted.png'])
    expect(e.defaultPrevented).toBe(true)
    const text = new DataTransfer()

    text.setData('text/plain', 'x')
    const t = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: text })

    zoneOf(root).dispatchEvent(t)
    expect(t.defaultPrevented).toBe(false)
  })

  it('the live region can be placed by the app', async () => {
    const root = render(
      <FileDrop live={false} accept={['image/*']}>
        {(s) => <span id="mine" {...s.liveRegionProps}>{() => s.announcement()}</span>}
      </FileDrop>,
    )

    expect(root.querySelectorAll('[data-pyreon-live]').length).toBe(1)
    fire(zoneOf(root), 'drop', transfer(pdf()))
    await sleep()
    expect(root.querySelector('#mine')!.getAttribute('aria-live')).toBe('polite')
    expect(root.querySelector('#mine')!.textContent).toContain('not accepted')
  })

  it('disabled takes nothing', async () => {
    const taken: string[] = []
    const root = render(<FileDrop disabled onFiles={(f) => taken.push(...f.map((x) => x.name))}>Drop</FileDrop>)

    fire(zoneOf(root), 'drop', transfer(png()))
    await sleep()
    expect(taken).toEqual([])
  })
})

describe('right to left', () => {
  it('works the same in a right-to-left page: keyboard, drag state, the visually hidden live region', async () => {
    const spy = spyOpen()

    try {
      const root = render(<FileDrop label="اسحب الملفات" accept={['image/*']}>اسحب الملفات</FileDrop>, 'rtl')
      const z = zoneOf(root)

      expect(getComputedStyle(z).direction).toBe('rtl')
      await userEvent.tab()
      await userEvent.keyboard('{Enter}')
      expect(spy.count()).toBe(1)
      fire(z, 'dragenter', transfer(png()))
      expect(z.getAttribute('data-drag-over')).toBe('true')
      fire(z, 'dragleave', transfer(png()))
      const region = live(root)

      expect(region.getBoundingClientRect().width).toBeLessThanOrEqual(1)
      expect((await axe.run(root, { rules: { region: { enabled: false } } })).violations).toEqual([])
    } finally {
      spy.restore()
    }
  })
})

describe('hydration', () => {
  it('adopts server-shaped markup with no mismatch, then behaves', async () => {
    const taken: string[] = []
    const tree = (): VNodeChild => h(FileDrop as never, { label: 'Upload', accept: ['image/*'], class: 'z', onFiles: (f: File[]) => taken.push(...f.map((x) => x.name)) }, 'Drop here')
    const scratch = document.createElement('div')

    document.body.appendChild(scratch)
    const unmountScratch = mount(tree() as never, scratch)
    const html = scratch.innerHTML

    unmountScratch()
    scratch.remove()
    const el = document.createElement('div')

    document.body.appendChild(el)
    el.innerHTML = html
    const zoneBefore = zoneOf(el)
    const mismatches: string[] = []
    const off = onHydrationMismatch((info) => mismatches.push(JSON.stringify(info)))
    const cleanup = hydrateRoot(el, tree() as never)

    off()
    cleanups.push(() => {
      cleanup()
      el.remove()
    })
    expect(mismatches).toEqual([])
    expect(zoneOf(el)).toBe(zoneBefore)
    fire(zoneOf(el), 'drop', transfer(png('after.png')))
    await sleep()
    expect(taken).toEqual(['after.png'])
    expect(live(el).textContent).toBe('1 file added.')
  })
})

describe('unmount leaves nothing', () => {
  it('removes the window listeners of a drag that was still running', () => {
    const added: string[] = []
    const removed: string[] = []
    const add = window.addEventListener.bind(window)
    const remove = window.removeEventListener.bind(window)

    window.addEventListener = ((t: string, f: never, o?: never) => { added.push(t); add(t, f, o) }) as never
    window.removeEventListener = ((t: string, f: never, o?: never) => { removed.push(t); remove(t, f, o) }) as never
    try {
      const root = document.createElement('div')

      document.body.appendChild(root)
      const unmount = mount(<FileDrop>Drop</FileDrop> as never, root)

      fire(zoneOf(root), 'dragenter', transfer(png()))
      unmount()
      root.remove()
      expect(added.filter((t) => t === 'drop' || t === 'dragend').length).toBe(2)
      expect(removed.filter((t) => t === 'drop' || t === 'dragend').length).toBe(2)
    } finally {
      window.addEventListener = add as never
      window.removeEventListener = remove as never
    }
  })
})

export type { FileIntakeProps }
