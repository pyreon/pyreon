// Prop types for the escape-hatch primitives (`<Web>` / `<NativeIOS>` /
// `<NativeAndroid>`). They carry only children — the per-platform subtree
// to render on the matching target.

import type { VNodeChild } from '@pyreon/core'

export interface EscapeHatchProps {
  /**
   * The platform-specific subtree. Rendered only on the matching target:
   * `<Web>` children on web, `<NativeIOS>` children on iOS, `<NativeAndroid>`
   * children on Android. On every other target this branch renders nothing.
   */
  children?: VNodeChild
}
