import { txt, type T } from '../../kit'

export const LabTileName = txt
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    fontSize: t.size.body,
    fontWeight: '600',
    color: t.text,
  }))
