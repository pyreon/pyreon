import { cx, txt } from '../../kit'

/**
 * The required marker in the props table.
 *
 * A glyph rather than a fourth column: the table sits in a panel that is often
 * narrow, and adding a column pushed the allowed-values cell into wrapping —
 * which is the cell a reader actually needs to read. Carries a `title` at the
 * use site so the meaning is available without a legend.
 */
export const PropReq = txt
  .attrs({ tag: 'sup' })
  .theme((t: { danger?: string }) =>
    cx(`color:${t.danger ?? '#e5484d'};font-weight:700;margin-left:2px;`),
  )
