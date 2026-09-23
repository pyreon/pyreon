/**
 * `jsx` from `preact/jsx-runtime`, re-typed so its key slot accepts a NUMBER.
 *
 * `preact/jsx-runtime`'s .d.ts types the key parameter as `string`, while
 * Preact's own `Attributes.key` (what `<Row key={i}>` type-checks against) is
 * `Key` = `string | number | any`, and the runtime stores it verbatim. esbuild's
 * automatic-runtime emit passes the source expression unchanged — a number for
 * `key={i}` — so this re-types the slot to match the JSX source rather than
 * stringifying the key. Same helper `impl/preact.ts` defines locally.
 */
import type { ComponentType, Key, VNode } from 'preact'
import { jsx } from 'preact/jsx-runtime'

export const preactJsxKeyed = jsx as <P>(
  type: ComponentType<P> | string,
  props: P,
  key: Key,
) => VNode<P>
