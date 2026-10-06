/**
 * Components whose handlers have side effects that LEAVE the scenario
 * document. Each is a perfectly ordinary component — none is a bug — and
 * `atlas verify-browser` must drive all of them and keep going.
 *
 * Plain `h()` and no JSX on purpose: the fixture is loaded by the workbench's
 * Vite and by the scan with whatever JSX config the host has.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/** An ordinary link (the #3805 reproduction). */
export function PlainAnchor(): ReturnType<typeof h> {
  return h('a', { href: '/destination' }, 'Open example')
}

/** `<a download>` and `mailto:` — default actions that are not navigations in the SPA sense. */
export function DownloadAndMail(): ReturnType<typeof h> {
  return h(
    'div',
    null,
    h('a', { href: '/report.csv', download: 'report.csv' }, 'Download'),
    h('a', { href: 'mailto:someone@example.com' }, 'Mail'),
  )
}

/** A native form: submit button, submit input. Submitting reloads the page. */
export function SubmitForm(): ReturnType<typeof h> {
  return h(
    'form',
    { action: '/submitted', method: 'post' },
    h('input', { name: 'q', 'aria-label': 'query' }),
    h('button', { type: 'submit' }, 'Send'),
    h('input', { type: 'submit', value: 'Send too' }),
  )
}

/** Handler-driven escape hatches the guard stubs. */
export function EscapeHatches(): ReturnType<typeof h> {
  const done = signal(0)
  return h(
    'button',
    {
      type: 'button',
      onClick: () => {
        window.open('/popup', '_blank')
        window.alert('hello')
        window.confirm('sure?')
        window.prompt('name?')
        history.pushState({}, '', '/pushed')
        done.set(done() + 1)
      },
    },
    () => `escapes: ${done()}`,
  )
}

/** A programmatic `form.submit()` (no submit event): stubbed in-page. */
export function ProgrammaticSubmit(): ReturnType<typeof h> {
  return h(
    'form',
    { action: '/submitted', method: 'post' },
    h(
      'button',
      {
        type: 'button',
        onClick: (e: Event) =>
          ((e.target as HTMLElement).closest('form') as HTMLFormElement).submit(),
      },
      'Submit programmatically',
    ),
  )
}

/**
 * `location.assign` — Chromium makes `location` unforgeable, so NO in-page
 * guard can stop this. It must be caught from outside: the scenario is
 * reported as navigated-away and the run continues.
 */
export function LocationAssign(): ReturnType<typeof h> {
  return h('button', { type: 'button', onClick: () => window.location.assign('/elsewhere') }, 'Go')
}

/** Proves the run CONTINUED past the escapes above: a normal reactive counter. */
export function Counter(): ReturnType<typeof h> {
  const n = signal(0)
  return h('button', { type: 'button', onClick: () => n.set(n() + 1) }, () => `count ${n()}`)
}
