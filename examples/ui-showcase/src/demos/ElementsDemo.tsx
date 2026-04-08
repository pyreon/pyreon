import { Element, List, Text } from '@pyreon/elements'
import { Title, Paragraph } from '@pyreon/ui-components'

function FruitItem(props: { label: string; first?: boolean; last?: boolean }) {
  return (
    <li
      style={() =>
        `padding: 12px 16px; background: #f9fafb; border-bottom: ${props.last ? 'none' : '1px solid #e5e7eb'}; border-top-left-radius: ${props.first ? '8px' : '0'}; border-top-right-radius: ${props.first ? '8px' : '0'};`
      }
    >
      {props.label}
    </li>
  )
}

const fruits = [
  { id: 1, label: 'Apples' },
  { id: 2, label: 'Bananas' },
  { id: 3, label: 'Cherries' },
  { id: 4, label: 'Dates' },
]

export function ElementsDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Elements (low-level primitives)</Title>
      <Paragraph style="margin-bottom: 24px">
        `@pyreon/elements` provides three foundational primitives: Element (3-slot layout), Text (typography), List (data-driven rendering).
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">Element — three-slot layout</Title>
      <Paragraph style="margin-bottom: 12px; font-size: 13px;">
        beforeContent | children | afterContent — flex layout with alignment props.
      </Paragraph>
      <Element
        tag="div"
        direction="inline"
        gap={12}
        alignY="center"
        style="padding: 16px; background: #f3f4f6; border-radius: 8px; max-width: 400px; margin-bottom: 24px;"
        beforeContent={
          <span style="width: 32px; height: 32px; border-radius: 50%; background: #3b82f6; color: white; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600;">
            VB
          </span>
        }
        afterContent={
          <span style="padding: 4px 8px; background: #10b981; color: white; border-radius: 4px; font-size: 11px;">
            online
          </span>
        }
      >
        <div>
          <div style="font-weight: 600;">Vít Bokisch</div>
          <div style="font-size: 12px; color: #6b7280;">Pyreon Framework Author</div>
        </div>
      </Element>

      <Title size="h3" style="margin-bottom: 12px">Text — semantic typography</Title>
      <div style="margin-bottom: 24px;">
        <Text tag="h4" style="margin-bottom: 8px;">A heading via Text tag="h4"</Text>
        <Text tag="p">Standard paragraph via Text component.</Text>
        <Text tag="strong">Strong/bold text</Text>
        {' • '}
        <Text tag="em">Emphasized italic</Text>
      </div>

      <Title size="h3" style="margin-bottom: 12px">List — data-driven rendering</Title>
      <Paragraph style="margin-bottom: 12px; font-size: 13px;">
        Renders `data` array through a `component` prop with positional metadata (first, last, odd/even, position).
      </Paragraph>
      <ul style="list-style: none; padding: 0; max-width: 400px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <List data={fruits} component={FruitItem} />
      </ul>
    </div>
  )
}
