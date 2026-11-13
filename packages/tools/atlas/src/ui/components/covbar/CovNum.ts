import { txt } from '../../kit'

/** The headline percentage. */
export const CovNum = txt.attrs({ tag: 'b' }).theme((t) => ({
  fontSize: '18px',
  fontWeight: '500',
  color: t.text,
  extendCss: 'font-variant-numeric:tabular-nums;',
}))
