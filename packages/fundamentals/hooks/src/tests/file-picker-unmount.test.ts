import { effect } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCamera } from '../useCamera'
import { useFilePicker } from '../useFilePicker'
import { useImagePicker } from '../useImagePicker'

/**
 * All three pickers open a hidden `<input type="file">`, append it to
 * `document.body`, and remove it inside `settle`. Each carried a comment
 * promising that "a browser that fires NEITHER event must not leak the node" —
 * a property the `settled` flag cannot provide, because with no event `settle`
 * never runs and neither does `input.remove()`. The document then holds the
 * node, its two listeners and the `resolve` closure for the life of the page,
 * once per pick.
 *
 * `cancel` is the event that would have fired, and the same comments describe
 * it as "not universal across older browsers" — so the unreachable case is the
 * documented one.
 */
function trackInputs(): HTMLInputElement[] {
  const created: HTMLInputElement[] = []
  const realCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreate(tag)
    if (tag === 'input') created.push(el as HTMLInputElement)
    return el
  })
  return created
}

afterEach(() => {
  // Restore here, not at the end of each spec: a spec that times out never
  // reaches its own trailing call, and the stale spy then hands the NEXT spec
  // the previous test's input element.
  vi.restoreAllMocks()
})

const PICKERS = [
  ['useCamera', () => useCamera().capture],
  ['useFilePicker', () => useFilePicker().pick],
  ['useImagePicker', () => useImagePicker().pick],
] as const

describe.each(PICKERS)('%s — a pick still open at unmount', (_name, make) => {
  it('is settled, and its input leaves the document', async () => {
    const created = trackInputs()
    let open: (() => Promise<string | null>) | undefined
    // The hook runs inside a cleanup window, which is what a component setup
    // gives it — a pick started later from an event handler has no scope of
    // its own to register against.
    const owner = effect(() => {
      open = make()
    })

    const pending = open!()
    const input = created[0]!
    expect(document.body.contains(input)).toBe(true)

    // Neither `change` nor `cancel` arrives — the case the comments named.
    owner.dispose()

    await expect(pending).resolves.toBeNull()
    expect(document.body.contains(input)).toBe(false)
  })

  it('leaves an ALREADY-settled pick alone', async () => {
    const created = trackInputs()
    let open: (() => Promise<string | null>) | undefined
    const owner = effect(() => {
      open = make()
    })

    const pending = open!()
    created[0]!.dispatchEvent(new Event('cancel'))
    await expect(pending).resolves.toBeNull()

    // Disposing afterwards must not double-resolve or throw on a removed node.
    expect(() => owner.dispose()).not.toThrow()
  })
})
