import type { VNodeChild } from '@pyreon/core'
import { el } from '../kit/bases'

/**
 * A wide asset-set figure (a measured chart, a code-on-both-sides
 * illustration) on the story, compare and migrate pages. These are drawn for
 * about 960px; on a phone, shrinking them to the column made their text a few
 * pixels tall. Below 640px they keep a 640px minimum and scroll sideways in
 * their own box instead (the `Diagram` inside is a labelled, focusable region
 * for that). The same rule as the /benchmarks charts.
 */
const Box = el
  .config({ name: 'WideDiagram' })
  .attrs({ block: true })
  .theme(() => ({
    minWidth: 0,
    extendCss: `& [data-svg] { overflow-x: auto !important; }
      & [data-svg] svg { min-width: 640px; }`,
  }))

export function WideDiagram(props: { children?: VNodeChild }) {
  return <Box>{props.children}</Box>
}
