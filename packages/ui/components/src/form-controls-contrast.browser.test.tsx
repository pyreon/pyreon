import { h, type VNodeChild } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, describe, expect, it } from 'vitest'
import * as C from './index'

/**
 * Every form control is visible and legible in BOTH modes, measured in real
 * Chromium from computed styles.
 *
 * The library's neutral palette was light-only, so in dark mode a field stayed
 * white, and a Checkbox / Radio drew no box at all in either mode (the bases
 * render a visually-hidden native input). Per control and mode this measures,
 * against the page the mode implies (white / the theme's `dark.base`):
 *
 *   - BOUNDARY ≥ 3:1 (WCAG 1.4.11): the control's border, or its filled
 *     surface, against what is behind it — otherwise the control is not seen.
 *   - TEXT ≥ 4.5:1 (WCAG 1.4.3): value / label text against its surface.
 *   - PLACEHOLDER ≥ 4.5:1 where the control has one.
 *
 * Colours are composited (alpha) up the ancestor chain to the opaque page.
 */

type RGBA = [number, number, number, number]
const PAGE: Record<'light' | 'dark', string> = {
  light: 'rgb(255, 255, 255)',
  dark: theme.color.system.dark.base,
}

function parse(c: string): RGBA {
  if (c === 'transparent') return [0, 0, 0, 0]
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (!m) throw new Error(`unparsed colour ${c}`)
  const p = m[1]!
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number)
  return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]
}
const over = (top: RGBA, bottom: RGBA): RGBA => {
  const a = top[3] + bottom[3] * (1 - top[3])
  if (a === 0) return [0, 0, 0, 0]
  const ch = (i: number) => (top[i]! * top[3] + bottom[i]! * bottom[3] * (1 - top[3])) / a
  return [ch(0), ch(1), ch(2), a]
}
const lum = ([r, g, b]: RGBA) => {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrast = (a: RGBA, b: RGBA) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

/** The opaque colour behind `el`'s own box: its ancestors' backgrounds composited to the page. */
function behind(el: Element): RGBA {
  const chain: RGBA[] = []
  for (let p = el.parentElement; p; p = p.parentElement) {
    chain.push(parse(getComputedStyle(p).backgroundColor))
    if (p.hasAttribute('data-page')) break
  }
  return chain.reverse().reduce<RGBA>((acc, c) => over(c, acc), [0, 0, 0, 0])
}
/** `el`'s (or its pseudo's) surface over what is behind it. */
function surface(el: Element, pseudo?: string): RGBA {
  return over(parse(getComputedStyle(el, pseudo).backgroundColor), behind(el))
}

function boundaryContrast(el: Element, pseudo?: string): number {
  const cs = getComputedStyle(el, pseudo)
  const back = behind(el)
  const fill = contrast(surface(el, pseudo), back)
  const hasBorder = Number.parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none'
  const edge = hasBorder ? contrast(over(parse(cs.borderTopColor), back), back) : 0
  return Math.max(fill, edge)
}
function textContrast(el: Element, pseudo?: string): number {
  const bg = surface(el)
  return contrast(over(parse(getComputedStyle(el, pseudo).color), bg), bg)
}

interface Spec {
  name: string
  render: () => VNodeChild
  /** The element that shows the control (its border / surface), and optional pseudo. */
  boundary?: (root: Element) => Element | null
  boundaryPseudo?: string
  /** A glyph (icon / star) drawn in `color`, which must be seen (≥ 3:1). */
  graphic?: (root: Element) => Element | null
  /** Elements whose text must be legible. */
  text?: (root: Element) => Element | null
  placeholder?: (root: Element) => Element | null
}

const q = (sel: string) => (root: Element) => root.querySelector(sel)
const firstChild = (root: Element) => root.firstElementChild
const comp = (name: string) => (C as unknown as Record<string, (p: unknown) => VNodeChild>)[name]!

const SPECS: Spec[] = [
  ...(['Input', 'PasswordInput', 'NumberInput', 'Combobox'] as const).map((name) => ({
    name,
    render: () =>
      h(comp(name), { value: name === 'NumberInput' ? 3 : 'Value', placeholder: 'Placeholder' }),
    boundary: q('input'),
    text: q('input'),
    placeholder: q('input'),
  })),
  {
    name: 'Textarea',
    render: () => h(comp('Textarea'), { value: 'Value', placeholder: 'Placeholder' }),
    boundary: q('textarea'),
    text: q('textarea'),
    placeholder: q('textarea'),
  },
  {
    name: 'Select',
    render: () => h(comp('Select'), { options: [{ value: 'a', label: 'Option A' }] }),
    boundary: q('select'),
    text: q('select'),
  },
  {
    name: 'TagsInput',
    render: () => h(comp('TagsInput'), { value: ['tag'], placeholder: 'Add' }),
    boundary: (r) => r.querySelector('input')?.parentElement ?? null,
    text: q('input'),
    placeholder: q('input'),
  },
  ...(['DatePicker', 'TimePicker', 'DateTimePicker', 'DateRangePicker'] as const).map((name) => ({
    name,
    render: () => h(comp(name), {}, 'Pick a value'),
    boundary: firstChild,
    text: firstChild,
  })),
  {
    name: 'PinInputCell',
    render: () => h(comp('PinInputCell'), { value: '4' }),
    boundary: (r) => r.querySelector('input') ?? r.firstElementChild,
    text: (r) => r.querySelector('input') ?? r.firstElementChild,
  },
  {
    name: 'Checkbox',
    render: () => h(comp('Checkbox'), {}, 'Accept'),
    boundary: q('label'),
    boundaryPseudo: '::before',
    text: q('label'),
  },
  {
    name: 'Checkbox (checked)',
    render: () => h(comp('Checkbox'), { checked: true }, 'Accept'),
    boundary: q('label'),
    boundaryPseudo: '::before',
  },
  {
    name: 'Radio',
    render: () =>
      h(comp('RadioGroup'), { value: 'b' }, h(comp('Radio'), { value: 'a' }, 'Option A')),
    boundary: q('[role="radio"]'),
    boundaryPseudo: '::before',
    text: q('[role="radio"]'),
  },
  {
    name: 'Radio (checked)',
    render: () =>
      h(comp('RadioGroup'), { value: 'a' }, h(comp('Radio'), { value: 'a' }, 'Option A')),
    boundary: q('[role="radio"]'),
    boundaryPseudo: '::before',
  },
  {
    name: 'CheckboxIndicator',
    render: () => h(comp('CheckboxIndicator'), {}),
    boundary: firstChild,
  },
  {
    name: 'RadioIndicator',
    render: () => h(comp('RadioIndicator'), {}),
    boundary: firstChild,
  },
  { name: 'Switch', render: () => h(comp('Switch'), {}), boundary: q('[role="switch"]') },
  {
    name: 'Switch (checked)',
    render: () => h(comp('Switch'), { checked: true }),
    boundary: q('[role="switch"]'),
  },
  { name: 'Slider', render: () => h(comp('Slider'), { value: 50 }), boundary: q('input') },
  {
    name: 'Rating',
    render: () => h(comp('Rating'), { value: 2 }),
    // The last (empty) star must still be seen.
    graphic: (r) => {
      const stars = r.querySelectorAll('span')
      return stars[stars.length - 1] ?? null
    },
  },
  {
    name: 'RangeSlider',
    render: () => h(comp('RangeSlider'), { value: [20, 80] }),
    // a thumb (a span with a border) and the track it sits on
    boundary: (r) => r.querySelector('span[style*="left"], span:nth-of-type(2)'),
  },
  {
    name: 'SegmentedControl',
    render: () =>
      h(
        comp('SegmentedControl'),
        { value: 'a' },
        h(comp('SegmentedControlItem'), { value: 'a' }, 'One'),
        h(comp('SegmentedControlItem'), { value: 'b' }, 'Two'),
      ),
    text: (r) => r.querySelectorAll('button, [role="radio"], [role="tab"]')[1] ?? null,
  },
  ...(['default', 'primary', 'secondary', 'success', 'error'] as const).map((state) => ({
    name: `Chip (${state})`,
    render: () => h(comp('Chip'), state === 'default' ? {} : { state }, 'Chip'),
    text: firstChild,
  })),
  // Headless-base wrappers: the styled surface reaches the DOM through the
  // prop-getters the render prop spreads, rendered here the documented way.
  {
    name: 'FileUpload',
    render: () =>
      h(comp('FileUpload'), {}, ((s: Record<string, any>) =>
        h('div', s.dropZoneProps, 'Drop files')) as never),
    boundary: firstChild,
    text: firstChild,
  },
  {
    name: 'Calendar',
    render: () =>
      h(comp('Calendar'), {}, ((s: Record<string, any>) =>
        h('div', s.rootProps(), 'May')) as never),
    boundary: firstChild,
    text: firstChild,
  },
  {
    name: 'ColorPicker',
    render: () =>
      h(comp('ColorPicker'), {}, ((s: Record<string, any>) =>
        h('div', s.groupProps(), 'Colour')) as never),
    boundary: firstChild,
  },
  {
    name: 'MonthPicker',
    render: () => h(comp('MonthPicker'), {}),
    boundary: firstChild,
    text: firstChild,
  },
  {
    name: 'PinInput',
    render: () =>
      h(comp('PinInput'), { length: 2 }, ((s: Record<string, any>) =>
        h(
          'div',
          s.rootProps(),
          h(comp('PinInputCell'), s.getCellProps(0)),
          h(comp('PinInputCell'), s.getCellProps(1)),
        )) as never),
    boundary: q('input'),
    text: q('input'),
  },
  {
    name: 'MultiSelect',
    render: () =>
      h(comp('MultiSelect'), { options: [{ value: 'a', label: 'A' }], placeholder: 'Pick' }, ((
        s: Record<string, any>,
      ) => h('input', s.inputProps())) as never),
    boundary: q('input'),
    placeholder: q('input'),
  },
  {
    name: 'Autocomplete',
    render: () =>
      h(comp('Autocomplete'), { options: [{ value: 'a', label: 'A' }], placeholder: 'Search' }, ((
        s: Record<string, any>,
      ) => h('input', s.inputProps())) as never),
    boundary: q('input'),
    placeholder: q('input'),
  },
  {
    name: 'FieldLabel / FieldDescription / FieldError',
    render: () =>
      h(
        'div',
        null,
        h(comp('FieldLabel'), {}, 'Label'),
        h(comp('FieldDescription'), {}, 'Description'),
        h(comp('FieldError'), {}, 'Error'),
      ),
    text: (r) => r.querySelector('label') ?? r.firstElementChild?.firstElementChild ?? null,
  },
  {
    name: 'FieldDescription',
    render: () => h(comp('FieldDescription'), {}, 'Description'),
    text: firstChild,
  },
  {
    name: 'FieldError',
    render: () => h(comp('FieldError'), {}, 'Error'),
    text: firstChild,
  },
  {
    name: 'FieldsetLegend',
    render: () => h(comp('Fieldset'), {}, h(comp('FieldsetLegend'), {}, 'Legend')),
    text: q('legend'),
  },
]

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  document.body.innerHTML = ''
})

function mountIn(mode: 'light' | 'dark', node: VNodeChild): Element {
  const { container, unmount } = mountInBrowser(
    h(
      PyreonUI as never,
      { theme, mode },
      h('div', { 'data-page': '', style: `background:${PAGE[mode]};padding:8px` }, node),
    ),
  )
  cleanup = unmount
  return container.querySelector('[data-page]')!
}

// This file also runs in the package's happy-dom suite (which does not apply
// styler class rules to computed style, so every colour reads as default).
// The measurement is only meaningful in a real CSS engine: real Chromium
// (`test:browser`) has no `window.happyDOM`.
const realCss = typeof (globalThis as { happyDOM?: unknown }).happyDOM === 'undefined'

describe.skipIf(!realCss).each(['light', 'dark'] as const)('form controls in %s mode', (mode) => {
  for (const spec of SPECS) {
    it(`${spec.name}: visible boundary, legible text`, () => {
      const root = mountIn(mode, spec.render())
      if (spec.boundary) {
        const el = spec.boundary(root)
        expect(el, `${spec.name}: boundary element`).not.toBeNull()
        expect(
          boundaryContrast(el!, spec.boundaryPseudo),
          `${spec.name} boundary`,
        ).toBeGreaterThanOrEqual(3)
      }
      if (spec.graphic) {
        const el = spec.graphic(root)
        expect(el, `${spec.name}: graphic element`).not.toBeNull()
        const back = behind(el!)
        const ink = over(parse(getComputedStyle(el!).color), back)
        expect(contrast(ink, back), `${spec.name} graphic`).toBeGreaterThanOrEqual(3)
      }
      if (spec.text) {
        const el = spec.text(root)
        expect(el, `${spec.name}: text element`).not.toBeNull()
        expect(textContrast(el!), `${spec.name} text`).toBeGreaterThanOrEqual(4.5)
      }
      if (spec.placeholder) {
        const el = spec.placeholder(root)
        expect(
          textContrast(el!, '::placeholder'),
          `${spec.name} placeholder`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})
