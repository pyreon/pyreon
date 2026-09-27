---
'@pyreon/hooks': minor
'@pyreon/a11y': minor
'@pyreon/toast': minor
'@pyreon/hotkeys': minor
'@pyreon/virtual': minor
---

Hardening pass across five fundamentals packages. Behaviour changes are marked **(behaviour)**.

**@pyreon/hooks**

- **(behaviour)** Hook teardown is now owned by the component. Every hook registered its cleanup with `onCleanup` from `@pyreon/reactivity`, which only registers inside an effect run: a root-mounted component never cleaned up (the GPS watch, socket, window listeners and speech kept running after unmount), and a component inside a `<For>` / `<Show>` / routed page had its cleanup tied to that boundary's effect — adding one `<For>` row tore down the resources of every row that stayed. Teardown now runs exactly when the component unmounts.
- `useGeolocation`: a TIMEOUT / POSITION_UNAVAILABLE error no longer drops the watch id (which left GPS on after unmount and let a retry open a second watch). Only a permission denial ends the watch, and it is cleared explicitly.
- **(behaviour)** `useEventListener`: a `target` that is `null` at setup (a ref) is resolved at mount instead of silently falling back to `window`; if it is still `null`, nothing is bound and a dev warning fires. `target` may also be an `EventTarget` directly.
- `useTimeAgo`: a reactive date getter is tracked, so a change re-renders immediately and restarts the timer. **(behaviour)** The "just now" bucket goes through a custom `formatter` as `(0, 'second', isPast)`.
- `useSpeech`: only the hook's own current utterance drives `speaking()` (a replaced utterance's late `onend` no longer flips it off mid-speech), and **(behaviour)** `stop()` / unmount only cancel speech this hook started.
- `useNotifications`: when the `Notification` constructor throws (Android Chrome), falls back to the service-worker registration's `showNotification`; `notify()` on a platform without the API warns in dev.
- **(behaviour)** `useClickOutside`: listens for a single `pointerdown` instead of `mousedown` + `touchstart`, which fired the handler twice per touch tap.
- `useInfiniteScroll`: keeps loading while the sentinel stays visible after a page lands (a first page that does not fill the container no longer stalls), and does not start a second load while one is in flight.
- **(behaviour)** `useLinking().openUrl` refuses `javascript:` / `data:` and any scheme other than http(s), mailto and tel (relative URLs allowed), with a dev warning.
- `useIntersection` / `useElementSize`: the element getter is tracked from mount, so an element that appears after mount is observed.
- `useMediaQuery` accepts a query getter and re-subscribes when it changes. `useKeyboard` gains `ignoreInputs`. `useWebSocket` gains `maxMessages`. `useScrollLock` compensates for the removed scrollbar and also locks `<html>` (iOS Safari).
- **(behaviour)** `useFetch`: `isPending` starts `true` on the server as well, matching the client's first render (was a hydration mismatch).

**@pyreon/a11y**

- **(behaviour)** `announce()`: both regions are created on the first call and messages are written ~100ms later, so the first announcement lands in a region the screen reader has already seen; messages announced together are joined instead of overwriting each other.
- `<LiveRegion>`, `<VisuallyHidden>` and `<SkipLink>` no longer freeze reactive props at setup. `<LiveRegion>` accepts accessors for `politeness` / `atomic` / `role` / `visible`, and toggling `visible` restyles the region instead of remounting it.
- **(behaviour)** `<SkipLink>` handles the jump itself (focus + scrollIntoView) and cancels the default hash navigation, which a hash-mode router read as a route.
- `<RouteAnnouncer>` warns in dev when `<RouterView>`'s built-in announcer is also active. `createA11yId`'s docs no longer claim server/client ids always match.

**@pyreon/toast**

- **(behaviour)** A duration a timer cannot hold (`Infinity`, above 2^31-1 ms, `NaN`, negative) is treated as persistent — it used to overflow and dismiss the toast after ~1ms.
- **(behaviour)** `toast()` is a no-op on the server (dev warning): the store is process-wide, so a server-side toast leaked into other requests.
- **(behaviour)** An action's `onClick` receives `{ id, dismiss }`.
- A second mounted `<Toaster>` warns in dev; a Toaster's `duration` default is restored on unmount; the Toaster now removes its portal host and visibility listener on unmount. Animations respect `prefers-reduced-motion`.

**@pyreon/hotkeys**

- A keydown without a `key` (Chrome autofill) no longer throws out of the shared listener; IME composition keystrokes never fire shortcuts; input detection uses `composedPath()[0]` so inputs inside a shadow root are recognised; `alt+<letter/digit>` matches on macOS via `event.code`.
- `useHotkey`'s `target` may be a ref / getter, resolved at mount and tracked afterwards.

**@pyreon/virtual**

- **(behaviour)** Options are read once per pass and REPLACE the previous options, so a key you stop returning falls back to TanStack's default instead of lingering. `useVirtualizer` warns in dev when `getScrollElement()` is still `null` after mount.
