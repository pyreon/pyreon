import type { VNodeChild } from '@pyreon/core'
import { For, nativeCompat, Portal } from '@pyreon/core'
import { computed, effect, onCleanup } from '@pyreon/reactivity'
import { toastStyles } from './styles'
import { _pauseAll, _resumeAll, _toasts, toast } from './toast'
import type { Toast, ToasterProps, ToastPosition } from './types'

// ─── Style injection ─────────────────────────────────────────────────────────

function injectStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-pyreon-toast]')) return

  const style = document.createElement('style')
  style.setAttribute('data-pyreon-toast', '')
  style.textContent = toastStyles
  document.head.appendChild(style)
}

// ─── Position helpers ────────────────────────────────────────────────────────

function getContainerStyle(position: ToastPosition, gap: number, offset: number): string {
  const [vertical, horizontal] = position.split('-') as [string, string]

  let style = `gap: ${gap}px;`

  if (vertical === 'top') {
    style += ` top: ${offset}px;`
  } else {
    style += ` bottom: ${offset}px;`
    style += ' flex-direction: column-reverse;'
  }

  if (horizontal === 'left') {
    style += ` left: ${offset}px;`
  } else if (horizontal === 'center') {
    style += ' left: 50%; transform: translateX(-50%);'
  } else {
    style += ` right: ${offset}px;`
  }

  return style
}

// ─── Toaster component ──────────────────────────────────────────────────────

/**
 * Render component for toast notifications. Place once at your app root.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <>
 *       <Toaster position="bottom-right" />
 *       <MyApp />
 *     </>
 *   )
 * }
 * ```
 */
export function Toaster(props?: ToasterProps): VNodeChild {
  if (typeof document === 'undefined') return null

  const position = props?.position ?? 'top-right'
  const max = props?.max ?? 5
  const gap = props?.gap ?? 8
  const offset = props?.offset ?? 16

  injectStyles()

  // Promote "entering" toasts to "visible" on next frame.
  // Only runs when there are actually entering toasts (early return guard).
  // Reason for the suppression below: rAF is scheduling reactive state
  // updates (entering → visible), not setup work. Singleton Toaster, not
  // per-instance — accumulation doesn't apply.
  // pyreon-lint-disable-next-line pyreon/no-imperative-effect-on-create
  effect(() => {
    const toasts = _toasts()
    const hasEntering = toasts.some((t) => t.state === 'entering')
    if (!hasEntering) return

    const raf = requestAnimationFrame(() => {
      const current = _toasts()
      let changed = false
      const next = current.map((t) => {
        if (t.state === 'entering') {
          changed = true
          return { ...t, state: 'visible' as const }
        }
        return t
      })
      if (changed) _toasts.set(next)
    })

    onCleanup(() => cancelAnimationFrame(raf))
  })

  // Computed visible toasts — only the most recent `max` items
  const visibleToasts = computed(() => _toasts().slice(-max))

  const containerStyle = getContainerStyle(position, gap, offset)

  return (
    <Portal target={document.body}>
      <section
        class="pyreon-toast-container"
        style={containerStyle}
        aria-label="Notifications"
        aria-live="polite"
        onMouseEnter={_pauseAll}
        onMouseLeave={_resumeAll}
      >
        <For each={visibleToasts} by={(t: Toast) => t.id}>
          {(t: Toast) => <ToastItem toast={t} />}
        </For>
      </section>
    </Portal>
  )
}

// ─── Toast item ─────────────────────────────────────────────────────────────

function ToastItem(props: { toast: Toast }): VNodeChild {
  const t = props.toast
  const stateClass =
    t.state === 'entering'
      ? ' pyreon-toast--entering'
      : t.state === 'exiting'
        ? ' pyreon-toast--exiting'
        : ''

  return (
    <div
      class={`pyreon-toast pyreon-toast--${t.type}${stateClass}`}
      role="alert"
      aria-atomic="true"
      data-toast-id={t.id}
    >
      <div class="pyreon-toast__message">
        {typeof t.message === 'string' ? t.message : t.message}
      </div>
      {t.action && (
        <button type="button" class="pyreon-toast__action" onClick={t.action.onClick}>
          {t.action.label}
        </button>
      )}
      {t.dismissible && (
        <button
          type="button"
          class="pyreon-toast__dismiss"
          onClick={() => toast.dismiss(t.id)}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  )
}

// Mark as native — compat-mode jsx() runtimes skip wrapCompatComponent so
// Toaster's effect()/onCleanup-based style injection + Portal mounting run
// inside Pyreon's setup frame (compat wrapping breaks the Portal's reactive
// re-render path).
nativeCompat(Toaster)
