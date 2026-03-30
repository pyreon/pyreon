import { Col, Container, Row } from '@pyreon/coolgrid'
import { useClickOutside, useElementSize, useFocus, useHover, useToggle } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { FadeIn, SlideDown } from '../animations'
import { GhostButton, PrimaryButton } from '../components'
import { addNotification } from '../notifications'
import { Badge, Btn, Card, Code, FlexRow, SectionTitle } from '../primitives'

// ─── Hooks Tab ───────────────────────────────────────────────────────────────

export function HooksTab() {
  return (
    <FadeIn appear show={() => true}>
      <Container>
        <Row>
          <Col size={[12, 6]}>
            <HoverFocusDemo />
          </Col>
          <Col size={[12, 6]}>
            <ElementSizeDemo />
          </Col>
          <Col size={[12, 6]}>
            <ClickOutsideDemo />
          </Col>
          <Col size={[12, 6]}>
            <ToggleCounterDemo />
          </Col>
        </Row>
      </Container>
    </FadeIn>
  )
}

function HoverFocusDemo() {
  const { hovered, props: hoverProps } = useHover()
  const { focused, props: focusProps } = useFocus()

  return (
    <Card style={{ marginBottom: '16px' }}>
      <SectionTitle style={{ fontSize: '16px' }}>useHover + useFocus</SectionTitle>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          marginTop: '12px',
        }}
      >
        <div
          {...hoverProps}
          style={() => ({
            padding: '16px',
            borderRadius: '6px',
            background: hovered() ? 'var(--primary)' : 'var(--bg-surface)',
            color: hovered() ? '#fff' : 'var(--text)',
            transition: 'all 0.2s',
            textAlign: 'center',
            fontWeight: '500',
          })}
        >
          {() => (hovered() ? 'Hovered!' : 'Hover me')}
        </div>
        <input
          type="text"
          placeholder="Focus me..."
          {...focusProps}
          style={() => ({
            padding: '10px 14px',
            borderRadius: '6px',
            border: `2px solid ${focused() ? 'var(--primary)' : 'var(--border)'}`,
            background: 'var(--bg-surface)',
            color: 'var(--text)',
            outline: 'none',
            transition: 'border-color 0.2s',
          })}
        />
        <FlexRow>
          <Badge
            style={() => ({
              background: hovered() ? 'var(--primary)' : 'var(--bg-surface)',
              color: hovered() ? '#fff' : 'var(--text)',
            })}
          >
            {() => `hovered: ${hovered()}`}
          </Badge>
          <Badge
            style={() => ({
              background: focused() ? 'var(--primary)' : 'var(--bg-surface)',
              color: focused() ? '#fff' : 'var(--text)',
            })}
          >
            {() => `focused: ${focused()}`}
          </Badge>
        </FlexRow>
      </div>
    </Card>
  )
}

function ElementSizeDemo() {
  let boxRef: HTMLElement | null = null
  const size = useElementSize(() => boxRef)

  return (
    <Card style={{ marginBottom: '16px' }}>
      <SectionTitle style={{ fontSize: '16px' }}>useElementSize</SectionTitle>
      <div
        // @ts-expect-error -- Pyreon supports callback refs at runtime but built types expect { current }
        ref={(el: HTMLElement) => {
          boxRef = el
        }}
        style={{
          marginTop: '12px',
          padding: '24px',
          background: 'var(--bg-surface)',
          borderRadius: '6px',
          textAlign: 'center',
          resize: 'horizontal',
          overflow: 'auto',
          minWidth: '150px',
        }}
      >
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Resize me (drag right edge)
        </span>
        <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: '700' }}>
          {() => `${size().width} x ${size().height}`}
        </div>
      </div>
    </Card>
  )
}

function ClickOutsideDemo() {
  const open = useToggle(false)
  let dropdownRef: HTMLElement | null = null

  useClickOutside(
    () => dropdownRef,
    () => open.setFalse(),
  )

  return (
    <Card style={{ marginBottom: '16px' }}>
      <SectionTitle style={{ fontSize: '16px' }}>useClickOutside</SectionTitle>
      <div style={{ marginTop: '12px', position: 'relative' }}>
        <PrimaryButton onClick={() => open.toggle()}>
          <span>{() => (open.value() ? 'Close dropdown' : 'Open dropdown')}</span>
        </PrimaryButton>
        {() =>
          open.value() && (
            <SlideDown appear show={() => true}>
              <div
                // @ts-expect-error -- Pyreon supports callback refs at runtime but built types expect { current }
                ref={(el: HTMLElement) => {
                  dropdownRef = el
                }}
                style={{
                  position: 'absolute',
                  top: '44px',
                  left: '0',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '8px 0',
                  minWidth: '180px',
                  zIndex: '10',
                }}
              >
                {['Profile', 'Settings', 'Logout'].map((item) => (
                  <div
                    role="menuitem"
                    tabIndex={0}
                    style={{
                      padding: '8px 16px',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                    onClick={() => {
                      addNotification(`${item} clicked`, 'info')
                      open.setFalse()
                    }}
                    onKeyDown={(e: KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        addNotification(`${item} clicked`, 'info')
                        open.setFalse()
                      }
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </SlideDown>
          )
        }
      </div>
    </Card>
  )
}

function ToggleCounterDemo() {
  const count = signal(0)
  const expanded = useToggle(false)

  return (
    <Card style={{ marginBottom: '16px' }}>
      <SectionTitle style={{ fontSize: '16px' }}>useToggle + signals</SectionTitle>
      <div
        style={{
          marginTop: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <FlexRow>
          <GhostButton onClick={() => count.set(count() - 1)}>
            <span>-</span>
          </GhostButton>
          <span
            style={{
              fontSize: '24px',
              fontWeight: '700',
              minWidth: '60px',
              textAlign: 'center',
            }}
          >
            {count}
          </span>
          <GhostButton onClick={() => count.set(count() + 1)}>
            <span>+</span>
          </GhostButton>
        </FlexRow>

        <Btn
          type="button"
          style={{
            background: 'var(--bg-surface)',
            color: 'var(--text)',
          }}
          onClick={() => expanded.toggle()}
        >
          {() => (expanded.value() ? 'Collapse' : 'Expand')}
        </Btn>

        {() =>
          expanded.value() && (
            <FadeIn appear show={() => true}>
              <div
                style={{
                  padding: '16px',
                  background: 'var(--bg-surface)',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <p style={{ marginBottom: '8px' }}>
                  This content is toggled with <Code>useToggle</Code>.
                </p>
                <p>
                  Current count: <strong>{() => `${count()}`}</strong>
                </p>
              </div>
            </FadeIn>
          )
        }
      </div>
    </Card>
  )
}
