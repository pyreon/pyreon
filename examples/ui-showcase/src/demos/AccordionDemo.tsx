import { signal } from '@pyreon/reactivity'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, Title } from '@pyreon/ui-components'

function AccordionEntry(props: { title: string; content: string; defaultOpen?: boolean }) {
  const open = signal(props.defaultOpen ?? false)

  return (
    <AccordionItem>
      <AccordionTrigger onClick={() => open.set(!open())}>
        <span>{props.title}</span>
        <span>{() => open() ? '−' : '+'}</span>
      </AccordionTrigger>
      <div>
        {() => open() ? (
          <AccordionContent>{props.content}</AccordionContent>
        ) : null}
      </div>
    </AccordionItem>
  )
}

export function AccordionDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Accordion</Title>

      <Accordion style="max-width: 600px;">
        <AccordionEntry
          title="What is Pyreon?"
          content="Pyreon is a signal-based UI framework with fine-grained reactivity, SSR, SSG, islands, and SPA support. It compiles JSX to optimized template cloning for maximum performance."
          defaultOpen
        />
        <AccordionEntry
          title="How does reactivity work?"
          content="Pyreon uses signals for fine-grained reactivity. Components run once, and only the specific DOM nodes that depend on a signal update when it changes. No virtual DOM diffing needed."
        />
        <AccordionEntry
          title="Is Pyreon open source?"
          content="Yes, Pyreon is open source and free to use under the MIT license. The full source code is available on GitHub."
        />
      </Accordion>
    </div>
  )
}
