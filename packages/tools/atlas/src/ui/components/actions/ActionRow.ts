import { el } from '../../kit'

/** A log line (`.log2 > div`): handler, payload, time — mono, hairline-separated. */
export const ActionRow = el
  .attrs({
    tag: 'div',
    block: true,
  })
  .theme((t) => ({
    display: 'grid',
    gap: '8px',
    alignItems: 'baseline',
    padding: '6px 12px',
    borderBottom: t.hairline,
    fontFamily: t.font.mono,
    fontSize: t.size.small,
    extendCss: 'grid-template-columns:minmax(0,max-content) minmax(0,1fr) auto;animation:atlas-in .18s;',
  }))
