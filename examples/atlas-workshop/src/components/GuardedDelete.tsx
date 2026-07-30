/**
 * A permission-consuming component, the idiomatic way: `usePermissions()` from
 * context — no prop threading, no atlas import. In the workbench the preview
 * always renders inside a `PermissionsProvider` carrying the active role's
 * RECORDING instance, so selecting this component makes the Roles panel show
 * exactly which keys it consulted (and flags a component that never asks).
 */
import type { VNodeChild } from '@pyreon/core'
import { usePermissions } from '@pyreon/permissions'

export function GuardedDelete(props: { label?: string }): VNodeChild {
  const can = usePermissions()
  return (
    <button type="button" disabled={can('posts.delete') ? undefined : true}>
      {props.label ?? 'Delete post'}
    </button>
  )
}
