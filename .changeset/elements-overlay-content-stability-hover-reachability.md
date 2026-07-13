---
"@pyreon/elements": minor
---

Fix two `Overlay` behavior bugs and tighten the render-prop / provider types.

- **Content no longer remounts on a viewport-edge flip.** The content-mount
  accessor read the resolved `align` / `alignX` / `alignY` as VALUES, so it
  subscribed to those signals — a flip (`bottom`→`top`) re-ran the accessor and
  REMOUNTED the whole Portal/content subtree, double-firing the content's
  `onMount` and dropping any internal state (an input the user was typing in a
  popover). They now reach the content as live `_rp()` reactive props, so a flip
  re-styles it in place with no remount.
- **Hover overlays keep open while the pointer is over their content.** The
  content's hover listeners were attached once at mount, when the (lazily
  rendered) content did not yet exist — so moving the pointer trigger→content
  closed the tooltip/dropdown out from under you. The content-hover listeners
  now re-bind as the content mounts (`isContentLoaded`).
- `Overlay`'s `trigger` / content render props now expose a typed `ref` (attach
  it to the anchor / floating node), so `trigger={(t) => <button ref={t.ref}>}`
  typechecks instead of forcing an `any` cast.
- `OverlayProvider` coordination props (`blocked` / `setBlocked` /
  `setUnblocked`) are now OPTIONAL — a root `<OverlayProvider>{app}</OverlayProvider>`
  establishes the context with no-op defaults; the default overlay context is a
  working no-op instead of the former `{}` cast.
- Docs: corrected the long-standing `useOverlay` return-shape drift (it returns
  `{ triggerRef, contentRef, active, showContent, hideContent, … }`, never
  `isOpen` / `open` / `close` / `toggle` / `triggerProps`) across the manifest +
  README, and `@pyreon/elements` is now ENFORCED by `check-manifest-examples`.
