import { useFocus, useHover, useKeyboard } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { Title, Paragraph, Card } from '@pyreon/ui-components'

export function HooksInteractionDemo() {
  // useHover
  const hover = useHover()

  // useFocus
  const focus = useFocus()

  // useKeyboard
  const lastKey = signal('')
  useKeyboard('Enter', () => lastKey.set('Enter'), undefined)
  useKeyboard('Escape', () => lastKey.set('Escape'), undefined)
  useKeyboard(' ', () => lastKey.set('Space'), undefined)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Interaction Hooks</Title>
      <Paragraph style="margin-bottom: 24px">
        Track hover, focus, and keyboard input reactively.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">useHover()</Title>
      <Card
        {...hover.props}
        style={() =>
          `padding: 24px; max-width: 320px; margin-bottom: 24px; background: ${hover.hovered() ? '#dbeafe' : '#f3f4f6'}; transition: background 0.2s;`
        }
      >
        Hover over me — currently: <strong>{() => (hover.hovered() ? 'hovered' : 'not hovered')}</strong>
      </Card>

      <Title size="h3" style="margin-bottom: 12px">useFocus()</Title>
      <input
        {...focus.props}
        type="text"
        placeholder="Click to focus"
        style={() =>
          `padding: 8px 12px; border: 2px solid ${focus.focused() ? '#0070f3' : '#d1d5db'}; border-radius: 6px; font-size: 14px; outline: none; max-width: 300px; margin-bottom: 8px;`
        }
      />
      <p style="font-size: 13px; color: #6b7280; margin-bottom: 24px;">
        State: <strong>{() => (focus.focused() ? 'focused' : 'blurred')}</strong>
      </p>

      <Title size="h3" style="margin-bottom: 12px">useKeyboard(key, handler)</Title>
      <Paragraph style="margin-bottom: 12px; font-size: 14px;">
        Press <kbd>Enter</kbd>, <kbd>Esc</kbd>, or <kbd>Space</kbd> anywhere on the page.
      </Paragraph>
      <p style="font-size: 14px;">
        Last key: <strong>{() => lastKey() || '(none yet)'}</strong>
      </p>
    </div>
  )
}
