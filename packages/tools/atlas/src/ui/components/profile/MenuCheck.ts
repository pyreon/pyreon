import { txt } from '../../kit'

export const MenuCheck = txt
  .attrs({ tag: 'span' })
  .theme((t) => ({ color: t.accent, fontSize: t.size.caption, flex: 'none' }))
