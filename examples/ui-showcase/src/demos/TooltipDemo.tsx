import { Tooltip, Button } from '@pyreon/ui-components'

export function TooltipDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Tooltip</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Small informational overlays positioned relative to trigger elements.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Positioned Examples</h3>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px; max-width: 500px; margin-bottom: 24px;">
        <div style="position: relative; display: inline-block; text-align: center;">
          <Tooltip style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 8px; white-space: nowrap;">
            Tooltip on top
          </Tooltip>
          <Button variant="outline">Top</Button>
        </div>
        <div style="position: relative; display: inline-block; text-align: center;">
          <Button variant="outline">Bottom</Button>
          <Tooltip style="position: absolute; top: 100%; left: 50%; transform: translateX(-50%); margin-top: 8px; white-space: nowrap;">
            Tooltip on bottom
          </Tooltip>
        </div>
        <div style="position: relative; display: inline-block; text-align: center;">
          <Tooltip style="position: absolute; right: 100%; top: 50%; transform: translateY(-50%); margin-right: 8px; white-space: nowrap;">
            Left
          </Tooltip>
          <Button variant="outline">Left</Button>
        </div>
        <div style="position: relative; display: inline-block; text-align: center;">
          <Button variant="outline">Right</Button>
          <Tooltip style="position: absolute; left: 100%; top: 50%; transform: translateY(-50%); margin-left: 8px; white-space: nowrap;">
            Right
          </Tooltip>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Content Variations</h3>
      <div style="display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 24px;">
        <div style="position: relative; display: inline-block;">
          <Tooltip style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 8px; white-space: nowrap;">
            Save changes
          </Tooltip>
          <Button {...{ state: 'primary' } as any}>Save</Button>
        </div>
        <div style="position: relative; display: inline-block;">
          <Tooltip style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 8px; white-space: nowrap;">
            Ctrl+Z to undo
          </Tooltip>
          <Button variant="outline">Undo</Button>
        </div>
        <div style="position: relative; display: inline-block;">
          <Tooltip style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 8px; max-width: 200px;">
            This action is irreversible and will permanently delete all data
          </Tooltip>
          <Button {...{ state: 'danger' } as any}>Delete</Button>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Static Display</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Tooltip style="display: inline-block;">Simple tooltip text</Tooltip>
        <Tooltip style="display: inline-block; max-width: 250px;">
          A longer tooltip that wraps to multiple lines when the content exceeds the max-width
        </Tooltip>
      </div>
    </div>
  )
}
