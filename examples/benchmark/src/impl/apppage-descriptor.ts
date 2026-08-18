/**
 * The app-page hydration scenario's SINGLE structural source of truth.
 *
 * Every framework's page — and the generated Pyreon JSX — is built from these
 * constants and `appPageRows()`, so the rendered markup is identical across
 * frameworks by construction rather than by review.
 *
 * Shape: a settings page. A page header (title + a stateful Save button, the
 * interactivity probe), then N sections, each a SectionHeader plus M FormRows
 * (label + text input + hint). This is deliberately a STATIC COMPOSITION of
 * components, not a keyed list — the row-list case is already covered by
 * bench-hydration.ts, and a `<For>`/`.map()` list exercises entirely different
 * hydration paths (measured: `<For>` already adopts; `.map()` does not adopt
 * even after the template-adoption fix).
 */
export const APPPAGE_SECTIONS = 20
export const APPPAGE_ROWS = 15

export interface AppPageRow {
  kind: 'header' | 'row'
  label: string
  hint: string
  name: string
  value: string
}

/** Flat, ordered description of the page body — the exact render order. */
export function appPageRows(): AppPageRow[] {
  const out: AppPageRow[] = []
  for (let s = 0; s < APPPAGE_SECTIONS; s++) {
    out.push({
      kind: 'header',
      label: `Section ${s}`,
      hint: `configure ${s}`,
      name: '',
      value: '',
    })
    for (let r = 0; r < APPPAGE_ROWS; r++) {
      out.push({
        kind: 'row',
        label: `Field ${s}.${r}`,
        hint: `help ${s}.${r}`,
        name: `f${s}_${r}`,
        value: `v${s}_${r}`,
      })
    }
  }
  return out
}

/** Component instances on the page (excludes the page header/root). */
export const APPPAGE_COMPONENTS = APPPAGE_SECTIONS * (1 + APPPAGE_ROWS)
