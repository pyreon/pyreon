/**
 * The Permissions panel — the scenario rendered as EVERY role sees it, side by
 * side, each judged against the role's policy.
 *
 * Catches a security bug: an action that should be admin-only rendering for a
 * viewer. Normally that is found by logging in as the wrong user, i.e. late.
 *
 * Two things make a card's verdict more than "look at the four renders":
 *
 * - each role renders under its OWN recording `can()`, so the card knows which
 *   keys that render consulted and which the role was denied — a component
 *   that never asked is reported as such, not as "safe";
 * - every enabled action the render produced is checked against the policy
 *   (the role's `verbs` / `grants` / `defaultGrant` — the shipped roles, or
 *   `presets.roles` in atlas.config.ts), by the verb its label starts with.
 *   See `judgeRole` for the exact rule.
 *
 * Clicking a role's chip renders the CANVAS under that role (the `?role=`
 * link parameter), so the panels that read the render context agree with it.
 */
import { onUnmount, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import type { AddonPanelRender } from '../../panels'
import {
  judgeRole,
  type PermissionSet,
  type RecordingPermissions,
  renderedActions,
  type RoleVerdict,
} from '../../permission-sets'
import { PreviewTheme } from '../canvas/PreviewTheme'

interface CardResult {
  verdict: RoleVerdict
  consulted: string[]
  denied: string[]
}

const GLYPH: Record<RoleVerdict['state'], string> = { ok: '✓', violation: '✗', unguarded: '!' }

/**
 * One role's card. The verdict is read AFTER the render settles: the consulted
 * keys are filled by rendering, and the actions are read off the mounted DOM.
 * A MutationObserver re-judges when the render changes (a control edit, a
 * scenario), coalesced into one frame.
 */
function RoleCard(props: { model: WorkbenchModel; role: PermissionSet; overlay: () => boolean }) {
  const m = props.model
  const role = props.role
  const result = signal<CardResult | null>(null)
  let recording: RecordingPermissions | null = null
  let host: HTMLElement | null = null
  let observer: MutationObserver | null = null
  let frame = 0

  const judge = () => {
    frame = 0
    if (!host || !recording) return
    const consulted = recording.consulted()
    const denied = recording.denied()
    result.set({ verdict: judgeRole(role, m.roles, consulted, denied, renderedActions(host)), consulted, denied })
  }
  const schedule = () => {
    if (frame !== 0) return
    frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(judge) : (judge(), 0)
  }
  const miniRef = (el: HTMLElement | null) => {
    observer?.disconnect()
    observer = null
    host = el
    if (!el) return
    // `inert`: a picture of the canvas, not a second place to tab through.
    el.setAttribute('inert', '')
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(schedule)
      observer.observe(el, { childList: true, subtree: true, attributes: true, characterData: true })
    }
    schedule()
  }
  onUnmount(() => {
    observer?.disconnect()
    if (frame !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
  })

  const state = () => (props.overlay() ? 'pending' : (result()?.verdict.state ?? 'pending'))
  const active = () => m.permissionSet() === role.id

  return (
    <C.RoleCard data-testid={`role-card-${role.id}`} data-verdict={state} state={() => state() as never}>
      <C.RoleToggle
        data-testid={`role-${role.id}`}
        aria-pressed={() => (active() ? 'true' : 'false')}
        title={`Render the canvas as ${role.label.toLowerCase()}${role.hint ? ` — ${role.hint}` : ''}`}
        state={() => (active() ? 'active' : 'idle')}
        onClick={() => m.permissionSet.set(role.id)}
      >
        {role.label.toLowerCase()}
      </C.RoleToggle>
      <Show
        when={() => !props.overlay()}
        fallback={
          <C.RoleVerdictLine state="pending">
            Opens an overlay — rendered on the canvas only, so four copies do not stack over the
            workbench. Pick this role to see it there.
          </C.RoleVerdictLine>
        }
      >
        <C.RoleMini data-testid={`role-mini-${role.id}`} ref={miniRef}>
          <PreviewTheme model={m}>
            {() => {
              const out = m.previewAs(role.id)
              recording = out.recording
              schedule()
              return out.node
            }}
          </PreviewTheme>
        </C.RoleMini>
        <C.RoleVerdictLine data-testid={`role-verdict-${role.id}`} state={() => state() as never}>
          {() => {
            const r = result()
            return r ? `${GLYPH[r.verdict.state]} ${r.verdict.message}` : 'rendering…'
          }}
        </C.RoleVerdictLine>
        {() => {
          const r = result()
          if (!r || r.consulted.length === 0) return null
          const denied = new Set(r.denied)
          return (
            <C.A11yNote data-testid={`role-keys-${role.id}`}>
              {r.consulted.map((k) => `${k} ${denied.has(k) ? '✗' : '✓'}`).join(' · ')}
            </C.A11yNote>
          )
        }}
      </Show>
    </C.RoleCard>
  )
}

/** The panel body — loaded on first open (see ./lazy). */
export const render: AddonPanelRender = (model) => {
  const m = model as WorkbenchModel
  // An overlay seeded open (a modal, a drawer) portals out of its card;
  // four of them would stack over the workbench.
  const overlay = () => m.overlayOpen() || (m.vals() as { open?: unknown }).open === true
  return (
    <>
      <C.Callout state="plain" data-testid="perm-lead">
        The scenario rendered as each role sees it. An action a role's policy withholds,
        rendered for that role anyway, is a security bug — flagged here instead of in
        production. Roles and their policy come from <code>presets.roles</code> in
        atlas.config.ts (or the shipped four).
      </C.Callout>
      <C.RoleGrid data-testid="role-grid">
        {m.roles.map((role) => (
          <RoleCard model={m} role={role} overlay={overlay} />
        ))}
      </C.RoleGrid>
    </>
  )
}
