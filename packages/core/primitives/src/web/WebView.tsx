// Web implementation of `<WebView>` — renders an `<iframe>`.
//
// Compiles to:
// - **Web** (this impl): `<iframe srcdoc={html}>` or `<iframe src={src}>`,
//   filling its container.
// - **iOS** (via PMTC): `PyreonWebView(html:/src:)` → a `WKWebView`.
// - **Android** (via PMTC): `PyreonWebView(html =/src =)` → an Android
//   `WebView`.
//
// Same semantics on every target: host the given web content in a frame.
// The canonical use is hosting web-only-rich viz (charts / flow / tables)
// inside a native shell — on web you'd usually render the viz directly
// (e.g. inside `<Web>`), but `<WebView>` works on web too for parity / when
// an iframe boundary is wanted.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { collectPassthroughAttrs } from './passthrough'
import { parseWebHostGroupMessage, WEB_HOST_GROUP_RELAY_FN } from '../web-host-bridge'
import type { WebViewProps } from '../types/webview'

/** A mounted host taking part in a host group (its iframe, read live). */
interface HostGroupMember {
  frame(): HTMLIFrameElement | null
}

/**
 * Host-group registry: group name → the hosts currently in it. Module-level
 * by necessity (siblings live in unrelated subtrees); every entry is removed
 * by IDENTITY when its host leaves or unmounts, and an emptied group is
 * deleted, so the map never outgrows the set of live grouped hosts.
 */
const hostGroups = new Map<string, Set<HostGroupMember>>()

function leaveHostGroup(member: HostGroupMember, group: string | null): void {
  if (group === null) return
  const members = hostGroups.get(group)
  /* v8 ignore next — defensive: a member only ever holds a group name it
     joined, so the registry always has the entry by the time it leaves. */
  if (!members) return
  members.delete(member)
  if (members.size === 0) hostGroups.delete(group)
}

function joinHostGroup(member: HostGroupMember, group: string, current: string | null): string {
  if (current === group) return group
  leaveHostGroup(member, current)
  let members = hostGroups.get(group)
  if (!members) {
    members = new Set()
    hostGroups.set(group, members)
  }
  members.add(member)
  return group
}

/** Deliver `message` to every OTHER member of `group` through the page-level relay entry point. */
function relayHostGroup(from: HostGroupMember, group: string, message: string): void {
  const members = hostGroups.get(group)
  /* v8 ignore next — defensive: the caller relays only into the group it
     joined, which put the entry there. */
  if (!members) return
  for (const member of members) {
    if (member === from) continue
    const win = member.frame()?.contentWindow as
      | (Window & { [WEB_HOST_GROUP_RELAY_FN]?: (message: string) => void })
      | null
      | undefined
    try {
      win?.[WEB_HOST_GROUP_RELAY_FN]?.(message)
    } catch {
      // Cross-origin sibling — unreachable by design.
    }
  }
}

export function WebView(props: WebViewProps): VNode {
  const attrs: Record<string, unknown> = {
    ...collectPassthroughAttrs(props as Record<string, unknown>),
    // Fill the container, no chrome — matches the native host's full-bleed
    // embed.
    style: 'border: 0; width: 100%; height: 100%',
  }
  // Accessors, not values: a changed `html`/`src` reloads the page, as the
  // native hosts do, and `onLoad` below re-installs the bridge and re-pushes
  // `data` for the new document. `html` wins over `src`, at every change.
  if (props.html !== undefined || props.src !== undefined) {
    attrs.srcdoc = (): string | undefined => props.html
    attrs.src = (): string | undefined => (props.html === undefined ? props.src : undefined)
  }

  const hasData = 'data' in props

  // Both bridges share ONE frame ref + onLoad. Same-origin / `srcdoc`
  // only — a cross-origin remote `src` can't be reached from the parent
  // (the native targets cover remote content via evaluateJavaScript / the
  // script-message handler; on web you host same-origin / srcdoc content).
  // The reverse bridge is ALWAYS installed (the native hosts install theirs
  // at WebView construction too): a page needs it to join a host group even
  // when the host itself has no `onMessage`.
  {
    let frame: HTMLIFrameElement | null = null
    let loaded = false
    // Host-group membership of THIS host, driven by the page's reserved
    // messages; cleared on leave and on unmount (identity removal).
    let group: string | null = null
    const member: HostGroupMember = { frame: () => frame }

    // Live-data bridge — push `data` into the hosted page's
    // `window.__pyreonData` + fire a `pyreondata` event, on load AND
    // reactively on change, WITHOUT reloading the iframe.
    const push = (): void => {
      const win = frame?.contentWindow as (Window & { __pyreonData?: unknown }) | null | undefined
      if (!loaded || !win) return
      try {
        win.__pyreonData = (props as { data?: unknown }).data
        win.dispatchEvent(new Event('pyreondata'))
      } catch {
        // Cross-origin iframe — injection is blocked by the browser.
      }
    }

    // Reverse bridge — define the unified `window.pyreonPostMessage(m)`
    // API on the hosted page so it can send strings back to the host's
    // `onMessage` callback (mirror of the iOS WKScriptMessageHandler /
    // Android @JavascriptInterface).
    const injectReverseBridge = (): void => {
      const win = frame?.contentWindow as
        | (Window & { pyreonPostMessage?: (m: unknown) => void })
        | null
        | undefined
      if (!win) return
      try {
        win.pyreonPostMessage = (m: unknown): void => {
          const message = String(m)
          // Reserved host-group traffic is consumed here and never forwarded.
          const groupMessage = parseWebHostGroupMessage(message)
          if (groupMessage === null) {
            ;(props as { onMessage?: (message: string) => void }).onMessage?.(message)
          } else if ('join' in groupMessage) {
            group = joinHostGroup(member, groupMessage.join, group)
          } else if ('leave' in groupMessage) {
            leaveHostGroup(member, group)
            group = null
          } else if (groupMessage.group === group) {
            // A page may only relay into the group it joined.
            relayHostGroup(member, group, groupMessage.message)
          }
        }
      } catch {
        // Cross-origin iframe — can't define on the page's window.
      }
    }

    attrs.ref = (el: HTMLIFrameElement | null): void => {
      frame = el
      if (el === null) {
        leaveHostGroup(member, group)
        group = null
      }
    }
    // `onLoad` is wired by the runtime (no raw addEventListener) — run the
    // bridges once the iframe's document exists.
    attrs.onLoad = (): void => {
      loaded = true
      // REVERSE bridge FIRST, then the data push. A hosted page commonly reacts
      // to the very first `pyreondata` by sending something back — an echo, a
      // ready signal, a rendered-size report — and pushing before the bridge
      // exists drops that first response silently.
      //
      // The old order happened to work with `srcdoc`, where the page's own
      // script runs before this handler at all; it does NOT with `src`, where
      // the page loads asynchronously and its first `send()` lands between the
      // push and the injection. Both native runtimes install their message
      // handler at WebView CONSTRUCTION, i.e. before any data can arrive, so
      // this also stops the web from being the odd one out.
      injectReverseBridge()
      if (hasData) push()
    }
    // Re-push whenever `data` changes (the read tracks it). On the first
    // run the iframe usually isn't loaded yet → push no-ops, and `onLoad`
    // pushes once it is.
    if (hasData) {
      effect(() => {
        void (props as { data?: unknown }).data
        push()
      })
    }
  }
  return h('iframe', attrs)
}
