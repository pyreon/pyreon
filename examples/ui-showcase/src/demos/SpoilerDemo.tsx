import { signal } from '@pyreon/reactivity'
import { Spoiler, Button, Paragraph } from '@pyreon/ui-components'

export function SpoilerDemo() {
  const show1 = signal(false)
  const show2 = signal(false)
  const show3 = signal(false)

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Spoiler</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Show more/less toggle for hiding content behind a reveal button.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Spoiler</h3>
      <div style="max-width: 500px; margin-bottom: 24px;">
        <Spoiler style={`max-height: ${show1() ? 'none' : '60px'}; transition: max-height 0.3s ease;`}>
          <Paragraph>
            Pyreon is a signal-based UI framework designed for high performance. It uses
            fine-grained reactivity through signals and computed values. The compiler
            transforms JSX into optimized DOM operations using template cloning and
            per-node binding. Server-side rendering supports both string and streaming
            modes with Suspense. The island architecture enables partial hydration for
            optimal loading performance.
          </Paragraph>
        </Spoiler>
        <Button
          size="sm"
          variant="link"
          {...{ state: 'primary' } as any}
          style="margin-top: 4px;"
          onClick={() => show1.set(!show1())}
        >
          {() => show1() ? 'Show less' : 'Show more'}
        </Button>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Long Content</h3>
      <div style="max-width: 500px; margin-bottom: 24px;">
        <Spoiler style={`max-height: ${show2() ? 'none' : '80px'}; transition: max-height 0.3s ease;`}>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <Paragraph>
              <strong>Chapter 1: Signals</strong> - Signals are the core reactive primitive
              in Pyreon. A signal is a callable function with .set() and .update() methods.
            </Paragraph>
            <Paragraph>
              <strong>Chapter 2: Effects</strong> - Effects run side-effects whenever their
              dependencies change. They automatically track signal reads.
            </Paragraph>
            <Paragraph>
              <strong>Chapter 3: Computed</strong> - Computed values derive state from other
              signals. They are lazy — only recalculated when read.
            </Paragraph>
            <Paragraph>
              <strong>Chapter 4: Components</strong> - Components are plain functions that
              run once. Reactivity comes from signal reads in JSX expressions.
            </Paragraph>
            <Paragraph>
              <strong>Chapter 5: SSR</strong> - Server-side rendering with string and
              streaming modes, Suspense support, and island architecture.
            </Paragraph>
          </div>
        </Spoiler>
        <Button
          size="sm"
          variant="link"
          {...{ state: 'primary' } as any}
          style="margin-top: 4px;"
          onClick={() => show2.set(!show2())}
        >
          {() => show2() ? 'Collapse' : `Expand (${5} chapters)`}
        </Button>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Card with Spoiler</h3>
      <div style="max-width: 500px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 24px;">
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <div style="width: 40px; height: 40px; border-radius: 50%; background: #e0e7ff; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <span style="font-weight: 600; color: #4f46e5;">P</span>
          </div>
          <div>
            <p style="font-weight: 600;">Pyreon Release Notes</p>
            <p style="font-size: 12px; color: #9ca3af;">Published 2 hours ago</p>
          </div>
        </div>
        <Spoiler style={`max-height: ${show3() ? 'none' : '48px'}; transition: max-height 0.3s ease;`}>
          <Paragraph style="margin-bottom: 8px;">
            We are excited to announce Pyreon v2.0 with major improvements across the board.
          </Paragraph>
          <ul style="font-size: 14px; padding-left: 20px; display: flex; flex-direction: column; gap: 4px;">
            <li>New compiler with 2x faster JSX transforms</li>
            <li>Streaming SSR with 30s Suspense timeout</li>
            <li>75 UI components with rocketstyle</li>
            <li>Signal-preserving HMR in dev mode</li>
            <li>View Transitions API for route changes</li>
          </ul>
        </Spoiler>
        <Button
          size="sm"
          variant="link"
          {...{ state: 'primary' } as any}
          style="margin-top: 8px;"
          onClick={() => show3.set(!show3())}
        >
          {() => show3() ? 'Show less' : 'Read more'}
        </Button>
      </div>
    </div>
  )
}
