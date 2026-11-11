import { onMount, onUnmount } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { _toasts, toast, Toaster } from '@pyreon/toast'
import { font, paper } from '../theme'
import { el } from '../kit/bases'
import { CodeBlock } from '../kit/code'
import { Pill } from '../kit/controls'
import { DemoGrid, DemoPanel, Meters } from '../kit/demo'
import { Code, Eyebrow } from '../kit/type'

const MAX = 3
/** The site's floating nav ends at 70px; the stack starts below it. */
const NAV_CLEARANCE = 84

/**
 * The Toaster's built-in look, re-coloured to the site's paper palette for
 * contrast (its default dismiss `×` and action text are below 4.5:1 on
 * white), and the stack moved down to clear the floating nav (the Toaster's
 * `offset` sets the top and the side together, and its position is an
 * inline style). Injected while the demo is mounted and removed with it.
 */
const TOAST_CSS = `
  body .pyreon-toast-container { top: ${NAV_CLEARANCE}px !important; max-width: calc(100vw - 32px); }
  body .pyreon-toast { font-family: ${font.system}; color: ${paper.text}; background: ${paper.field}; box-shadow: 0 18px 40px -20px ${paper.mist}, ${paper.ring}; }
  body .pyreon-toast__description { color: ${paper.fog}; }
  body .pyreon-toast__action { color: ${paper.accent}; border-color: ${paper.line}; font-family: inherit; }
  body .pyreon-toast__action:hover { background: ${paper.bg}; }
  body .pyreon-toast__dismiss { color: ${paper.fog}; }
  body .pyreon-toast__dismiss:hover { color: ${paper.text}; }
  body .pyreon-toast__action:focus-visible, body .pyreon-toast__dismiss:focus-visible { outline: 2px solid ${paper.accent}; outline-offset: 2px; }
`

const Buttons = el
  .config({ name: 'DemoToastButtons' })
  .attrs({ block: true, contentDirection: 'inline', gap: 8 })
  .theme(() => ({ flexWrap: 'wrap', minWidth: 0 }))

/**
 * Toast demo (`toast.json` → demo): the real `@pyreon/toast`. The demo
 * mounts its own `<Toaster position="top-right" max={3} duration={4000} />`
 * and takes every toast down when it unmounts, so nothing follows the reader
 * to another page. Toasts past `max` wait in the store with their own
 * timers; the counters read the store and count the toasts on screen.
 */
export default function DemoToast() {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const after = (ms: number, fn: () => void) => {
    // pyreon-lint-disable-next-line pyreon/no-raw-setinterval
    const t = setTimeout(() => {
      timers.delete(t)
      fn()
    }, ms)
    timers.add(t)
  }
  const wait = (ms: number) => new Promise<void>((resolve) => after(ms, resolve))

  const live = computed(() => _toasts().filter((t) => t.state !== 'exiting').length)
  const onScreen = signal(0)
  // The Toaster renders nothing on the server; mounting it after hydration
  // keeps the server HTML and the first client render identical.
  const mounted = signal(false)

  let style: HTMLStyleElement | undefined
  let observer: MutationObserver | undefined
  onMount(() => {
    style = document.createElement('style')
    style.textContent = TOAST_CSS
    document.head.appendChild(style)
    mounted.set(true)
    // Count what the Toaster actually rendered (it portals into <body>).
    const container = document.querySelector('.pyreon-toast-container')
    if (!container) return
    const count = () => onScreen.set(container.querySelectorAll('.pyreon-toast:not(.pyreon-toast--exiting)').length)
    observer = new MutationObserver(count)
    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    count()
  })
  let tornDown = false
  const teardown = () => {
    if (tornDown) return
    tornDown = true
    for (const t of timers) clearTimeout(t)
    timers.clear()
    observer?.disconnect()
    toast.remove()
    mounted.set(false)
    style?.remove()
  }
  onUnmount(teardown)
  // Every page is static HTML (site/render-mode.ts): leaving it is a page
  // load, so there is no client-side route change to tear down on, and no
  // router in the island (useRoute() threw "No router installed" when the
  // island hydrated).

  const fire = {
    success: () => toast.success('Saved'),
    error: () =>
      toast.error('Connection failed', {
        action: {
          label: 'Retry',
          onClick: ({ dismiss }) => {
            dismiss()
            toast.success('Reconnected')
          },
        },
      }),
    info: () => toast.info('New version available'),
    loading: () => {
      const id = toast.loading('Saving draft…')
      after(1500, () => toast.update(id, { message: 'Saved revision #42', type: 'success', duration: 4000 }))
    },
    promise: () => {
      void toast.promise(wait(1500), { loading: 'Publishing…', success: 'Published', error: 'Publishing failed' })
    },
  }

  return (
    <DemoGrid>
      <DemoPanel>
        <Eyebrow>fire some toast</Eyebrow>
        <Buttons>
          <Pill onClick={fire.success}>
            <Code>toast.success('Saved')</Code>
          </Pill>
          <Pill onClick={fire.error}>
            <Code>toast.error(…, {'{ action }'})</Code>
          </Pill>
          <Pill onClick={fire.info}>
            <Code>toast.info(…)</Code>
          </Pill>
          <Pill onClick={fire.loading}>
            <Code>toast.loading → update</Code>
          </Pill>
          <Pill onClick={fire.promise}>
            <Code>toast.promise(save())</Code>
          </Pill>
          <Pill onClick={() => toast.dismiss()}>
            <Code>toast.dismiss()</Code>
          </Pill>
        </Buttons>
        <CodeBlock label="The demo's Toaster" code={`<Toaster position="top-right" max={${MAX}} duration={4000} />`} />
      </DemoPanel>
      <DemoPanel note="Toasts appear in the top-right corner of the window. Hover or focus them to pause every countdown, including the ones waiting behind the three on screen.">
        <Meters
          label="Toasts"
          items={[
            { label: 'in the store', value: () => live() },
            { label: 'on screen', value: () => onScreen() },
          ]}
        />
        {() => (mounted() ? <Toaster position="top-right" max={MAX} duration={4000} /> : null)}
      </DemoPanel>
    </DemoGrid>
  )
}
