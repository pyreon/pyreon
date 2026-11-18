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
 * Data display and typography follow `<PyreonUI mode>` (#4340), measured in
 * real Chromium the way `form-controls-contrast.browser.test.tsx` measures the
 * form controls. Title read slate-900 (`dark[800]`, invisible on the dark
 * page); Paragraph, Code, Kbd, Avatar, the secondary Badge and the secondary
 * Loader read slate-400 at 50–80% alpha (`base[500]`–`base[800]`), which is
 * 1.5–2.4:1 on white, so they failed in light mode too.
 */
const comp = (name: string) => (C as unknown as Record<string, (p: unknown) => unknown>)[name] as never

const SPECS: Spec[] = [
  ...(['h1', 'h4'] as const).map((size) => ({
    name: `Title size=${size}`,
    render: () => h(comp('Title'), { size }, 'Release notes'),
    text: firstChild,
  })),
  { name: 'Paragraph', render: () => h(comp('Paragraph'), {}, 'Body copy.'), text: firstChild },
  ...(['inline', 'block'] as const).map((variant) => ({
    name: `Code variant=${variant}`,
    render: () => h(comp('Code'), { variant }, 'bun install'),
    text: firstChild,
  })),
  { name: 'Kbd', render: () => h(comp('Kbd'), {}, '⌘K'), text: firstChild },
  { name: 'Avatar', render: () => h(comp('Avatar'), {}, 'VB'), text: firstChild },
  ...([undefined, 'outline', 'subtle'] as const).map((variant) => ({
    name: `Badge state=secondary${variant ? ` variant=${variant}` : ''}`,
    render: () => h(comp('Badge'), variant ? { state: 'secondary', variant } : { state: 'secondary' }, 'Draft'),
    text: firstChild,
  })),
  {
    name: 'Loader state=secondary',
    render: () => h(comp('Loader'), { state: 'secondary' }),
    graphic: firstChild,
  },
]

afterEach(unmountModeContrast)

describe.skipIf(!realCss).each(MODES)('data display and typography in %s mode', (mode) => {
  for (const spec of SPECS) it(spec.name, () => checkModeContrast(mode, spec))
})
