import { txt } from '../../kit'

export const LabTileName = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontSize: t.size.body,
    fontWeight: '600',
    color: t.text,
  }))
