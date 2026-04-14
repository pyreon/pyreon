import { useClickOutside, useElementSize, useIntersection, useWindowResize } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { Button, Title, Paragraph } from '@pyreon/ui-components'

export function HooksDomDemo() {
  // useWindowResize
  const window = useWindowResize()

  // useElementSize
  let sizeEl: HTMLElement | null = null
  const elemSize = useElementSize(() => sizeEl)

  // useClickOutside
  const open = signal(false)
  let dropdownEl: HTMLElement | null = null
  useClickOutside(() => dropdownEl, () => open.set(false))

  // useIntersection
  let intersectEl: HTMLElement | null = null
  const intersection = useIntersection(() => intersectEl, { threshold: 0.5 })

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">DOM Observer Hooks</Title>

      <Title size="h3" style="margin-bottom: 12px">useWindowResize()</Title>
      <p style="margin-bottom: 24px;">
        Window: <strong>{() => `${window().width} × ${window().height}`}</strong>
      </p>

      <Title size="h3" style="margin-bottom: 12px">useElementSize(ref)</Title>
      <Paragraph style="margin-bottom: 12px; font-size: 13px;">Resize the box (drag the corner):</Paragraph>
      <div
        ref={(el: HTMLElement | null) => { sizeEl = el }}
        style="padding: 24px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; resize: both; overflow: auto; min-width: 150px; min-height: 80px; max-width: 100%; margin-bottom: 8px;"
      >
        Drag corner to resize
      </div>
      <p style="font-size: 13px; color: #6b7280; margin-bottom: 24px;">
        Size: <strong>{() => `${Math.round(elemSize().width)} × ${Math.round(elemSize().height)}`}</strong>
      </p>

      <Title size="h3" style="margin-bottom: 12px">useClickOutside(ref, handler)</Title>
      <div style="position: relative; max-width: 280px; margin-bottom: 24px;">
        <Button state="primary" onClick={() => open.set(!open())}>Open Dropdown</Button>
        {() =>
          open() ? (
            <div
              ref={(el: HTMLElement | null) => { dropdownEl = el }}
              style="position: absolute; top: 100%; left: 0; margin-top: 8px; padding: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 200px;"
            >
              Click outside to close.
            </div>
          ) : null
        }
      </div>

      <Title size="h3" style="margin-bottom: 12px">useIntersection(ref)</Title>
      <Paragraph style="margin-bottom: 12px; font-size: 13px;">Scroll to see the box become visible:</Paragraph>
      <div style="height: 200px; overflow-y: auto; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px;">
        <div style="height: 250px;">Scroll down ↓</div>
        <div
          ref={(el: HTMLElement | null) => { intersectEl = el }}
          style={() =>
            `padding: 16px; background: ${(intersection() as IntersectionObserverEntry | null)?.isIntersecting ? '#dcfce7' : '#fef3c7'}; border-radius: 6px; transition: background 0.3s;`
          }
        >
          Status: {() => ((intersection() as IntersectionObserverEntry | null)?.isIntersecting ? 'visible' : 'not visible')}
        </div>
        <div style="height: 100px;"></div>
      </div>
    </div>
  )
}
