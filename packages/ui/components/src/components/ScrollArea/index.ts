import { el } from '../../factory'

/**
 * Styled scroll container with themed thin scrollbars.
 *
 * A11y: a scrollable region must be reachable and announced — `tabIndex=0`
 * (keyboard users can focus it and scroll with arrows), `role="region"`, and
 * a DEFAULT `aria-label` (override per instance; WAI-ARIA: scrollable regions
 * need an accessible name).
 *
 * Scrollbar styling uses the CSS standards path (`scrollbar-width` +
 * `scrollbar-color` — Chromium 121+, Firefox long-standing) PLUS the WebKit
 * pseudo-elements via extendCss for Safari.
 */
const ScrollArea = el
  .config({ name: 'ScrollArea' })
  .attrs({ tag: 'div', tabIndex: 0, role: 'region', 'aria-label': 'Scrollable content' })
  .theme((t) => ({
    overflow: 'auto',
    scrollbarWidth: 'thin',
    scrollbarColor: `${t.color.system.base[300]} transparent`,
    extendCss: `
      &::-webkit-scrollbar { width: 8px; height: 8px; }
      &::-webkit-scrollbar-track { background: transparent; }
      &::-webkit-scrollbar-thumb {
        background: ${t.color.system.base[300]};
        border-radius: 4px;
      }
    `,
  }))
  .variants(() => ({
    vertical: { overflowX: 'hidden', overflowY: 'auto' },
    horizontal: { overflowX: 'auto', overflowY: 'hidden' },
    both: { overflow: 'auto' },
  }))

export default ScrollArea
