/**
 * Real-Chromium twin for the library-helper subpaths — locks the behaviors
 * happy-dom cannot faithfully exercise (per test-environment-parity):
 *
 *  - fillForm/submitForm through Pyreon's REAL event delegation (input/blur/
 *    submit dispatched into a register()-bound `<Form of={form}>`).
 *  - toast matchers against a REAL mounted <Toaster> (per-instance portal
 *    host in document.body + its scoped delegation), incl. DOM-level queries.
 *  - expectComputedStyle against a CLASS-based stylesheet rule (real cascade
 *    + real color canonicalization — the happy-dom blind spot).
 *  - renderWithRouter navigation settle in a real browser history env.
 *  - renderWithTheme setMode reactivity on real elements.
 */
import type { FormState } from '@pyreon/form'
import { Form, useForm } from '@pyreon/form'
import { useMode } from '@pyreon/ui-core'
import { toast, Toaster } from '@pyreon/toast'
import { describe, expect, it } from 'vitest'
import { expectForm, fillForm, submitForm } from '../form'
import { render, screen, waitFor } from '../index'
import { expectRouter, renderWithRouter } from '../router'
import { clearToasts, expectToast, findToast } from '../toast'
import { expectComputedStyle, renderWithTheme } from '../ui'

describe('@pyreon/testing/form — fillForm/submitForm (real browser)', () => {
  type Login = {
    email: string
    password: string
  }

  it('drives a register()-bound <Form> through real events end-to-end', async () => {
    let submitted: Login | null = null
    let formRef!: FormState<Login>
    function LoginForm() {
      formRef = useForm<Login>({
        initialValues: { email: '', password: '' },
        validators: { email: (v) => (v.includes('@') ? undefined : 'invalid email') },
        onSubmit: (v) => void (submitted = v),
      })
      const email = formRef.register('email')
      const password = formRef.register('password')
      return (
        <Form of={formRef as never}>
          <label {...formRef.labelProps('email')}>Email</label>
          <input id={email.id} value={email.value} onInput={email.onInput} onBlur={email.onBlur} />
          <label {...formRef.labelProps('password')}>Password</label>
          <input
            id={password.id}
            value={password.value}
            onInput={password.onInput}
            onBlur={password.onBlur}
          />
          <button type="submit">Go</button>
        </Form>
      )
    }
    const { container } = render(<LoginForm />)

    // Invalid first — blur-validation through REAL dispatched events.
    fillForm(container, { Email: 'not-an-email' })
    await waitFor(() => {
      expectForm(formRef).toHaveFieldError('email', /invalid/)
    })

    fillForm(container, { Email: 'ada@lovelace.dev', Password: 'pw' })
    await submitForm(container)
    await waitFor(() => {
      expect(submitted).toEqual({ email: 'ada@lovelace.dev', password: 'pw' })
    })
    expectForm(formRef).toBeValid()
  })
})

describe('@pyreon/testing/toast — matchers against a real <Toaster> (real browser)', () => {
  it('expectToast/findToast match the store while the Toaster renders the portal DOM', async () => {
    const { unmount } = render(<Toaster />)
    toast.success('Profile saved')

    const t = expectToast(/saved/i, { type: 'success' })
    expect(t.type).toBe('success')

    // DOM level: the Toaster host lives in document.body (outside the render
    // container) — render() binds queries to body, so screen finds it.
    await waitFor(() => {
      expect(screen.getByText('Profile saved')).toBeTruthy()
    })

    // Async producer → findToast waits.
    setTimeout(() => toast.error('Save failed'), 20)
    const failed = await findToast(/failed/i)
    expect(failed.type).toBe('error')

    clearToasts()
    await waitFor(() => {
      expect(screen.queryByText('Profile saved')).toBeNull()
    })
    unmount()
  })
})

describe('@pyreon/testing/ui — computed styles + mode (real browser)', () => {
  it('expectComputedStyle resolves CLASS-based rules with color canonicalization', () => {
    const style = document.createElement('style')
    style.textContent = '.px-test-red { color: #ff0000; font-weight: 700; }'
    document.head.appendChild(style)
    const { container } = render(<div class="px-test-red">styled</div>)
    const el = container.firstElementChild as HTMLElement

    // Three equivalent color forms — canonicalized to the same rgb() string.
    expectComputedStyle(el, { color: 'red' })
    expectComputedStyle(el, { color: '#ff0000' })
    expectComputedStyle(el, { color: 'rgb(255, 0, 0)', fontWeight: 700 })
    expect(() => expectComputedStyle(el, { color: 'blue' })).toThrow(/\[Pyreon\] expectComputedStyle/)
    style.remove()
  })

  it('renderWithTheme setMode flips useMode() consumers reactively', async () => {
    function ModeProbe() {
      return <span data-testid="mode">{() => useMode()}</span>
    }
    const { getByTestId, setMode } = renderWithTheme(<ModeProbe />, { theme: { rootSize: 16 } })
    const el = getByTestId('mode')
    expect(el.textContent).toBe('light')
    setMode('dark')
    await waitFor(() => {
      expect(el.textContent).toBe('dark')
    })
    expect(getByTestId('mode')).toBe(el) // reactive, not a remount
  })
})

describe('@pyreon/testing/router — navigation settle (real browser)', () => {
  it('renderWithRouter settles the initial route + navigate() commits in real history', async () => {
    const routes = [
      { path: '/', component: () => <div>Home Page</div> },
      {
        path: '/posts/:id',
        component: PostView,
        loader: ({ params }: { params: Record<string, string> }) =>
          Promise.resolve({ title: `Title ${params.id}` }),
      },
    ]
    function PostView() {
      return <div>Post loaded</div>
    }
    const { container, navigate, router, unmount } = await renderWithRouter(null, {
      routes,
      route: '/',
    })
    expect(container.textContent).toContain('Home Page')
    expectRouter(router).toBeAt('/')

    const result = await navigate('/posts/9')
    expect(result).toBe('committed')
    expectRouter(router).toBeAt('/posts/:id')
    expect(container.textContent).toContain('Post loaded')
    unmount()
  })
})
