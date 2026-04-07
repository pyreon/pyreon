import { Kbd, Paragraph, Title } from '@pyreon/ui-components'

export function KbdDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Kbd</Title>

      <Title size="h3" style="margin-bottom: 12px">Single Keys</Title>
      <div style="display: flex; gap: 8px; margin-bottom: 24px;">
        <Kbd>Esc</Kbd>
        <Kbd>Tab</Kbd>
        <Kbd>Enter</Kbd>
        <Kbd>Space</Kbd>
        <Kbd>Backspace</Kbd>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Keyboard Shortcuts</Title>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Paragraph>Save: <Kbd>Ctrl</Kbd> + <Kbd>S</Kbd></Paragraph>
        <Paragraph>Undo: <Kbd>Cmd</Kbd> + <Kbd>Z</Kbd></Paragraph>
        <Paragraph>New line: <Kbd>Shift</Kbd> + <Kbd>Enter</Kbd></Paragraph>
        <Paragraph>Copy: <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd></Paragraph>
        <Paragraph>Select all: <Kbd>Ctrl</Kbd> + <Kbd>A</Kbd></Paragraph>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Complex Shortcuts</Title>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Paragraph>Find and replace: <Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>H</Kbd></Paragraph>
        <Paragraph>Developer tools: <Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>I</Kbd></Paragraph>
        <Paragraph>Force refresh: <Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>R</Kbd></Paragraph>
      </div>
    </div>
  )
}
