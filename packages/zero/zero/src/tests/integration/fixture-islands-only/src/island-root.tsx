import type { VNodeChild } from '@pyreon/core'
import { provide } from '@pyreon/core'
import { Theme } from './theme'

// The root every standalone island hydrates under: the provider the layout
// gives it on the server. Renders only its children, so the island adopts
// its server HTML.
export default function IslandRoot(props: { children?: VNodeChild }) {
  provide(Theme, 'dark')
  return props.children ?? null
}
