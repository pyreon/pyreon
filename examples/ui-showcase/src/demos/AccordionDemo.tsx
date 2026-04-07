
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Paragraph,
  Badge,
  Code,
} from '@pyreon/ui-components'

export function AccordionDemo() {

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Accordion</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Collapsible content sections with trigger buttons and animated disclosure.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Accordion</h3>
      <div style="max-width: 500px; margin-bottom: 24px;">
        <Accordion>
          <AccordionItem>
            <AccordionTrigger>What is Pyreon?</AccordionTrigger>
            <AccordionContent>
              <Paragraph>
                Pyreon is a signal-based UI framework with fine-grained reactivity,
                streaming SSR, and the fastest compile-time JSX transform.
              </Paragraph>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem>
            <AccordionTrigger>How does rocketstyle work?</AccordionTrigger>
            <AccordionContent>
              <Paragraph>
                Rocketstyle is a multi-dimensional styling engine. Define states, sizes,
                and variants as theme objects — they compose automatically with dark mode support.
              </Paragraph>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem>
            <AccordionTrigger>Is it production ready?</AccordionTrigger>
            <AccordionContent>
              <Paragraph>
                Yes! 75 components, all accessible, responsive, and theme-driven.
                Used in production applications with full SSR support.
              </Paragraph>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Rich Content</h3>
      <div style="max-width: 500px; margin-bottom: 24px;">
        <Accordion>
          <AccordionItem>
            <AccordionTrigger>
              <span style="display: flex; align-items: center; gap: 8px;">
                Getting Started
                <Badge size="sm" {...{ state: 'success' } as any}>Easy</Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <Paragraph style="margin-bottom: 8px;">
                Install Pyreon with your package manager:
              </Paragraph>
              <Code variant="inline" style="display: block; padding: 8px 12px; margin-bottom: 8px;">
                bun add @pyreon/core @pyreon/reactivity @pyreon/runtime-dom
              </Code>
              <Paragraph style="font-size: 13px; color: #6b7280;">
                Then import and start building reactive components.
              </Paragraph>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem>
            <AccordionTrigger>
              <span style="display: flex; align-items: center; gap: 8px;">
                Performance
                <Badge size="sm" {...{ state: 'primary' } as any}>Fast</Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; justify-content: space-between; font-size: 13px;">
                  <span>Create 1,000 rows</span>
                  <span style="font-weight: 500; color: #16a34a;">9ms</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 13px;">
                  <span>Replace 1,000 rows</span>
                  <span style="font-weight: 500; color: #16a34a;">10ms</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 13px;">
                  <span>Partial update</span>
                  <span style="font-weight: 500; color: #16a34a;">5ms</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 13px;">
                  <span>Create 10,000 rows</span>
                  <span style="font-weight: 500; color: #16a34a;">103ms</span>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem>
            <AccordionTrigger>
              <span style="display: flex; align-items: center; gap: 8px;">
                Ecosystem
                <Badge size="sm">51 packages</Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <Paragraph>
                Pyreon ships with a comprehensive ecosystem including store management,
                forms, validation, routing, i18n, charts, storage, hotkeys, permissions,
                state machines, flow diagrams, code editor, and more.
              </Paragraph>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Multiple Items</h3>
      <div style="max-width: 500px; margin-bottom: 24px;">
        <Accordion>
          <AccordionItem>
            <AccordionTrigger>Section 1: Introduction</AccordionTrigger>
            <AccordionContent>
              <Paragraph>Introduction content for the first section of the document.</Paragraph>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem>
            <AccordionTrigger>Section 2: Core Concepts</AccordionTrigger>
            <AccordionContent>
              <Paragraph>Core concepts covering signals, effects, and computed values.</Paragraph>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem>
            <AccordionTrigger>Section 3: Advanced Topics</AccordionTrigger>
            <AccordionContent>
              <Paragraph>Advanced topics including SSR, hydration, and island architecture.</Paragraph>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem>
            <AccordionTrigger>Section 4: API Reference</AccordionTrigger>
            <AccordionContent>
              <Paragraph>Complete API reference for all exported functions and types.</Paragraph>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem>
            <AccordionTrigger>Section 5: Migration Guide</AccordionTrigger>
            <AccordionContent>
              <Paragraph>Step-by-step migration from React, Vue, or Solid to Pyreon.</Paragraph>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}
