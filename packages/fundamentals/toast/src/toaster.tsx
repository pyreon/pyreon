import type { VNodeChild } from "@pyreon/core"
import { h, Portal } from "@pyreon/core"
import { effect, onCleanup } from "@pyreon/reactivity"
import { toastStyles } from "./styles"
import { _pauseAll, _resumeAll, _toasts, toast } from "./toast"
import type { Toast, ToasterProps, ToastPosition } from "./types"

// ─── Style injection ─────────────────────────────────────────────────────────

let _styleInjected = false

function injectStyles(): void {
  if (_styleInjected) return
  _styleInjected = true

  const style = document.createElement("style")
  style.setAttribute("data-pyreon-toast", "")
  style.textContent = toastStyles
  document.head.appendChild(style)
}

// ─── Position helpers ────────────────────────────────────────────────────────

function getContainerStyle(position: ToastPosition, gap: number, offset: number): string {
  const [vertical, horizontal] = position.split("-") as [string, string]

  let style = `gap: ${gap}px;`

  if (vertical === "top") {
    style += ` top: ${offset}px;`
  } else {
    style += ` bottom: ${offset}px;`
    style += " flex-direction: column-reverse;"
  }

  if (horizontal === "left") {
    style += ` left: ${offset}px;`
  } else if (horizontal === "center") {
    style += " left: 50%; transform: translateX(-50%);"
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
 * function App() {
 *   return (
 *     <>
 *       <Toaster position="bottom-right" />
 *       <MyApp />
 *     </>
 *   )
 * }
 */
export function Toaster(props?: ToasterProps): VNodeChild {
  const position = props?.position ?? "top-right"
  const max = props?.max ?? 5
  const gap = props?.gap ?? 8
  const offset = props?.offset ?? 16

  injectStyles()

  // Promote "entering" toasts to "visible" on next frame
  effect(() => {
    const toasts = _toasts()
    const entering = toasts.filter((t) => t.state === "entering")
    if (entering.length === 0) return

    const raf = requestAnimationFrame(() => {
      const current = _toasts()
      let changed = false
      const next = current.map((t) => {
        if (t.state === "entering") {
          changed = true
          return { ...t, state: "visible" as const }
        }
        return t
      })
      if (changed) _toasts.set(next)
    })

    onCleanup(() => cancelAnimationFrame(raf))
  })

  const containerStyle = getContainerStyle(position, gap, offset)

  return h(Portal, {
    target: document.body,
    children: h(
      "div",
      {
        class: "pyreon-toast-container",
        style: containerStyle,
        role: "region",
        "aria-label": "Notifications",
        "aria-live": "polite",
        onMouseEnter: _pauseAll,
        onMouseLeave: _resumeAll,
      },
      ...(() => {
        const toasts = _toasts()
        const visible = toasts.slice(-max)
        return visible.map((t) => renderToast(t))
      })(),
    ),
  })
}

function renderToast(t: Toast): VNodeChild {
  const stateClass =
    t.state === "entering"
      ? " pyreon-toast--entering"
      : t.state === "exiting"
        ? " pyreon-toast--exiting"
        : ""

  return h(
    "div",
    {
      class: `pyreon-toast pyreon-toast--${t.type}${stateClass}`,
      key: t.id,
      role: "alert",
      "aria-atomic": "true",
      "data-toast-id": t.id,
    },
    h(
      "div",
      { class: "pyreon-toast__message" },
      typeof t.message === "string" ? t.message : t.message,
    ),
    ...(t.action
      ? [
          h(
            "button",
            {
              class: "pyreon-toast__action",
              onClick: t.action.onClick,
            },
            t.action.label,
          ),
        ]
      : []),
    ...(t.dismissible
      ? [
          h(
            "button",
            {
              class: "pyreon-toast__dismiss",
              onClick: () => toast.dismiss(t.id),
              "aria-label": "Dismiss",
            },
            "\u00d7",
          ),
        ]
      : []),
  )
}
