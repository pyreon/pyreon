/**
 * State-machine coverage for `RatingBase` (star rating) and `TagsInputBase`
 * (free-form tag entry) — both headless render-fn primitives driven through
 * their state objects (getStarProps / inputProps handlers, keyboard, hover,
 * add/remove/clear, paste-split). Pure signal logic → happy-dom + Chromium
 * identical.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { RatingBase, TagsInputBase, type RatingState, type TagsInputState } from './index'

const mountRating = (props: Record<string, unknown> = {}): RatingState => {
  let s: RatingState | undefined
  mountInBrowser(
    h(RatingBase as never, {
      max: 5,
      ...props,
      children: (st: RatingState) => ((s = st), h('div', null)),
    }),
  )
  if (!s) throw new Error('no state')
  return s
}
const mountTags = (props: Record<string, unknown> = {}): TagsInputState => {
  let s: TagsInputState | undefined
  mountInBrowser(
    h(TagsInputBase as never, {
      ...props,
      children: (st: TagsInputState) => ((s = st), h('div', null)),
    }),
  )
  if (!s) throw new Error('no state')
  return s
}
const kd = (key: string) => ({ key, preventDefault() {} }) as unknown as KeyboardEvent
const call = (v: unknown) => (v as () => unknown)()

describe('RatingBase', () => {
  it('clicking a star sets the value; clicking the checked star clears it (toggle-off)', () => {
    const calls: number[] = []
    const s = mountRating({ onChange: (v: number) => calls.push(v) })
    ;(s.getStarProps(3).onClick as () => void)()
    expect(s.value()).toBe(3)
    ;(s.getStarProps(3).onClick as () => void)() // toggle-off
    expect(s.value()).toBe(0)
    expect(calls).toEqual([3, 0])
  })

  it('hover preview: mouseenter sets hovered, mouseleave clears it; data-filled tracks it', () => {
    const s = mountRating()
    const star = s.getStarProps(4)
    ;(star.onMouseEnter as () => void)()
    expect(s.hovered()).toBe(4)
    expect(call(s.getStarProps(2)['data-filled'])).toBe('true') // 2 <= hovered 4
    expect(call(s.getStarProps(5)['data-filled'])).toBeUndefined()
    ;(star.onMouseLeave as () => void)()
    expect(s.hovered()).toBeNull()
  })

  it('readOnly: hover is suppressed + aria-disabled set', () => {
    const s = mountRating({ readOnly: true })
    ;(s.getStarProps(3).onMouseEnter as () => void)()
    expect(s.hovered()).toBeNull()
    expect(s.getStarProps(3)['aria-disabled']).toBe('true')
  })

  it('keyboard: arrows change the rating (clamped 1..max), Home=1, End=max', () => {
    const s = mountRating({ defaultValue: 3 })
    const key = (k: string) => (s.getStarProps(1).onKeyDown as (e: KeyboardEvent) => void)(kd(k))
    key('ArrowRight')
    expect(s.value()).toBe(4)
    key('ArrowLeft')
    expect(s.value()).toBe(3)
    key('Home')
    expect(s.value()).toBe(1)
    key('ArrowLeft') // clamp — never below 1
    expect(s.value()).toBe(1)
    key('End')
    expect(s.value()).toBe(5)
  })

  it('aria-checked accessor + roving tabIndex; rootProps role=radiogroup', () => {
    const s = mountRating({ defaultValue: 2 })
    expect(call(s.getStarProps(2)['aria-checked'])).toBe('true')
    expect(call(s.getStarProps(3)['aria-checked'])).toBe('false')
    expect(call(s.getStarProps(2).tabIndex)).toBe(0) // the checked star is the tab stop
    expect(call(s.getStarProps(3).tabIndex)).toBe(-1)
    expect(s.rootProps().role).toBe('radiogroup')
  })
})

describe('TagsInputBase', () => {
  it('addTag / removeTag / clearAll manage the list; onChange fires', () => {
    const calls: string[][] = []
    const s = mountTags({ onChange: (t: string[]) => calls.push(t) })
    expect(s.addTag('alpha')).toBe(true)
    s.addTag('beta')
    expect(s.tags()).toEqual(['alpha', 'beta'])
    s.removeTag('alpha')
    expect(s.tags()).toEqual(['beta'])
    s.clearAll()
    expect(s.tags()).toEqual([])
    expect(calls[calls.length - 1]).toEqual([])
  })

  it('input keyboard: Enter and comma commit the draft; Backspace-on-empty removes the last tag', () => {
    const s = mountTags()
    const p = s.inputProps()
    const onKey = p.onKeyDown as (e: KeyboardEvent) => void
    const onInput = p.onInput as (e: Event) => void

    onInput({ target: { value: 'red' } } as unknown as Event)
    onKey(kd('Enter'))
    expect(s.tags()).toEqual(['red'])

    onInput({ target: { value: 'green' } } as unknown as Event)
    onKey(kd(','))
    expect(s.tags()).toEqual(['red', 'green'])

    onKey(kd('Backspace'))
    expect(s.tags()).toEqual(['red'])
  })

  it('paste splits on commas/newlines into multiple tags', () => {
    const s = mountTags()
    const onPaste = s.inputProps().onPaste as (e: ClipboardEvent) => void
    onPaste({
      preventDefault() {},
      clipboardData: { getData: () => 'a, b\nc' },
    } as unknown as ClipboardEvent)
    expect(s.tags()).toEqual(['a', 'b', 'c'])
  })

  it('getRemoveProps: a button that removes its tag', () => {
    const s = mountTags({ defaultValue: ['x', 'y'] })
    const rp = s.getRemoveProps('x')
    expect(rp.type).toBe('button')
    ;(rp.onClick as () => void)()
    expect(s.tags()).toEqual(['y'])
  })
})
