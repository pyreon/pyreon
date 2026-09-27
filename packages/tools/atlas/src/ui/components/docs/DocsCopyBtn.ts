import { el, type T } from '../../kit'

/**
 * The usage snippet's Copy action — a real, bordered button that sits UNDER
 * the snippet, right-aligned. It used to borrow the canvas `ZoomBtn` (a bare
 * glyph button made for `−`/`+`), which rendered "Copy" as loose text jammed
 * against the next heading.
 */
export const DocsCopyBtn = el
  .attrs({
    tag: 'button',
  })
  .theme((t: T) => ({
    font: 'inherit',
    fontSize: t.size.small,
    fontWeight: '600',
    cursor: 'pointer',
    alignSelf: 'flex-end',
    padding: '6px 12px',
    marginTop: '8px',
    marginBottom: '24px',
    borderRadius: t.radius.item,
    border: t.hairline,
    background: t.surface,
    color: t.text,
    hover: { borderColor: t.accent },
  }))
