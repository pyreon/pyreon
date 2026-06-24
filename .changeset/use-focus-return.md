---
"@pyreon/hooks": minor
---

Add `useFocusReturn(isOpen, options?)` — the companion to `useFocusTrap`. It captures the focused element (the trigger) when `isOpen()` flips true and restores focus to it when `isOpen()` flips false, so keyboard and screen-reader users return to where they were when an overlay closes instead of the top of the page. Pass `options.returnTo` to override the restore target (useful when the trigger may have unmounted). SSR-safe (no-op on the server) and self-cleaning.
