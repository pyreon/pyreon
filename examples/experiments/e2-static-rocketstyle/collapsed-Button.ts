/**
 * Collapsed: hand-written equivalent of what compile-time wrapper-collapse
 * SHOULD emit for `<Button state="primary" size="large">label-N</Button>`.
 *
 * The hypothesis: a future compiler pass detects the literal-prop call site,
 * runs the entire rocketstyle dimension chain at BUILD time, and emits a
 * single `_tpl()` cloneNode operation with the resolved class baked in.
 *
 * What this version skips vs the baseline:
 *   - rocketstyle wrapper component (no mount)
 *   - attrs HOC layer (no mount)
 *   - Element component (no mount)
 *   - Wrapper helper component (no mount)
 *   - styled() ComponentFn invocation (no mount, no styler.resolve at mount)
 *
 * What this version does:
 *   - cloneNode an `<button>` template
 *   - set the resolved class string (computed once, externally — see test)
 *   - append the text label as a child
 *
 * Cost comparison: ONE mountChild instead of FIVE. ZERO styler.resolve calls
 * per mount. Whether this matches the baseline visually is checked by
 * `e2.browser.test.ts` via DOM comparison.
 *
 * IMPORTANT — what's bypassed and might break:
 *   - Pseudo-state CSS (hover, focus, disabled) is applied to the resolved
 *     class via the sheet — the BASELINE puts those rules into the sheet
 *     during its first mount, and the COLLAPSED version re-uses the same
 *     class. So pseudo-state styling works iff the baseline ran first.
 *   - Event delegation: the collapsed version doesn't register any onClick
 *     handler. For a real compiler pass, the call site's onClick would be
 *     baked in via the standard delegation expando.
 *   - Reactive props (signal-driven dimension changes) are NOT supported by
 *     this collapsed shape. The compiler would NOT collapse those call
 *     sites; they'd fall through to the regular rocketstyle path.
 */

import type { NativeItem } from '@pyreon/core'
import { _tpl } from '@pyreon/runtime-dom'

/**
 * Returns a `NativeItem` (cloneNode-prebuilt DOM) that, when mounted,
 * produces a single `<button>` with the pre-resolved class and the
 * given label text.
 *
 * The `resolvedClass` is the class string that the rocketstyle pipeline
 * would assign to `<Button state="primary" size="large">` after its full
 * dimension merge. The test captures it from a baseline mount and passes
 * it here, simulating what the compiler pass would emit.
 */
export function makeCollapsedButton(label: string, resolvedClass: string): NativeItem {
  return _tpl(
    `<button class="${resolvedClass}"></button>`,
    (root) => {
      // Set the text child once. No reactive binding — this models a
      // literal-string label call site, the same shape that benefits from
      // the rest of the compile-time collapse.
      root.textContent = label
      return null
    },
  )
}
