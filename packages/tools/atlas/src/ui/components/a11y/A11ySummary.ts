import { el, type T } from '../../kit'

export const A11ySummary = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 16,
  })
  .theme((t: T) => ({
    // Wrap rather than overflow: the Data panel reuses this strip for four
    // query flags, and on the default panel width the last one ("data:
    // present") was clipped at the panel edge. `flexWrap` has no Element prop
    // and rides on the wrapper's own flex display.
    flexWrap: 'wrap',
    marginBottom: '16px',
    padding: '16px',
    borderRadius: t.radius.card,
    border: t.hairline,
  }))
