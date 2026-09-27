import { txt, type T } from '../../kit'

/** The Lab's honesty line — what its tiles can and cannot vary for this project. */
export const LabNote = txt
  .attrs({
    tag: 'p',
    block: true,
  })
  .theme((t: T) => ({
    maxWidth: '1100px',
    width: '100%',
    margin: '0 auto 16px',
    padding: '12px 16px',
    borderRadius: t.radius.card,
    border: t.hairline,
    background: t.surface,
    fontSize: t.size.text,
    lineHeight: '1.5',
    color: t.muted,
  }))
