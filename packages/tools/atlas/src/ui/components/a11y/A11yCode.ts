import { txt, type T } from '../../kit'

/** A selector or markup snippet in an a11y finding — mono, wrapping, never clipped. */
export const A11yCode = txt
  .attrs({
    tag: 'code',
    block: true,
  })
  .theme((t: T) => ({
    marginTop: '4px',
    fontFamily: t.font.mono,
    fontSize: t.size.meta,
    lineHeight: '1.45',
    color: t.text,
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
  }))
