/**
 * The re-exported @testing-library/dom query surface works against Pyreon-
 * rendered DOM — role (real ARIA + accessible name), label, placeholder — plus
 * waitFor. (fireEvent-through-delegation is browser-only: see
 * events.browser.test.tsx.)
 */
import { afterEach, describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { cleanup, render, screen, waitFor } from '../index'

afterEach(cleanup)

describe('getByRole (real ARIA resolution from @testing-library/dom)', () => {
  it('resolves implicit roles + narrows by accessible name', () => {
    render(
      <div>
        <button aria-label="Close dialog">×</button>
        <a href="/x">home</a>
        <h2>Title</h2>
      </div>,
    )
    expect(screen.getByRole('button', { name: 'Close dialog' }).textContent).toBe('×')
    expect(screen.getByRole('link', { name: 'home' }).getAttribute('href')).toBe('/x')
    expect(screen.getByRole('heading', { name: 'Title' }).tagName).toBe('H2')
  })

  it('an <a> without href is not a link (TL role semantics)', () => {
    // oxlint-disable-next-line jsx-a11y/anchor-is-valid
    render(<a>no href</a>)
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('getByLabelText / getByPlaceholderText', () => {
  it('finds a control by <label for=…> and by placeholder', () => {
    render(
      <div>
        <label for="email">Email address</label>
        <input id="email" type="email" />
        <input placeholder="Search…" />
      </div>,
    )
    expect(screen.getByLabelText('Email address').getAttribute('type')).toBe('email')
    expect(screen.getByPlaceholderText('Search…').tagName).toBe('INPUT')
  })
})

describe('waitFor', () => {
  it('resolves once a deferred signal update lands', async () => {
    const status = signal('loading')
    render(<div data-testid="s">{() => status()}</div>)
    setTimeout(() => status.set('done'), 20)
    await waitFor(() => expect(screen.getByTestId('s').textContent).toBe('done'))
    expect(screen.getByTestId('s').textContent).toBe('done')
  })
})
