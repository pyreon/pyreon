import {
  Prose,
  ProseCode,
  ProseH2,
  ProseH3,
  ProseList,
  ProseListItem,
  ProseP,
  ProseQuote,
  ProseQuoteCite,
} from './styled'
import type { Block } from './content/types'

interface BlockRendererProps {
  /** Pre-resolved blocks. The renderer is structurally pure — no signal reads. */
  blocks: Block[]
}

/**
 * Render a `Block[]` to JSX. Each block kind maps to a styled prose
 * component so the post body inherits the theme tokens automatically.
 *
 * Kept structural and small on purpose: a real CMS would swap this for
 * an MDX renderer or `@pyreon/document`'s tree builder, but for the
 * showcase a typed switch is easier to read and learn from.
 */
export function BlockRenderer(props: BlockRendererProps) {
  return (
    <Prose>
      {props.blocks.map((block) => {
        switch (block.kind) {
          case 'p':
            return <ProseP>{block.text}</ProseP>
          case 'h2':
            return <ProseH2>{block.text}</ProseH2>
          case 'h3':
            return <ProseH3>{block.text}</ProseH3>
          case 'quote':
            return (
              <ProseQuote>
                {block.text}
                {block.cite ? <ProseQuoteCite>{block.cite}</ProseQuoteCite> : null}
              </ProseQuote>
            )
          case 'code':
            return (
              <ProseCode>
                <code>{block.text}</code>
              </ProseCode>
            )
          case 'list':
            return (
              <ProseList>
                {block.items.map((item) => (
                  <ProseListItem>{item}</ProseListItem>
                ))}
              </ProseList>
            )
        }
      })}
    </Prose>
  )
}
