---
'@pyreon/react-compat': patch
---

Exports React 19.x's `useEffectEvent` (a stable function calling the latest callback), `<Activity mode>` (hidden children stay mounted but are not displayed), `<ViewTransition>` (renders its children, without the animation) and `cache` (returns the function unchanged, as React does outside Server Components). `import { useEffectEvent } from 'react'` under `compat: 'react'` used to fail at import.
