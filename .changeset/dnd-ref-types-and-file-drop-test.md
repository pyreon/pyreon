---
"@pyreon/dnd": minor
---

`useSortable`'s `containerRef` and `itemRef(key)` callbacks now accept `HTMLElement | null` instead of `HTMLElement`, matching Pyreon's `RefProp` contract (refs are called with `null` on unmount). The hook ignores `null` calls — pdnd's per-element cleanups are registered via `onCleanup`, so the unmount path is already covered.

Pre-fix, every consumer had to wrap with adapter callbacks at the call site:

```tsx
const containerRefAdapter = (el: HTMLElement | null) => {
  if (el) sortable.containerRef(el)
}
const itemRefAdapter = (id: string) => (el: HTMLElement | null) => {
  if (el) sortable.itemRef(id)(el)
}

<ul ref={containerRefAdapter}>
  <For each={items()} by={(i) => i.id}>
    {(item) => <li ref={itemRefAdapter(item.id)}>{item.label}</li>}
  </For>
</ul>
```

Post-fix:

```tsx
<ul ref={sortable.containerRef}>
  <For each={items()} by={(i) => i.id}>
    {(item) => <li ref={sortable.itemRef(item.id)}>{item.label}</li>}
  </For>
</ul>
```

Also adds the package's first real-Chromium browser test suite at `src/use-file-drop.browser.test.tsx` (3 tests). The happy-dom unit suite covers `useFileDrop`'s signal surface but can't drive pragmatic-drag-and-drop's external/file adapter end-to-end (happy-dom's DataTransfer polyfill is incomplete enough that the adapter's window-level dragenter activation rejects the synthetic event). The new browser test uses pdnd's official Playwright pattern (window-level `dragenter` + element-level `dragover` + `drop`, sharing one DataTransfer) to regression-lock the drop pathway at the package level — the same shape the app-showcase `/dnd` e2e uses, but here the failure surfaces in `bun run test:browser` against `@pyreon/dnd` directly.
