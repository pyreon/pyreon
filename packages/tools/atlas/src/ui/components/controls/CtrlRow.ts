import { el } from '../../kit'

/**
 * A control row (`.ctl`): the label column (34%, min 80px) and the control
 * column, 7px × 12px padding, a hairline under it. Every child after the
 * label head lands in the control column — a note under an input included.
 */
export const CtrlRow = el
  .attrs({
    tag: 'div',
    block: true,
  })
  .theme((t) => ({
    display: 'grid',
    alignItems: 'center',
    gap: '4px 8px',
    padding: '7px 12px',
    borderBottom: t.hairline,
    extendCss:
      'grid-template-columns:minmax(80px,34%) minmax(0,1fr);& > :not(:first-child){grid-column:2;min-width:0;}',
  }))
