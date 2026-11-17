import type { VNodeChild } from '@pyreon/core'
import { Container } from '@pyreon/coolgrid'
import { layout } from '../../theme'

/** `.wrap` — the page column: `layout.maxWidth` wide, with the side gutters (`layout.gutter`, 16px on phones, 40px from md). */
export function Wrap(props: { children?: VNodeChild }) {
  return (
    <Container
      width={layout.maxWidth}
      css={{
        xs: `padding-left:${layout.gutter.xs}px;padding-right:${layout.gutter.xs}px;`,
        md: `padding-left:${layout.gutter.md}px;padding-right:${layout.gutter.md}px;`,
      }}
    >
      {props.children}
    </Container>
  )
}
