/**
 * Section — page-level block with responsive vertical padding.
 *
 * Uses `.attrs()` for layout (tag, block, alignment) and `.theme()` for
 * responsive padding. Exercises the `{ xs, md }` responsive syntax and
 * the `.variants()` dimension. This is THE pattern that broke in 0.12.11
 * when responsive styles stopped generating media queries.
 */

import { element } from '../core'

export default element
  .config({ name: 'base/Section' })
  .attrs<{ id?: string }>({
    block: true,
    tag: 'section',
    contentAlignY: 'top',
    contentAlignX: 'center',
  })
  .theme((t) => ({
    paddingY: { xs: t.space.xLarge, md: t.space.xxLarge },
  }))
  .variants({
    fullScreen: { height: '100vh' },
  })
