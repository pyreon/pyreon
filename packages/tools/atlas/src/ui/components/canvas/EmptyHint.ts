import { txt, type T } from '../../kit'

/**
 * Shown UNDER the frame when the preview surface holds no DOM at all. A blank
 * stage says nothing; this says what happened and where the fix lives. It is
 * a sibling of the frame, not a child of the surface — inside it, the hint
 * would count as rendered content and hide itself.
 */
export const EmptyHint = txt
  .attrs({ tag: 'p' })
  .theme((t: T) => ({
    maxWidth: '440px',
    marginTop: '4px',
    padding: '10px 14px',
    borderRadius: t.radius.chip,
    border: t.hairline,
    background: t.surface,
    color: t.muted,
    fontSize: t.size.label,
    lineHeight: '1.5',
    textAlign: 'center',
  }))
