import { txt } from '../../kit'

export const ActionsHint = txt.attrs({ tag: 'span' }).theme((t) => ({
  flex: '1 1 220px',
  minWidth: '0',
  fontSize: t.size.body,
  color: t.muted,
  extendCss: `& b,& strong{color:${t.text};font-weight:500;}`,
}))
