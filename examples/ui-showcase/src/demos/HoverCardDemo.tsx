import { HoverCard, Title, Paragraph, Badge } from '@pyreon/ui-components'

export function HoverCardDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">HoverCard</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Hover-triggered floating card for preview content. Shares styling with Popover.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">User Preview</h3>
      <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px;">
        <HoverCard style="max-width: 300px;">
          <div style="display: flex; gap: 12px; margin-bottom: 12px;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: #dbeafe; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <span style="font-weight: 600; color: #2563eb;">AB</span>
            </div>
            <div>
              <p style="font-weight: 600; font-size: 14px;">Alice Bennett</p>
              <p style="font-size: 12px; color: #6b7280;">@alicebennett</p>
            </div>
          </div>
          <Paragraph style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">
            Full-stack developer passionate about reactive UI frameworks and open source.
          </Paragraph>
          <div style="display: flex; gap: 16px; font-size: 12px; color: #6b7280;">
            <span><strong style="color: #111827;">142</strong> following</span>
            <span><strong style="color: #111827;">1.2k</strong> followers</span>
          </div>
        </HoverCard>

        <HoverCard style="max-width: 300px;">
          <div style="display: flex; gap: 12px; margin-bottom: 12px;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: #fef3c7; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <span style="font-weight: 600; color: #d97706;">CS</span>
            </div>
            <div>
              <p style="font-weight: 600; font-size: 14px;">Carlos Silva</p>
              <p style="font-size: 12px; color: #6b7280;">@carlos_dev</p>
            </div>
          </div>
          <Paragraph style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">
            UI/UX designer and front-end engineer. Currently building design systems at scale.
          </Paragraph>
          <div style="display: flex; gap: 8px;">
            <Badge {...{ state: 'primary' } as any} size="sm">TypeScript</Badge>
            <Badge {...{ state: 'success' } as any} size="sm">Design</Badge>
          </div>
        </HoverCard>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Repository Preview</h3>
      <div style="margin-bottom: 24px;">
        <HoverCard style="max-width: 320px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="width: 20px; height: 20px; border-radius: 4px; background: #f3f4f6; display: flex; align-items: center; justify-content: center;">
              <span style="font-size: 12px;">P</span>
            </div>
            <p style="font-weight: 600; font-size: 14px; color: #2563eb;">pyreon/pyreon</p>
          </div>
          <Paragraph style="font-size: 13px; color: #6b7280; margin-bottom: 12px;">
            Signal-based UI framework with fine-grained reactivity. SSR, SSG, islands, SPA.
          </Paragraph>
          <div style="display: flex; gap: 12px; font-size: 12px; color: #6b7280; margin-bottom: 8px;">
            <span style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #3178c6;" />
              TypeScript
            </span>
            <span>12.4k stars</span>
            <span>890 forks</span>
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <Badge size="sm">ui</Badge>
            <Badge size="sm">signals</Badge>
            <Badge size="sm">framework</Badge>
          </div>
        </HoverCard>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Link Preview</h3>
      <div style="margin-bottom: 24px;">
        <HoverCard style="max-width: 280px;">
          <div style="background: #f3f4f6; border-radius: 8px; height: 120px; margin: -16px -16px 12px; display: flex; align-items: center; justify-content: center;">
            <span style="color: #9ca3af; font-size: 14px;">Image Preview</span>
          </div>
          <Title size="h5" style="margin-bottom: 4px;">Getting Started with Pyreon</Title>
          <Paragraph style="font-size: 12px; color: #6b7280;">
            Learn how to build reactive UIs with the fastest signal-based framework.
          </Paragraph>
          <p style="font-size: 11px; color: #9ca3af; margin-top: 8px;">pyreon.dev</p>
        </HoverCard>
      </div>
    </div>
  )
}
