import type { VNodeChild, VNodeChildAtom } from '@pyreon/core'
import { For, nativeCompat, Portal, Show } from '@pyreon/core'
import { computed, effect, onCleanup } from '@pyreon/reactivity'
import { setupDelegation } from '@pyreon/runtime-dom'
import { toastStyles } from './styles'
import { _pauseAll, _resumeAll, _setDefaultDuration, _toastMap, _toasts, toast } from './toast'
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

  // App-wide default auto-dismiss duration. The store is module-level (toasts
  // can be created before the Toaster mounts), so the Toaster writes the
  // default that `addToast` reads for toasts without their own `duration`.
  if (props?.duration !== undefined) _setDefaultDuration(props.duration)

  injectStyles()

  // Portal HOST + event delegation.
  //
  // Toasts render OUTSIDE the app's mount container (a Portal into the body
  // region). Pyreon delegates common bubbling events (`click`, `submit`,
  // `focusin`/`focusout`, …) through a SINGLE listener on the mount container
  // — but a click on a Portal'd dismiss/action button bubbles `button → body`,
  // never through that container, so the delegated handler never fires (the
  // dismiss `×`, the action button, and pause-on-FOCUS were all silently
  // dead). We mount into a per-Toaster host element and install delegation on
  // IT: clicks inside the host are caught, while the app's own delegated
  // handlers (outside the host) are NOT — so there's no double-firing that a
  // listener on `document.body` (an ancestor of the mount root) would cause.
  // Mirrors @pyreon/elements' per-instance Portal wrapper.
  const host = document.createElement('div')
  document.body.appendChild(host)
  setupDelegation(host)
  onCleanup(() => host.remove())

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

  // The IDs of the most-recent `max` toasts. The `<For>` keys on this — it is
  // STRUCTURE only (which rows exist + their order). Each row reads its own
  // live fields (message/type/state) via `_toastMap().get(id)`; see ToastItem
  // and the `_toastMap` docstring for why the row can't read the snapshot the
  // For callback receives.
  const visibleIds = computed(() => _toasts().slice(-max).map((t) => t.id))

  const containerStyle = getContainerStyle(position, gap, offset)

  return (
    <Portal target={host}>
      {/* A labeled landmark region (a `<section>` with an accessible name IS a
          `region`). The live announcement is per-TOAST (each carries `role`
          alert/status by urgency, which implies its own aria-live) — so the
          container deliberately does NOT set `aria-live`, which would
          double-announce every toast. Auto-dismiss pauses on hover (mouse) AND
          on focus (keyboard): `onFocusIn`/`onFocusOut` are the BUBBLING focus
          events, so tabbing into any toast (e.g. its close button) pauses the
          timers the same way hovering does. Both affordances are accessible,
          so the non-interactive-element rule is suppressed here. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <section
        class="pyreon-toast-container"
        style={containerStyle}
        aria-label="Notifications"
        onMouseEnter={_pauseAll}
        onMouseLeave={_resumeAll}
        onFocusIn={_pauseAll}
        onFocusOut={_resumeAll}
      >
        <For each={visibleIds} by={(id: string) => id}>
          {(id: string) => <ToastItem id={id} />}
        </For>
      </section>
    </Portal>
  )
}

// ─── Toast item ─────────────────────────────────────────────────────────────

function ToastItem(props: { id: string }): VNodeChild {
  const id = props.id

  // `action` / `dismissible` / `icon` are IMMUTABLE per toast — `toast.update`
  // only touches message/type/duration/description. Read them ONCE (the `<For>`
  // child callback runs untracked, so this snapshot read leaks no subscription)
  // so the icon + action / close buttons mount exactly once instead of
  // re-mounting on every unrelated store change.
  const initial = _toastMap().get(id)
  const action = initial?.action
  const dismissible = initial?.dismissible ?? true
  const icon = initial?.icon
  const hasDescription = initial?.description != null

  // `message` / `type` / `state` / `description` DO change (update, promise
  // transition, entering→visible). Read them LIVE via the map inside reactive
  // thunks so a single update patches only this row's text node / className in
  // place — no component re-render, no row remount. See the `_toastMap` docstring.
  const live = (): Toast | undefined => _toastMap().get(id)

  // `message`/`description` are `string | VNodeChild` — VNodeChild includes an
  // accessor arm, which a reactive child callback may not RETURN (it must yield
  // an atom). Resolve a function value so a `() => …` message/description still
  // renders and the type stays honest.
  const resolve = (v: string | VNodeChild | undefined): VNodeChildAtom | VNodeChildAtom[] =>
    typeof v === 'function' ? v() : (v ?? '')

  return (
    <div
      class={() => {
        const t = live()
        const stateClass =
          t?.state === 'entering'
            ? ' pyreon-toast--entering'
            : t?.state === 'exiting'
              ? ' pyreon-toast--exiting'
              : ''
        return `pyreon-toast pyreon-toast--${t?.type ?? 'info'}${stateClass}`
      }}
      // Type-aware live-region urgency: errors/warnings interrupt (assertive
      // `alert`), info/success are polite (`status`). The role IMPLIES aria-live
      // — so the toast itself is the announced live region and the container is
      // a plain labeled region (no double-announce). Reactive so an info→error
      // `update` upgrades urgency.
      role={() => {
        const ty = live()?.type
        return ty === 'error' || ty === 'warning' ? 'alert' : 'status'
      }}
      aria-atomic="true"
      data-toast-id={id}
    >
      <Show when={icon}>
        <span class="pyreon-toast__icon" aria-hidden="true">
          {icon}
        </span>
      </Show>
      <div class="pyreon-toast__content">
        <div class="pyreon-toast__message">{() => resolve(live()?.message)}</div>
        <Show when={hasDescription}>
          <div class="pyreon-toast__description">{() => resolve(live()?.description)}</div>
        </Show>
      </div>
      {action && (
        <button type="button" class="pyreon-toast__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {dismissible && (
        <button
          type="button"
          class="pyreon-toast__dismiss"
          onClick={() => toast.dismiss(id)}
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
