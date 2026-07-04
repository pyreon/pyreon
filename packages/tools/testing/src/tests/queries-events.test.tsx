/**
 * Node (happy-dom) tests for the role / label / placeholder query families +
 * waitFor. (fireEvent-through-delegation is browser-only — see
 * events.browser.test.tsx — because the delegation root only fires for
 * bubbling events in a real event loop.)
 */
import { afterEach, describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { cleanup, render, screen, waitFor } from '../index'

afterEach(cleanup)

describe('getByRole', () => {
  it('resolves implicit roles (button, link, heading, textbox)', () => {
    render(
      <div>
        <button>go</button>
        <a href="/x">link</a>
        <h2>Title</h2>
        <input type="text" />
      </div>,
    )
    expect(screen.getByRole('button').textContent).toBe('go')
    expect(screen.getByRole('link').getAttribute('href')).toBe('/x')
    expect(screen.getByRole('heading').textContent).toBe('Title')
    expect(screen.getByRole('textbox').tagName).toBe('INPUT')
  })

  it('an <a> without href is NOT a link', () => {
    // Deliberate hrefless anchor — the whole point of the assertion is that
    // an <a> with no href has no implicit `link` role.
    // oxlint-disable-next-line jsx-a11y/anchor-is-valid
    render(<a>no href</a>)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('narrows by accessible name (aria-label + text)', () => {
    render(
      <div>
        <button aria-label="Close dialog">×</button>
        <button>Save</button>
      </div>,
    )
    expect(screen.getByRole('button', { name: 'Close dialog' }).textContent).toBe('×')
    expect(screen.getByRole('button', { name: 'Save' }).textContent).toBe('Save')
    expect(screen.getByRole('button', { name: /clos/i })).toBeTruthy()
  })

  it('explicit role attribute wins', () => {
    render(<div role="alert">boom</div>)
    expect(screen.getByRole('alert').textContent).toBe('boom')
  })
})

describe('getByLabelText / getByPlaceholderText', () => {
  it('finds a control by its <label for=…> text', () => {
    render(
      <div>
        <label for="email">Email address</label>
        <input id="email" type="email" />
      </div>,
    )
    expect(screen.getByLabelText('Email address').getAttribute('type')).toBe('email')
  })

  it('finds a wrapped control (label contains the input)', () => {
    render(
      <label>
        Name
        <input type="text" data-testid="name" />
      </label>,
    )
    expect(screen.getByLabelText('Name').getAttribute('data-testid')).toBe('name')
  })

  it('finds by placeholder', () => {
    render(<input placeholder="Search…" />)
    expect(screen.getByPlaceholderText('Search…').tagName).toBe('INPUT')
    expect(screen.queryByPlaceholderText('nope')).toBeNull()
  })
})

describe('waitFor', () => {
  it('resolves once a deferred signal update lands', async () => {
    const status = signal('loading')
    render(<div data-testid="s">{() => status()}</div>)
    setTimeout(() => status.set('done'), 20)
    await waitFor(() => {
      if (screen.getByTestId('s').textContent !== 'done') throw new Error('not yet')
    })
    expect(screen.getByTestId('s').textContent).toBe('done')
  })

  it('rejects with the last error on timeout', async () => {
    await expect(
      waitFor(() => {
        throw new Error('never ready')
      }, { timeout: 60, interval: 10 }),
    ).rejects.toThrow('never ready')
  })
})
