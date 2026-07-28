/**
 * The Permissions panel — render the scenario as each role sees it.
 *
 * Catches a security bug: an action that should be admin-only rendering for a
 * viewer. Normally that is found by logging in as the wrong user, i.e. late.
 *
 * The panel's real contribution over "swap the role and look" is the CONSULTED
 * list. A component that renders identically under every role has either asked
 * and been answered the same way, or never asked at all — and only the second
 * is a bug. Nothing but a recording `can()` can tell those apart.
 */
import { Show } from '@pyreon/core'
import * as C from '../chrome'
import type { WorkbenchModel } from '../model'
import { registerAddonPanel } from '../panels'
import { DEFAULT_PERMISSION_SETS, isUnguarded, permissionSetById } from '../permission-sets'

export function registerPermissionsPanel(): void {
  registerAddonPanel({
    id: 'permissions',
    title: 'Roles',
    hint: 'Render the scenario as each role sees it',
    render: (model) => {
      const m = model as WorkbenchModel

      // Read through the model's computed so both stay in step with the
      // preview: the same instance the component rendered against is the one
      // reporting which keys it consulted.
      const consulted = () => m.permissions().consulted()
      const denied = () => m.permissions().denied()

      return (
        <>
          <C.CtrlRow>
            <C.CtrlHead>
              <C.CtrlLabel>Role</C.CtrlLabel>
              <C.CtrlType>{() => permissionSetById(m.permissionSet()).hint}</C.CtrlType>
            </C.CtrlHead>
            <C.EnumWrap>
              {DEFAULT_PERMISSION_SETS.map((set) => (
                <C.EnumBtn
                  data-testid={`role-${set.id}`}
                  state={() => (m.permissionSet() === set.id ? 'active' : 'idle')}
                  onClick={() => m.permissionSet.set(set.id)}
                >
                  {set.label}
                </C.EnumBtn>
              ))}
            </C.EnumWrap>
          </C.CtrlRow>

          {/*
            The finding with teeth. Rendering identically under every role is
            only reassuring if the component ASKED; if it never called `can()`,
            the roles prove nothing and a destructive action is unguarded.
          */}
          <Show when={() => isUnguarded(consulted())}>
            <C.ActionsEmpty data-testid="perm-unguarded">
              This component consulted NO permission keys. Switching roles proves
              nothing about it — if it renders a destructive action, that action
              is unguarded.
            </C.ActionsEmpty>
          </Show>

          <Show when={() => !isUnguarded(consulted())}>
            <>
              <C.A11ySummary data-testid="perm-summary">
                <C.A11yStat>
                  <C.A11yDot state="ok" />
                  {() => `${consulted().length - denied().length} granted`}
                </C.A11yStat>
                <C.A11yStat>
                  <C.A11yDot state="danger" />
                  {() => `${denied().length} denied`}
                </C.A11yStat>
                <C.A11yStat>
                  <C.A11yDot state="ok" />
                  {() => `${consulted().length} key(s) consulted`}
                </C.A11yStat>
              </C.A11ySummary>

              {() =>
                consulted().map((key) => {
                  const isDenied = denied().includes(key)
                  return (
                    <C.A11yRow data-testid="perm-row">
                      <C.A11yIcon state={isDenied ? 'danger' : 'ok'}>
                        {isDenied ? '×' : '✓'}
                      </C.A11yIcon>
                      <C.A11yBody>
                        <C.A11yTitle>{key}</C.A11yTitle>
                        <C.A11yNote>
                          {isDenied ? 'denied for this role' : 'granted for this role'}
                        </C.A11yNote>
                      </C.A11yBody>
                    </C.A11yRow>
                  )
                })
              }
            </>
          </Show>
        </>
      )
    },
  })
}
