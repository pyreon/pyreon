import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/toast',
  title: 'Toast Notifications',
  tagline:
    'Toast notifications — toast(), toast.success/error/warning/info/loading, Toaster component, a11y',
  description:
    'Imperative toast notifications for Pyreon. Call `toast()` from anywhere in your app — no provider or context needed. Preset variants (`toast.success`, `toast.error`, etc.), a `toast.promise()` helper for async operations, and `toast.update()` for loading-to-success patterns. Render `<Toaster />` once at the app root — it uses Portal, CSS transitions, auto-dismiss, and pause-on-hover. Accessible with `role="alert"` and `aria-live="polite"` on toast elements.',
  category: 'browser',
  peerDeps: ['@pyreon/runtime-dom'],
  longExample: `import { toast, Toaster } from '@pyreon/toast'

// Mount Toaster once at app root:
function App() {
  return (
    <>
      <Toaster position="top-right" duration={4000} />
      <MainContent />
    </>
  )
}

// Call toast() from anywhere — no provider needed:
toast('Hello!')

// Preset variants:
toast.success('Saved successfully!')
toast.error('Something went wrong')
toast.warning('Session expiring soon')
toast.info('New version available')

// Loading → success pattern:
const id = toast.loading('Saving...')
try {
  await saveData()
  toast.update(id, { type: 'success', message: 'Done!' })
} catch {
  toast.update(id, { type: 'error', message: 'Save failed' })
}

// Promise helper — auto-transitions through states:
toast.promise(fetchData(), {
  loading: 'Loading...',
  success: 'Loaded!',
  error: 'Failed to load',
})

// Dismiss programmatically:
const toastId = toast('Dismissable')
toast.dismiss(toastId)  // dismiss one
toast.dismiss()         // dismiss all`,
  features: [
    'toast() imperative API — call from anywhere, no provider needed',
    'toast.success/error/warning/info/loading preset variants',
    'toast.update(id, options) for loading-to-success transitions',
    'toast.promise(promise, messages) auto-transitions through states',
    'toast.dismiss(id?) — dismiss one or all',
    '<Toaster /> with Portal, CSS transitions, auto-dismiss, pause on hover',
    'Accessible: role="alert", aria-live="polite"',
  ],
  api: [
    {
      name: 'toast',
      kind: 'function',
      signature: '(message: string, options?: ToastOptions) => string',
      summary:
        'Create a toast notification imperatively. Returns the toast ID for later `update()` or `dismiss()`. Works from anywhere in the app — no context or provider needed. The function also exposes `.success()`, `.error()`, `.warning()`, `.info()`, `.loading()` preset methods, `.update(id, options)` for modifying existing toasts, `.dismiss(id?)` for removal, and `.promise(promise, messages)` for async operation tracking.',
      example: `// Basic:
toast('Hello!')
const id = toast.success('Saved!')

// Loading → success:
const loadId = toast.loading('Saving...')
await save()
toast.update(loadId, { type: 'success', message: 'Done!' })

// Promise helper:
toast.promise(fetchData(), {
  loading: 'Loading...',
  success: 'Loaded!',
  error: 'Failed',
})

// Dismiss:
toast.dismiss(id)  // one
toast.dismiss()    // all`,
      mistakes: [
        'Forgetting to render `<Toaster />` — toasts are created but have no visual container to render into',
        'Calling `toast.update()` after the toast has been auto-dismissed — the ID is no longer valid, the update is silently ignored',
        'Using `toast.promise()` with a function instead of a promise — pass the promise directly, not `() => fetch(...)`',
      ],
      seeAlso: ['Toaster'],
    },
    {
      name: 'Toaster',
      kind: 'component',
      signature: '(props?: ToasterProps) => VNodeChild',
      summary:
        'Render container for toast notifications. Mount once at the app root. Renders via Portal with CSS transitions, auto-dismiss timer, and pause-on-hover behavior. Position configurable via `position` prop (`top-right`, `top-left`, `bottom-right`, `bottom-left`, `top-center`, `bottom-center`). Duration configurable via `duration` prop (default 4000ms).',
      example: `<Toaster position="top-right" duration={5000} />`,
      mistakes: [
        'Mounting multiple `<Toaster />` instances — toasts render in all of them, causing duplicates',
        'Conditional rendering of `<Toaster />` — if unmounted, toasts created via `toast()` are queued but invisible until the Toaster mounts',
      ],
      seeAlso: ['toast'],
    },
  ],
  gotchas: [
    {
      label: 'No provider needed',
      note: 'Unlike most Pyreon packages, toast uses a module-level signal store — `toast()` works from event handlers, effects, or any non-component code. The `<Toaster />` component reads from this shared store.',
    },
    {
      label: 'Peer dep',
      note: '`@pyreon/runtime-dom` is required because `<Toaster />` JSX emits `_tpl()` calls — declare it in consumer app dependencies.',
    },
    {
      label: 'Pause on hover',
      note: 'The auto-dismiss timer pauses while the user hovers over a toast and resumes when the cursor leaves. This is built into `<Toaster />` with no configuration needed.',
    },
  ],
})
