import { h } from '@pyreon/core'
import { afterEach, describe, it } from 'vitest'
import * as C from './index'
import {
  checkModeContrast,
  firstChild,
  MODES,
  q,
  realCss,
  type Spec,
  unmountModeContrast,
} from './tests/mode-contrast'

/**
 * Buttons and the Tree follow `<PyreonUI mode>` (#4340), measured in real
 * Chromium the way `form-controls-contrast.browser.test.tsx` measures the form
 * controls. The secondary Button and the hovered IconButton / CloseButton /
 * transparent ActionIcon read slate-900 (`dark[700]`–`dark.base`, invisible on
 * the dark page); the idle IconButton, CloseButton, secondary and transparent
 * ActionIcon and the Tree rows read slate-400 at 40–70% alpha
 * (`base[400]`–`base[700]`, 1.4–2.0:1 on white, so failing in light mode too).
 * `Alert` reads only tone tints and `tintText`, which `text-on-fill-contrast`
 * measures in both modes.
 */
const comp = (name: string) => (C as unknown as Record<string, (p: unknown) => unknown>)[name] as never

const TREE = [
  { id: 'docs', label: 'docs', children: [{ id: 'intro', label: 'intro' }] },
  { id: 'src', label: 'src' },
]

const SPECS: Spec[] = [
  { name: 'Button state=secondary', render: () => h(comp('Button'), { state: 'secondary' }, 'Cancel'), text: firstChild },
  {
    name: 'Button state=secondary (hover)',
    render: () => h(comp('Button'), { state: 'secondary', hover: true }, 'Cancel'),
    text: firstChild,
  },
  ...[false, true].flatMap((hover) => [
    {
      name: `IconButton${hover ? ' (hover)' : ''}`,
      render: () => h(comp('IconButton'), { 'aria-label': 'More', hover }, '⋯'),
      graphic: firstChild,
    },
    {
      name: `CloseButton${hover ? ' (hover)' : ''}`,
      render: () => h(comp('CloseButton'), { hover }, '×'),
      graphic: firstChild,
    },
    {
      name: `ActionIcon variant=transparent${hover ? ' (hover)' : ''}`,
      render: () => h(comp('ActionIcon'), { variant: 'transparent', 'aria-label': 'Edit', hover }, '✎'),
      graphic: firstChild,
    },
  ]),
  {
    name: 'ActionIcon state=secondary',
    render: () => h(comp('ActionIcon'), { state: 'secondary', 'aria-label': 'Edit' }, '✎'),
    graphic: firstChild,
  },
  {
    name: 'Tree rows',
    render: () => h(comp('Tree'), { data: TREE, defaultExpanded: ['docs'], 'aria-label': 'Files' }),
    text: [q('[role="treeitem"]'), q('[role="treeitem"]:last-child')],
  },
  {
    name: 'TreeItem, selected by attribute',
    render: () => h(comp('TreeItem'), { 'aria-selected': 'true' }, 'src'),
    text: firstChild,
  },
]

afterEach(unmountModeContrast)

describe.skipIf(!realCss).each(MODES)('buttons and the tree in %s mode', (mode) => {
  for (const spec of SPECS) it(spec.name, () => checkModeContrast(mode, spec))
})
