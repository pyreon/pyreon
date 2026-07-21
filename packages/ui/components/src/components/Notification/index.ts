import { el } from '../../factory'

/**
 * Ambient notification card. A11y: a POLITE live region
 * (`role="status"` + `aria-live="polite"`) so it announces without
 * interrupting — even at `state="error"`. Override with `role`/`aria-live`
 * to escalate a truly urgent one. All ARIA is a default.
 */
const Notification = el
  .config({ name: 'Notification' })
  // A11y — Notification is an AMBIENT card (toast-like), so it is a POLITE
  // live region: `role="status"` + `aria-live="polite"`, which announces the
  // message at the next graceful opportunity WITHOUT interrupting. This is a
  // deliberate contrast with `Alert` (a banner that can be a critical,
  // interrupting error): a notification is a passive surface the user
  // dismisses, so it never interrupts by default — even at `state="error"`.
  // Explicit `aria-live` accompanies `role` for the same reliability reason as
  // Alert (the card's content commonly changes while mounted). Both are
  // DEFAULTS — for a genuinely urgent notification pass `role="alert"` /
  // `aria-live="assertive"` (direct props override `.attrs()` via mergeProps).
  .attrs({
    tag: 'div',
    role: 'status',
    'aria-live': 'polite',
    direction: 'inline',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'top',
    alignY: 'top',
    block: true,
  })
  .theme((t) => ({
    padding: t.spacing.small,
    borderRadius: t.borderRadius.base,
    boxShadow: t.shadows.base,
    fontSize: t.fontSize.small,
    lineHeight: t.lineHeight.base,
    backgroundColor: t.color.system.light.base,
    borderWidthLeft: '0',
    borderStyleLeft: 'solid',
    borderColorLeft: 'transparent',
  }))
  .states((t) => ({
    info: {
      borderWidthLeft: '4px',
      borderColorLeft: t.color.system.info.base,
    },
    success: {
      borderWidthLeft: '4px',
      borderColorLeft: t.color.system.success.base,
    },
    warning: {
      borderWidthLeft: '4px',
      borderColorLeft: t.color.system.warning.base,
    },
    error: {
      borderWidthLeft: '4px',
      borderColorLeft: t.color.system.error.base,
    },
  }))

export default Notification
