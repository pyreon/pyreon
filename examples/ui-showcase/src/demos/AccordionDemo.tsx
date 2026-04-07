import { signal } from '@pyreon/reactivity'

function AccordionItem(props: { title: string; content: string; defaultOpen?: boolean }) {
  const open = signal(props.defaultOpen ?? false)

  const toggle = () => {
    open.set(!open())
  }

  return (
    <div style="border-bottom: 1px solid #e5e7eb;">
      <div
        onClick={toggle}
        style="width: 100%; padding: 12px 0; display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-size: 14px; font-weight: 500; color: #111827;"
      >
        <span>{props.title}</span>
        <span>{() => open() ? '−' : '+'}</span>
      </div>
      {() => open() ? (
        <p style="padding: 0 0 12px; font-size: 14px; color: #6b7280; line-height: 1.5;">
          {props.content}
        </p>
      ) : null}
    </div>
  )
}

export function AccordionDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Accordion</h2>

      <div style="border-top: 1px solid #e5e7eb; max-width: 600px;">
        <AccordionItem
          title="What is Pyreon?"
          content="Pyreon is a signal-based UI framework with fine-grained reactivity, SSR, SSG, islands, and SPA support. It compiles JSX to optimized template cloning for maximum performance."
          defaultOpen
        />
        <AccordionItem
          title="How does reactivity work?"
          content="Pyreon uses signals for fine-grained reactivity. Components run once, and only the specific DOM nodes that depend on a signal update when it changes. No virtual DOM diffing needed."
        />
        <AccordionItem
          title="Is Pyreon open source?"
          content="Yes, Pyreon is open source and free to use under the MIT license. The full source code is available on GitHub."
        />
      </div>
    </div>
  )
}
