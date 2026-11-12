/**
 * The preview's own theme boundary.
 *
 * The chrome renders under the Pyreon chrome tokens; the user's component
 * renders under the PREVIEW brand tokens (`tokens(brand, dark)` — what a
 * catalog built on Atlas's `el`/`txt` bases styles from), so switching the
 * workbench chrome never restyles the component under test, and switching the
 * preview brand never restyles the chrome. A project wrapper (atlas.config.ts)
 * still receives `mode` / `brand` and themes its own components inside.
 *
 * Both props are ACCESSORS: the UI ships prebuilt without the compiler's
 * `_rp()` wrapping, so a plain value would be read once and a brand or mode
 * flip would never reach the preview.
 */
import type { VNodeChild } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import type { WorkbenchModel } from '../../model'

export function PreviewTheme(props: { model: WorkbenchModel; children?: VNodeChild }) {
  const m = props.model
  // Through the model's per-recording theme cells (`previewTheme`), and
  // re-mounted with them: when Reactive coverage starts a recording, the
  // provider's own nodes are created inside it, so a binding that reads the
  // theme is traced back to `theme` / `mode` instead of to state the
  // recording cannot see.
  return () => {
    const cells = m.previewTheme()
    return (
      <PyreonUI theme={(() => cells.theme()) as never} mode={() => cells.mode()}>
        {props.children}
      </PyreonUI>
    )
  }
}
