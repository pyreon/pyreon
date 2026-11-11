import type { VNodeChild } from '@pyreon/core'
import { renderInline } from '../site/kit/type'

/**
 * Content-set inline markup (`code`, {dot:…}, <small>) as a COMPONENT child.
 * `{renderInline(text)}` straight in JSX is a compiled text slot holding an
 * array of strings and elements, which hydration re-creates instead of
 * adopting (#4385); returned from a component it adopts.
 */
export function Inline(props: { text: string }): VNodeChild {
  return renderInline(props.text)
}
