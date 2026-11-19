import { h } from '@pyreon/core'
import { afterEach, describe, it } from 'vitest'
import * as C from './index'
import {
  checkModeContrast,
  firstChild,
  MODES,
  realCss,
  type Spec,
  unmountModeContrast,
} from './tests/mode-contrast'

/**
 * Surfaces and overlays follow `<PyreonUI mode>` (#4340), measured in real
 * Chromium the way `form-controls-contrast.browser.test.tsx` measures the form
 * controls. Each of these painted the theme's white (`light.base`) and left its
 * text to the page, so in dark mode a Card, Popover, Menu or Notification was a
 * white block, and the Tooltip's slate bubble vanished into the slate page.
 */
const comp = (name: string) => (C as unknown as Record<string, (p: unknown) => unknown>)[name] as never

const SPECS: Spec[] = [
  ...([undefined, 'elevated', 'outline', 'filled'] as const).map((variant) => ({
    name: `Card${variant ? ` variant=${variant}` : ''}`,
    render: () => h(comp('Card'), variant ? { variant } : {}, 'Card body'),
    surface: firstChild,
    text: firstChild,
  })),
  {
    name: 'CardHeader / CardFooter',
    render: () =>
      h(comp('Card'), {}, [h(comp('CardHeader'), {}, 'Header'), 'Body', h(comp('CardFooter'), {}, 'Footer')]),
    text: [(r) => r.firstElementChild?.firstElementChild ?? null, (r) => r.firstElementChild?.lastElementChild ?? null],
  },
  {
    name: 'Popover',
    render: () => h(comp('Popover'), {}, 'Popover content'),
    surface: firstChild,
    text: firstChild,
  },
  {
    name: 'HoverCard',
    render: () => h(comp('HoverCard'), {}, 'Hover card content'),
    surface: firstChild,
    text: firstChild,
  },
  {
    name: 'Menu / MenuItem',
    render: () => h(comp('Menu'), {}, [h(comp('MenuItem'), {}, 'Rename'), h(comp('MenuItem'), {}, 'Delete')]),
    surface: firstChild,
    text: (r) => r.firstElementChild?.firstElementChild ?? null,
  },
  {
    name: 'MenuItem (hover)',
    render: () => h(comp('Menu'), {}, h(comp('MenuItem'), { hover: true }, 'Rename')),
    text: (r) => r.firstElementChild?.firstElementChild ?? null,
  },
  {
    // An inverted bubble: it must stand out from the page, and its text from it.
    name: 'Tooltip',
    render: () => h(comp('Tooltip'), {}, 'Copied'),
    boundary: firstChild,
    text: firstChild,
  },
  ...([undefined, 'info', 'success', 'warning', 'error'] as const).map((state) => ({
    name: `Notification${state ? ` state=${state}` : ''}`,
    render: () => h(comp('Notification'), state ? { state } : {}, 'Saved'),
    surface: firstChild,
    text: firstChild,
  })),
]

afterEach(unmountModeContrast)

describe.skipIf(!realCss).each(MODES)('surfaces and overlays in %s mode', (mode) => {
  for (const spec of SPECS) it(spec.name, () => checkModeContrast(mode, spec))
})
