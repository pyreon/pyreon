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
import { THEMES, tokens } from '@pyreon/atlas/ui'

export const theme = tokens(THEMES[0]!, false)
