import { fade, kinetic } from '@pyreon/kinetic'
import { signal } from '@pyreon/reactivity'
import { Button, Title, Paragraph } from '@pyreon/ui-components'

const FadePanel = kinetic('div').preset(fade)

const tabs = ['Overview', 'Features', 'Pricing'] as const
type Tab = (typeof tabs)[number]

const content: Record<Tab, { title: string; body: string }> = {
  Overview: {
    title: 'Overview',
    body: 'Pyreon is a signal-based UI framework with fine-grained reactivity. Components run once, only the DOM nodes that depend on a signal update.',
  },
  Features: {
    title: 'Features',
    body: 'SSR, SSG, islands, SPA, file-based routing, fine-grained signals, no virtual DOM diffing, optimized template cloning.',
  },
  Pricing: {
    title: 'Pricing',
    body: 'Pyreon is open source and free to use under the MIT license. Source available on GitHub.',
  },
}

export function AnimationsTabPatternDemo() {
  const active = signal<Tab>('Overview')

  return (
    <div>
      <Title size="h2" style="margin-bottom: 12px">Tab Cross-Fade Pattern</Title>
      <Paragraph style="margin-bottom: 24px">
        Each tab panel mounts/unmounts with a fade animation. Switching tabs cross-fades the content.
      </Paragraph>

      <div style="display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid #e5e7eb;">
        {tabs.map((tab) => (
          <Button
            state="secondary"
            variant="ghost"
            onClick={() => active.set(tab)}
            style={() =>
              `border-radius: 0; border-bottom: 2px solid ${active() === tab ? '#3b82f6' : 'transparent'}; color: ${active() === tab ? '#3b82f6' : '#6b7280'};`
            }
          >
            {tab}
          </Button>
        ))}
      </div>

      <div style="position: relative; min-height: 120px;">
        {tabs.map((tab) => (
          <FadePanel
            show={() => active() === tab}
            style="padding: 16px; background: #f9fafb; border-radius: 8px; position: absolute; inset: 0;"
          >
            <Title size="h3" style="margin-bottom: 8px">{content[tab]!.title}</Title>
            <Paragraph>{content[tab]!.body}</Paragraph>
          </FadePanel>
        ))}
      </div>
    </div>
  )
}
