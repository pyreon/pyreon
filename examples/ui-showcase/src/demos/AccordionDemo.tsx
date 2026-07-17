import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Title } from '@pyreon/ui-components'
import { useAccordion, useAccordionItem } from '@pyreon/ui-primitives'

/**
 * The +/− indicator is its own component because it reads the item's expanded
 * state from CONTEXT — `useAccordionItem()` is only available to a CHILD of
 * `<AccordionItem>`, not to the component that renders it.
 */
function Indicator() {
  const acc = useAccordion()
  const item = useAccordionItem()
  // `item.value` is a GETTER on the context object (not a function) — reading
  // it inside this accessor keeps it live rather than snapshotting at setup.
  return () => (acc.isExpanded(item.value) ? '−' : '+')
}

export function AccordionDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Accordion</Title>

      {/*
        Declarative: `<Accordion>` owns the disclosure state. This demo used to
        hand-roll ALL of it — its own `signal`, its own toggle, its own
        conditional render — and shipped with NO aria-expanded, no
        aria-controls and no keyboard, because the component was an inert
        styled div. The primitive provides all of that now; `defaultValue`
        opens the first panel. Add `multiple` (+ a string[] value) to let
        several stay open at once.
      */}
      <Accordion defaultValue="what" style="max-width: 600px;">
        <AccordionItem value="what">
          <AccordionTrigger>
            <span>What is Pyreon?</span>
            <Indicator />
          </AccordionTrigger>
          <AccordionContent>
            Pyreon is a signal-based UI framework with fine-grained reactivity, SSR, SSG, islands,
            and SPA support. It compiles JSX to optimized template cloning for maximum performance.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="reactivity">
          <AccordionTrigger>
            <span>How does reactivity work?</span>
            <Indicator />
          </AccordionTrigger>
          <AccordionContent>
            Pyreon uses signals for fine-grained reactivity. Components run once, and only the
            specific DOM nodes that depend on a signal update when it changes. No virtual DOM
            diffing needed.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="oss">
          <AccordionTrigger>
            <span>Is Pyreon open source?</span>
            <Indicator />
          </AccordionTrigger>
          <AccordionContent>
            Yes, Pyreon is open source and free to use under the MIT license. The full source code
            is available on GitHub.
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <p style="font-size: 13px; color: #6b7280; margin-top: 12px;">
        Arrow keys move between headers · Home/End jump to first/last
      </p>
    </div>
  )
}
