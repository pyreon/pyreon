import { signal, type Signal } from '@pyreon/reactivity'
import { toast, Toaster } from '@pyreon/toast'

/**
 * Live `@pyreon/toast` demo — the REAL imperative API, not a re-implementation.
 *
 * Mounts one `<Toaster>` (bottom-right) and fires real `toast.*` calls from the
 * buttons: presets, the promise pattern, a loading→success `update`, and
 * dismiss-all. The `shared` signal counts how many toasts this demo has fired —
 * bridge it with `<Example ... share="toasts-fired" />` and any other Example on
 * the page reading the same signal reacts. Falls back to a local signal when
 * unbridged (the "bridgeable, not require-bridged" contract).
 */
export default function ToastNotifications(props: { shared?: Signal<number> }) {
  const fired = props.shared ?? signal(0)
  const bump = () => fired.update((n) => n + 1)

  const fakeSave = () =>
    new Promise<{ files: number }>((resolve, reject) => {
      setTimeout(
        () => (Math.random() > 0.3 ? resolve({ files: 3 }) : reject(new Error('network'))),
        900,
      )
    })

  return (
    <div class="example-col">
      <Toaster position="bottom-right" />

      <div class="example-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <button
          type="button"
          class="example-btn"
          onClick={() => {
            toast.success('Saved!', { description: '3 files · 1.2 MB' })
            bump()
          }}
        >
          Success
        </button>
        <button
          type="button"
          class="example-btn"
          onClick={() => {
            toast.error('Connection failed', {
              action: { label: 'Retry', onClick: () => toast.info('Retrying…') },
            })
            bump()
          }}
        >
          Error + action
        </button>
        <button
          type="button"
          class="example-btn"
          onClick={() => {
            const id = toast.loading('Uploading…')
            bump()
            setTimeout(() => toast.update(id, { type: 'success', message: 'Uploaded!' }), 1000)
          }}
        >
          Loading → success
        </button>
        <button
          type="button"
          class="example-btn"
          onClick={() => {
            toast.promise(fakeSave(), {
              loading: 'Saving draft…',
              success: (data) => `Saved ${data.files} files`,
              error: (err) => `Failed: ${(err as Error).message}`,
            })
            bump()
          }}
        >
          Promise
        </button>
        <button type="button" class="example-btn" onClick={() => toast.dismiss()}>
          Dismiss all
        </button>
      </div>

      <div class="example-card">
        <span class="example-muted">toasts fired: </span>
        <span class="example-badge">{() => fired()}</span>
      </div>
    </div>
  )
}
