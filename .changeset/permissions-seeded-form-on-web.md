---
'@pyreon/permissions': minor
---

`usePermissions(['posts.edit'])` works on the web, so a permission-gated screen can be written once

The seeded form is what `@pyreon/native-compiler` lowers to — it becomes a
`PyreonPermissions` seeded with the same literal keys, and the compiler's own
diagnostics point authors at it. On the web that identical call threw
`usePermissions() must be used within <PermissionsProvider>`, so a screen using
it ran on iOS and Android and died in a browser.

A seeded call is self-contained by definition: it says what it grants, so there
is nothing for a provider to contribute. It now builds a local instance and
needs no provider. The bare `usePermissions()` contract is unchanged — it still
reads the nearest provider and still throws without one, and the message now
names the seeded form as the other way out.

Found by rendering a shared multi-target source in a real browser.
