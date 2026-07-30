/**
 * What Atlas needs to know about this project.
 *
 * `theme` is what makes the rocketstyle components in `src/demo-catalog.tsx`
 * discoverable WITH their dimensions. Those components are call chains, not
 * typed functions, so the static scanner cannot see them; loading them finds
 * them, and reading what `variant` / `size` accept means running the
 * `.variants((t) => …)` callbacks — which dereference theme tokens. Without a
 * theme they are still discovered, just with no axes.
 *
 * Written with plain values and no JSX, and named `.ts` rather than `.tsx`, on
 * purpose: `atlas scan` imports this with whatever runtime it runs under, so
 * the project's JSX configuration is not necessarily in effect.
 *
 * Worth trying: delete this file and re-run `atlas scan`. The three rocketstyle
 * components stay in the catalog and lose their variant/size axes, so the
 * variant matrix has nothing to cross — 36 scenarios become 23. (Measured, not
 * estimated.)
 */
import { h, type VNodeChild } from '@pyreon/core'
import { createPermissions, PermissionsProvider } from '@pyreon/permissions'
import { PyreonUI } from '@pyreon/ui-core'
import { THEMES, tokens } from '@pyreon/atlas/ui'

export const theme = tokens(THEMES[0]!, false)

/**
 * The providers this project's components genuinely need to render:
 * `<PyreonUI>` (the rocketstyle chains dereference theme tokens — without it
 * the first `t.accent` read throws) and a `<PermissionsProvider>` (for
 * `usePermissions()` consumers like GuardedDelete).
 *
 * This is not decoration — without a wrapper, `atlas scan` honestly FAILS 36
 * of this project's 40 scenarios with `threw while mounted`. (An earlier
 * pipeline bug ran every scenario through a second, wrongly-wired mount whose
 * verdict overwrote the real one, which made the same scenarios look verified.
 * They never were.)
 */
export function wrapper(props: { children?: unknown }): VNodeChild {
  return h(
    PyreonUI,
    { theme },
    h(PermissionsProvider, { value: createPermissions({ '*': true }) }, props.children as VNodeChild),
  )
}

/**
 * Per-project addon presets — plain JSON data. Each family REPLACES the
 * shipped list; omitted families keep the defaults (pseudo-states and the
 * backgrounds here are omitted deliberately, so the workbench shows how the
 * two sources mix). The `kiosk` viewport is a width the shipped set does not
 * have, and the `ops` role grants exactly one destructive key — both exist so
 * the e2e can prove a CUSTOM entry drives the real canvas and the real
 * recording `can()`, not just a button label.
 */
export const presets = {
  viewports: [
    { id: 'full', label: 'Full', width: null },
    { id: 'mobile', label: 'Mobile', width: 375 },
    { id: 'kiosk', label: 'Kiosk', width: 900 },
  ],
  locales: [
    { id: 'en', label: 'English' },
    { id: 'ar', label: 'العربية', dir: 'rtl' as const },
  ],
  roles: [
    { id: 'anonymous', label: 'Anonymous', hint: 'nothing granted' },
    { id: 'ops', label: 'Ops', hint: 'may delete posts', grants: ['posts.delete'] },
    { id: 'admin', label: 'Admin', hint: 'everything granted', defaultGrant: true },
  ],
}
