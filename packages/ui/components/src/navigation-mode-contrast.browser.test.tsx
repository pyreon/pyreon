import { h } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as C from './index'
import {
  checkModeContrast,
  contrast,
  firstChild,
  MODES,
  q,
  realCss,
  type Spec,
  unmountModeContrast,
} from './tests/mode-contrast'

/**
 * Navigation and disclosure follow `<PyreonUI mode>` (#4340), measured in real
 * Chromium the way `form-controls-contrast.browser.test.tsx` measures the form
 * controls. Their text was slate-900 (`dark[800]`, invisible on the dark page)
 * or slate-400 at 50–70% alpha (`base[500]`–`base[700]`, 1.6–2.0:1 on white,
 * so failing in light mode too); the enclosed tab painted white and the
 * timeline marker a white ring.
 */
/** An opaque `rgb()` / `rgba()` computed colour. */
const rgb = (c: string): [number, number, number, number] => {
  const [r = 0, g = 0, b = 0] = (/rgba?\(([^)]+)\)/.exec(c)?.[1] ?? '').split(/[\s,/]+/).map(Number)
  return [r, g, b, 1]
}

const comp = (name: string) => (C as unknown as Record<string, (p: unknown) => unknown>)[name] as never

const tabs = (variant: 'line' | 'enclosed' | 'pills') =>
  h(comp('Tabs'), { defaultValue: 'a', variant }, [
    h(comp('TabList'), { 'aria-label': 'Sections' }, [
      h(comp('Tab'), { value: 'a', variant }, 'Overview'),
      h(comp('Tab'), { value: 'b', variant }, 'API'),
    ]),
  ])

const SPECS: Spec[] = [
  ...(['line', 'enclosed', 'pills'] as const).map((variant) => ({
    name: `Tab variant=${variant}, unselected`,
    render: () => tabs(variant),
    text: q('[role="tab"][aria-selected="false"]'),
  })),
  {
    name: 'Tab variant=enclosed, selected',
    render: () => tabs('enclosed'),
    surface: q('[role="tab"][aria-selected="true"]'),
    text: q('[role="tab"][aria-selected="true"]'),
  },
  {
    name: 'Accordion trigger and content',
    render: () =>
      h(
        comp('Accordion'),
        { defaultValue: 'a' },
        h(comp('AccordionItem'), { value: 'a' }, [
          h(comp('AccordionTrigger'), null, 'Shipping'),
          h(comp('AccordionContent'), null, 'Ships in two days.'),
        ]),
      ),
    text: [q('button'), q('[role="region"]')],
  },
  {
    name: 'AccordionTrigger (hover)',
    render: () =>
      h(
        comp('Accordion'),
        { defaultValue: 'a' },
        h(comp('AccordionItem'), { value: 'a' }, h(comp('AccordionTrigger'), { hover: true }, 'Shipping')),
      ),
    text: q('button'),
  },
  { name: 'NavLink', render: () => h(comp('NavLink'), {}, 'Settings'), text: firstChild },
  { name: 'NavLink (hover)', render: () => h(comp('NavLink'), { hover: true }, 'Settings'), text: firstChild },
  {
    name: 'Breadcrumb items',
    render: () =>
      h(comp('Breadcrumb'), {}, [
        h(comp('BreadcrumbItem'), {}, 'Home'),
        h(comp('BreadcrumbItem'), { 'aria-current': 'page' }, 'Docs'),
      ]),
    text: [q('nav > *:first-child'), q('[aria-current="page"]')],
  },
  { name: 'BreadcrumbItem (hover)', render: () => h(comp('BreadcrumbItem'), { hover: true }, 'Home'), text: firstChild },
  { name: 'PaginationItem', render: () => h(comp('PaginationItem'), {}, '3'), text: firstChild },
  {
    name: 'PaginationItem (hover)',
    render: () => h(comp('PaginationItem'), { hover: true }, '3'),
    text: firstChild,
  },
  { name: 'PaginationEllipsis', render: () => h(comp('PaginationEllipsis'), {}, '…'), text: firstChild },
  ...([undefined, 'default'] as const).map((state) => ({
    name: `Step${state ? ` state=${state}` : ''}`,
    render: () => h(comp('Stepper'), {}, h(comp('Step'), state ? { state } : {}, 'Shipping')),
    text: (r: Element) => r.querySelector('li'),
  })),
]

afterEach(unmountModeContrast)

describe.skipIf(!realCss).each(MODES)('navigation and disclosure in %s mode', (mode) => {
  for (const spec of SPECS) it(spec.name, () => checkModeContrast(mode, spec))

  // The marker's ring masks the rail behind the dot, so it is the page colour.
  it.each([undefined, 'active'] as const)('TimelineItem state=%s: the marker ring is the page', (state) => {
    checkModeContrast(mode, {
      name: `TimelineItem ${state ?? ''}`,
      render: () => h(comp('Timeline'), {}, h(comp('TimelineItem'), state ? { state } : {}, 'Shipped')),
      surface: firstChild,
    })
    const item = document.querySelector('[data-page] > * > *')!
    const ring = rgb(getComputedStyle(item, '::before').borderTopColor)
    const page = rgb(getComputedStyle(document.querySelector('[data-page]')!).backgroundColor)
    expect(contrast(ring, page), 'ring vs page').toBeLessThan(1.05)
  })
})
