import { signal } from '@pyreon/reactivity'
import { toast, Toaster } from '@pyreon/toast'

const counter = signal(0)

async function fakeApi(ms: number, shouldFail = false): Promise<string> {
  await new Promise((r) => setTimeout(r, ms))
  if (shouldFail) throw new Error('Network error')
  return 'OK'
}

export function ToastDemo() {
  return (
    <div>
      <h2>Toast</h2>
      <p class="desc">
        Toast notifications — imperative API with success/error/warning/info/loading
        variants, auto-dismiss, pause-on-hover, accessibility (role=alert + aria-live).
      </p>

      <div class="section">
        <h3>Variants</h3>
        <div class="row">
          <button onClick={() => toast.success('Saved successfully!')} data-testid="toast-success">
            success
          </button>
          <button
            onClick={() => toast.error('Something went wrong')}
            data-testid="toast-error"
          >
            error
          </button>
          <button onClick={() => toast.warning('Heads up!')} data-testid="toast-warning">
            warning
          </button>
          <button onClick={() => toast.info('FYI: this is informational')} data-testid="toast-info">
            info
          </button>
          <button onClick={() => toast('Plain toast')} data-testid="toast-plain">
            plain
          </button>
        </div>
      </div>

      <div class="section">
        <h3>Loading + update</h3>
        <p style="margin-bottom: 12px; font-size: 13px; color: #666">
          A persistent loading toast that gets updated when the operation completes.
        </p>
        <div class="row">
          <button
            data-testid="toast-loading"
            onClick={async () => {
              const id = toast.loading('Saving…')
              await new Promise((r) => setTimeout(r, 1500))
              toast.update(id, { message: 'Saved!', type: 'success' })
            }}
          >
            Save (loading → success)
          </button>
        </div>
      </div>

      <div class="section">
        <h3>Promise helper</h3>
        <p style="margin-bottom: 12px; font-size: 13px; color: #666">
          <code>toast.promise(p, &#123;loading, success, error&#125;)</code> auto-transitions
          a single toast through all three states.
        </p>
        <div class="row">
          <button
            data-testid="toast-promise-success"
            onClick={() =>
              toast.promise(fakeApi(1200, false), {
                loading: 'Fetching…',
                success: (val) => `Fetched: ${val}`,
                error: (err) =>
                  `Failed: ${err instanceof Error ? err.message : String(err)}`,
              })
            }
          >
            Promise (resolves)
          </button>
          <button
            data-testid="toast-promise-error"
            onClick={() =>
              toast.promise(fakeApi(1200, true), {
                loading: 'Fetching (will fail)…',
                success: 'unreachable',
                error: (err) =>
                  `Failed: ${err instanceof Error ? err.message : String(err)}`,
              })
            }
          >
            Promise (rejects)
          </button>
        </div>
      </div>

      <div class="section">
        <h3>Bulk + dismiss</h3>
        <div class="row">
          <button
            data-testid="toast-bulk"
            onClick={() => {
              counter.update((n) => n + 1)
              for (let i = 0; i < 5; i++) {
                toast.info(`Toast #${counter() * 10 + i}`)
              }
            }}
          >
            Fire 5 toasts
          </button>
          <button onClick={() => toast.dismiss()} data-testid="toast-dismiss-all">
            Dismiss all
          </button>
        </div>
      </div>

      <Toaster />
    </div>
  )
}
