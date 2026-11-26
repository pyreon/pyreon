---
'@pyreon/toast': minor
---

`<Toaster>` works under a strict Content Security Policy and its accessible names can be translated.

- `nonce` sets a CSP nonce on the injected `<style data-pyreon-toast>`, and `injectStyles={false}` skips the injection. The same rules ship as `@pyreon/toast/styles.css` to import instead, which `style-src 'self'` allows.
- `label` (the region, default "Notifications") and `dismissLabel` (every dismiss button, default "Dismiss") take a string or an accessor that follows a locale signal. A toast's own `dismissLabel` option overrides the Toaster's for that toast.
- On iOS/Android, `<Toaster label>` / `<Toaster dismissLabel>` and the `dismissLabel` toast option have no lowering yet; the native plugin now warns about each by name instead of dropping it silently.
