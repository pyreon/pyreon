import { font, motion, paper } from '../theme'
import { el, type ButtonAttrs } from '../kit/bases'

/**
 * Shared by the products-b demos (i18n, url-state, feature): a toggle
 * button for the paper "real app" surface, and the wrapping row that holds
 * a group of them (a `<fieldset>`: label it with `aria-labelledby`). Unlike
 * the kit's dark `Segmented`, the row wraps at 320px.
 * Set `aria-pressed` on each button; the pressed look follows it.
 */
export const ToggleRow = el
  .config({ name: 'PaperToggleRow' })
  .attrs({ tag: 'fieldset', block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 6 })
  .theme(() => ({
    minWidth: 0,
    margin: 0,
    padding: 0,
    border: 'none',
    // Element renders a fieldset's content in an inner flex box (fieldsets
    // cannot be flex containers everywhere); the wrap must be set on that box.
    extendCss: '& > div { flex-wrap: wrap; min-width: 0; }',
  }))

export const PaperToggle = el
  .config({ name: 'PaperToggle' })
  .attrs<ButtonAttrs>({ tag: 'button', contentAlignY: 'center' })
  .theme(() => ({
    height: 34,
    minWidth: 40,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: 8,
    border: '1px solid',
    borderColor: paper.line,
    backgroundColor: paper.field,
    color: paper.text,
    fontFamily: font.system,
    fontSize: 13,
    transition: `background-color ${motion.hover}, border-color ${motion.hover}`,
    hover: { borderColor: paper.mist },
    pressed: { backgroundColor: paper.text, borderColor: paper.text, color: paper.bg },
    disabled: { opacity: 0.45, cursor: 'not-allowed' },
    extendCss: `&:focus-visible { outline: 2px solid ${paper.accent}; outline-offset: 2px; } @media (prefers-reduced-motion: reduce) { transition: none; }`,
  }))
