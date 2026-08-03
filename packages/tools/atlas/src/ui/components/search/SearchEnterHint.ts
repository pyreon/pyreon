import { txt, type T } from '../../kit'

export const SearchEnterHint = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    fontFamily: t.font.mono, fontSize: t.size.nano, color: t.faint, flex: 'none',
    padding: '2px 8px', borderRadius: t.radius.chip, border: t.hairline,
  }))
