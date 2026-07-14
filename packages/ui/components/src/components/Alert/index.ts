import { el } from '../../factory'

/**
 * Alert banner. A11y: a live region whose politeness follows the `state`
 * dimension — `error`/`warning` → assertive (`role="alert"`), everything
 * else → polite (`role="status"`). `aria-live` is set alongside `role`.
 * All ARIA is a default; pass `role`/`aria-live` to override.
 */
const Alert = el
  .config({ name: 'Alert' })
  // A11y — Alert is a live-region banner. WAI-ARIA:
  //   role="alert"  → ASSERTIVE live region (interrupts the user — for
  //                   errors / important warnings)
  //   role="status" → POLITE live region (announced at the next graceful
  //                   opportunity — for info / success / neutral messages)
  // The default is SEVERITY-DRIVEN off the `state` dimension: error/warning →
  // assertive alert; info/success (and no `state`, since the base is visually
  // an info alert) → polite status. `aria-live` is set explicitly alongside
  // `role` on purpose — an alert banner usually pre-exists in the DOM and its
  // CONTENT changes while mounted, where an explicit `aria-live` announces far
  // more reliably across screen readers than the role's implicit live region.
  // Both are DEFAULTS: a consumer-supplied `role` / `aria-live` wins (direct
  // props override `.attrs()` via mergeProps). Reference libs genuinely
  // disagree on the hardcoded role, so we bind it to severity + let you
  // override. NOTE: `state` is read once at setup (like every `.attrs()`
  // callback) — an alert whose severity is fixed at creation (the dominant
  // case) is correct; if you flip severity at runtime AND need the role to
  // follow, pass `role` / `aria-live` explicitly.
  .attrs<{ state?: 'info' | 'success' | 'warning' | 'error' }>((props) => {
    const assertive = props.state === 'error' || props.state === 'warning'
    return {
      tag: 'div',
      role: assertive ? 'alert' : 'status',
      'aria-live': assertive ? 'assertive' : 'polite',
      direction: 'inline',
      alignY: 'top',
      block: true,
    }
  })
  .theme((t) => ({
    padding: t.spacing.small,
    borderRadius: t.borderRadius.base,
    fontSize: t.fontSize.small,
    lineHeight: t.lineHeight.base,
    backgroundColor: t.color.system.info[100],
    color: t.color.system.info[800],
    borderWidthLeft: '4px',
    borderStyleLeft: 'solid',
    borderColorLeft: t.color.system.info.base,
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'transparent',
  }))
  .states((t) => ({
    info: {
      backgroundColor: t.color.system.info[100],
      color: t.color.system.info[800],
      borderColorLeft: t.color.system.info.base,
    },
    success: {
      backgroundColor: t.color.system.success[100],
      color: t.color.system.success[800],
      borderColorLeft: t.color.system.success.base,
    },
    warning: {
      backgroundColor: t.color.system.warning[100],
      color: t.color.system.warning[800],
      borderColorLeft: t.color.system.warning.base,
    },
    error: {
      backgroundColor: t.color.system.error[100],
      color: t.color.system.error[800],
      borderColorLeft: t.color.system.error.base,
    },
  }))
  .variants((t) => ({
    subtle: {},
    solid: {
      backgroundColor: t.color.system.info.base,
      color: t.color.system.light.base,
      borderWidthLeft: '0',
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: '1px',
      borderColor: 'currentColor',
      borderWidthLeft: '1px',
    },
  }))

export default Alert
