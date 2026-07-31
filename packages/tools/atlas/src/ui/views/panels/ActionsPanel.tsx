/**
 * Actions panel (≈ Storybook addon-actions) — every event handler fired
 * against the preview, newest first, with a clear.
 */
import { Show } from '@pyreon/core'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import type { AddonPanelDef } from '../../panels'
import { tab } from './shared'

export const actionsPanel: AddonPanelDef = {
  ...tab('actions'),
  render: (model) => {
    const m = model as WorkbenchModel
    return (
      <>
        <C.ActionsHead>
          <C.ActionsHint>Interact with the preview to log events.</C.ActionsHint>
          <C.ClearBtn onClick={m.clearActions}>Clear</C.ClearBtn>
        </C.ActionsHead>
        <Show when={() => m.actions().length === 0}>
          <C.ActionsEmpty>No events yet — click the component.</C.ActionsEmpty>
        </Show>
        {() =>
          m.actions().map((ev) => (
            <C.ActionRow>
              <C.ActionName>{ev.name}</C.ActionName>
              <C.ActionDetail>{ev.detail}</C.ActionDetail>
              <C.ActionTime>{ev.t}</C.ActionTime>
            </C.ActionRow>
          ))
        }
      </>
    )
  },
}
