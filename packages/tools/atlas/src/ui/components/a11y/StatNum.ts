import { txt } from '../../kit'

/** A headline number (`.at-score b`) — coloured by its verdict. */
export const StatNum = txt
  .attrs({ tag: 'b' })
  .theme((t) => ({
    display: 'block',
    width: '100%',
    fontSize: t.size.hero,
    fontWeight: '500',
    lineHeight: '1.2',
    // `font-variant-numeric` has no unistyle key (an unmapped key is DROPPED).
    extendCss: 'font-variant-numeric:tabular-nums;',
    color: t.text,
  }))
  .states((t) => ({
    ok: { color: t.ok },
    warn: { color: t.warn },
    danger: { color: t.danger },
    plain: {},
  }))
