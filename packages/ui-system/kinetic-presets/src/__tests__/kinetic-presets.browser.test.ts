import { describe, expect, it } from 'vitest'
import * as api from '../index'
import type { CSSProperties, Preset } from '../types'

// Real-Chromium smoke for @pyreon/kinetic-presets.
//
// A preset is plain data, and the node suite proves its SHAPE. What only a browser can prove is that the data is valid
// CSS: a typo'd property, an unparseable value or a malformed transition shorthand is silently dropped by the engine,
// so the animation just does not run. Every shipped preset is applied to a real element and read back.

const presets: [string, Preset][] = Object.entries(api).filter(
  (entry): entry is [string, Preset] =>
    typeof entry[1] === 'object' && entry[1] !== null && !Array.isArray(entry[1]),
)

const STYLE_KEYS = ['enterStyle', 'enterToStyle', 'leaveStyle', 'leaveToStyle'] as const

const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** The properties of `style` the browser kept after assignment — the ones it rejected are missing. */
function rejected(style: CSSProperties): string[] {
  const el = document.createElement('div')
  document.body.append(el)
  const out: string[] = []
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined) continue
    el.style.cssText = ''
    el.style.setProperty(kebab(key), String(value))
    if (el.style.getPropertyValue(kebab(key)) === '') out.push(`${key}: ${String(value)}`)
  }
  el.remove()
  return out
}

describe('@pyreon/kinetic-presets in a real browser', () => {
  it('discovers the shipped presets', () => {
    expect(presets.length).toBeGreaterThan(40)
  })

  it('every style value of every preset is accepted by Chromium', () => {
    const bad: string[] = []
    for (const [name, preset] of presets) {
      for (const key of STYLE_KEYS) {
        const style = preset[key]
        if (style) for (const r of rejected(style)) bad.push(`${name}.${key} ${r}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('every transition string parses to a real, non-zero transition', () => {
    const el = document.createElement('div')
    document.body.append(el)
    const bad: string[] = []
    for (const [name, preset] of presets) {
      for (const key of ['enterTransition', 'leaveTransition'] as const) {
        const value = preset[key]
        if (value === undefined) continue
        el.style.transition = ''
        el.style.transition = value
        const duration = getComputedStyle(el).transitionDuration
        if (el.style.transition === '' || parseFloat(duration) <= 0) bad.push(`${name}.${key} "${value}" -> ${duration}`)
      }
    }
    el.remove()
    expect(bad).toEqual([])
  })

  it('a preset actually transitions an element from its enter style to its enter-to style', async () => {
    const el = document.createElement('div')
    el.style.width = '10px'
    el.style.height = '10px'
    document.body.append(el)
    const preset = api.fade
    Object.assign(el.style, preset.enterStyle)
    expect(getComputedStyle(el).opacity).toBe('0')
    void el.offsetHeight
    el.style.transition = preset.enterTransition ?? ''
    const done = new Promise<void>((resolve) => el.addEventListener('transitionend', () => resolve(), { once: true }))
    Object.assign(el.style, preset.enterToStyle)
    await done
    expect(getComputedStyle(el).opacity).toBe('1')
    el.remove()
  })
})
