/**
 * Test-only fixture: exercises two reactive paths through `<PyreonUI>`
 * that aren't covered elsewhere in the showcase:
 *
 * 1. **Inversed nesting** — an outer `<PyreonUI mode="light">` containing
 *    an inner `<PyreonUI inversed>` that should resolve to dark mode
 *    independently of the outer. Buttons in each should pick up
 *    distinct theme-derived colors.
 *
 * 2. **Theme prop change at runtime** — a `<PyreonUI theme={...}>` whose
 *    `theme` prop is signal-bound; clicking a control swaps the theme
 *    signal between two distinct theme objects, and components inside
 *    should re-resolve their CSS classes.
 *
 * Not added to nav — accessed only by direct URL. Lives behind
 * `/test/reactive-providers` so it doesn't show up in dev-server
 * navigation that real users browse.
 */

import { signal } from '@pyreon/reactivity'
import { PyreonUI, useMode } from '@pyreon/ui-core'
import { Button } from '@pyreon/ui-components'
import { theme } from '@pyreon/ui-theme'

// Tiny probe component — reads the resolved mode from `useMode()`
// inside a reactive accessor so signal changes patch the text in
// place. `useMode()` returns a value (it auto-calls the underlying
// reactive context), so wrapping the call in `() => useMode()` makes
// the JSX text re-evaluate on every mode change. Renders the
// resolved mode as text so the e2e spec can assert via text content
// rather than theme-color side-effects (which depend on theme
// authorship and aren't always mode-aware for every state).
function ModeProbe(props: { id: string }) {
  return (
    <div data-test-mode-probe={props.id}>
      Mode: <strong>{() => useMode()}</strong>
    </div>
  )
}

// Mode-toggle: simpler than building a structurally-different theme,
// flips between "light" and "dark" mode via signal so we can verify
// the `mode` prop on `PyreonUI` is reactive (the theme object stays
// the same; only the mode changes, which the rocketstyle dimension
// memo should pick up via the reactive ModeContext).

export function ReactiveProvidersDemo() {
  const mode = signal<'light' | 'dark'>('light')

  return (
    <div data-test-page="reactive-providers">
      <h2>Reactive providers — test fixtures</h2>

      <h3>Inversed nesting</h3>
      <p>
        Outer <code>{'<PyreonUI mode="light">'}</code> wraps an inner{' '}
        <code>{'<PyreonUI inversed>'}</code>. Both contain a{' '}
        <code>state="primary"</code> Button. The inner Button should
        resolve to dark-mode colors despite the outer being light.
      </p>
      <PyreonUI theme={theme} mode="light">
        <div data-test-region="outer-light">
          <ModeProbe id="outer" />
          <Button state="primary">Outer (light) Primary</Button>
          <PyreonUI theme={theme} inversed>
            <div data-test-region="inner-inversed">
              <ModeProbe id="inner" />
              <Button state="primary">Inner (inversed → dark) Primary</Button>
            </div>
          </PyreonUI>
        </div>
      </PyreonUI>

      <h3>Mode prop change at runtime</h3>
      <p>
        Clicking the toggle swaps <code>mode</code> on the provider.
        Buttons inside should re-resolve their classes and the visible
        bg should flip between light and dark slices of the theme.
      </p>
      <div data-test-region="mode-toggle">
        <Button onClick={() => mode.set(mode() === 'light' ? 'dark' : 'light')}>
          Toggle mode
        </Button>
      </div>
      <PyreonUI theme={theme} mode={mode()}>
        <div data-test-region="mode-swappable">
          <ModeProbe id="swappable" />
          <Button state="primary">Themed Primary</Button>
        </div>
      </PyreonUI>
    </div>
  )
}
