import { txt } from '../../kit'

export const SearchEnterHint = txt
  .attrs({ tag: 'span' })
  .theme((t) => ({
    fontFamily: t.font.mono, fontSize: t.size.caption, fontWeight: '600', color: t.accentText, flex: 'none',
    padding: '1px 8px', borderRadius: t.radius.chip, background: t.accent,
  }))
