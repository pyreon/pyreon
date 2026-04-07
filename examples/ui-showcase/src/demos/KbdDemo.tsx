import { Kbd } from '@pyreon/ui-components'

export function KbdDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Kbd</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Keyboard shortcut display for documenting hotkeys and key combinations.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Single Keys</h3>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
        <Kbd>A</Kbd>
        <Kbd>Enter</Kbd>
        <Kbd>Tab</Kbd>
        <Kbd>Esc</Kbd>
        <Kbd>Space</Kbd>
        <Kbd>/</Kbd>
        <Kbd>?</Kbd>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Modifier Keys</h3>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
        <Kbd>Ctrl</Kbd>
        <Kbd>Shift</Kbd>
        <Kbd>Alt</Kbd>
        <Kbd>Cmd</Kbd>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Common Combinations</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 120px; color: #6b7280; font-size: 14px;">Save</span>
          <Kbd>Ctrl</Kbd><span style="color: #9ca3af;">+</span><Kbd>S</Kbd>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 120px; color: #6b7280; font-size: 14px;">Undo</span>
          <Kbd>Cmd</Kbd><span style="color: #9ca3af;">+</span><Kbd>Z</Kbd>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 120px; color: #6b7280; font-size: 14px;">Copy</span>
          <Kbd>Ctrl</Kbd><span style="color: #9ca3af;">+</span><Kbd>C</Kbd>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 120px; color: #6b7280; font-size: 14px;">Paste</span>
          <Kbd>Ctrl</Kbd><span style="color: #9ca3af;">+</span><Kbd>V</Kbd>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 120px; color: #6b7280; font-size: 14px;">Select All</span>
          <Kbd>Ctrl</Kbd><span style="color: #9ca3af;">+</span><Kbd>A</Kbd>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 120px; color: #6b7280; font-size: 14px;">Find</span>
          <Kbd>Ctrl</Kbd><span style="color: #9ca3af;">+</span><Kbd>F</Kbd>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Triple Combinations</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 120px; color: #6b7280; font-size: 14px;">Redo</span>
          <Kbd>Ctrl</Kbd><span style="color: #9ca3af;">+</span><Kbd>Shift</Kbd><span style="color: #9ca3af;">+</span><Kbd>Z</Kbd>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 120px; color: #6b7280; font-size: 14px;">Dev Tools</span>
          <Kbd>Ctrl</Kbd><span style="color: #9ca3af;">+</span><Kbd>Shift</Kbd><span style="color: #9ca3af;">+</span><Kbd>I</Kbd>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 120px; color: #6b7280; font-size: 14px;">New Tab</span>
          <Kbd>Cmd</Kbd><span style="color: #9ca3af;">+</span><Kbd>Shift</Kbd><span style="color: #9ca3af;">+</span><Kbd>T</Kbd>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">In Context</h3>
      <p style="font-size: 14px; line-height: 1.8; margin-bottom: 24px;">
        Press <Kbd>/</Kbd> to search, <Kbd>Esc</Kbd> to close, or{' '}
        <Kbd>Ctrl</Kbd><span style="color: #9ca3af;">+</span><Kbd>K</Kbd> to open the command palette.
      </p>
    </div>
  )
}
