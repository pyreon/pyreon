import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

/**
 * Horizontal row of inline children. Per project conventions, layout
 * props (`direction`, `gap`) live in `.attrs()`, not `.theme()`. The
 * Element base accepts `direction: 'inline' | 'rows' | 'reverseInline'
 * | 'reverseRows'` — `'row'` is not a valid value.
 */
const DocRow = rocketstyle()({ name: 'DocRow', component: Element })
  .statics({ _documentType: 'row' as const })
  .attrs(() => ({
    tag: 'div',
    direction: 'inline' as const,
    gap: 8,
    _documentProps: {},
  }))

export default DocRow
