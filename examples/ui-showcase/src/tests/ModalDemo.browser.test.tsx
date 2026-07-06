/**
 * Showcase: testing a real Pyreon UI component with `@pyreon/testing`.
 *
 * ModalDemo opens a `<ModalBase>` — which PORTALS its dialog into
 * `document.body`, outside the rendered container. This is the canonical
 * "test a modal" flow, and it exercises the whole kit end to end in a real
 * browser:
 *   - render()            mounts the component + binds the query set to
 *                         document.body, so the portaled dialog is findable
 *   - fireEvent.click     drives the open/close through Pyreon's event delegation
 *   - getByRole/waitFor   the @testing-library/dom surface, verbatim
 *   - jest-dom matchers   toBeInTheDocument / toHaveTextContent
 *
 * Doubles as the reference users copy AND a real integration test of the kit.
 */
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { cleanup, fireEvent, render, screen, waitFor } from '@pyreon/testing'
import { ModalDemo } from '../demos/ModalDemo'

// Rocketstyle / ui-components resolve their styles from the theme context —
// wrap the tree in `<PyreonUI>` (the same provider the app root uses). This
// is the idiomatic way to test any Pyreon UI component.
const renderWithUI = (ui: Parameters<typeof render>[0]) =>
  render(<PyreonUI theme={theme} mode="light">{ui}</PyreonUI>)

describe('ModalDemo — testing a portaled modal with @pyreon/testing', () => {
  it('opens the dialog, shows its content, and removes it on close', async () => {
    renderWithUI(<ModalDemo />)

    // Closed initially — the portaled dialog isn't in the document yet.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Open it. The dialog portals to document.body (OUTSIDE render's
    // container) — render()'s queries find it because they bind to
    // baseElement, and jest-dom asserts on it.
    fireEvent.click(screen.getByText('Open Modal'))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Modal Title')

    // Close via the Confirm button. The Portal removes its DOM on unmount —
    // no stale modal left in document.body.
    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    cleanup()
  })
})
