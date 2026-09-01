---
'@pyreon/router': patch
---

`<RouterLink>` composes the consumer's `onClick` / `onMouseEnter` / `onFocus` instead of overwriting them

`onClick: handleClick` was spread AFTER `...rest` in the internal `h('a', …)` call, so any handler the consumer passed was silently dropped — the same defect `class` had already been fixed for ("overriding the user's class silently dropped any conditional class"). Fixing one prop and leaving the events is folklore rather than a fix, so the class stayed open.

The shipped instance is the docs search overlay, which closes itself in `onClick`: on pyreon.dev a search result navigated correctly and left the modal dialog covering the destination page. Its unit test passed throughout, because it mocks `RouterLink` with a stub that does call `onClick` — a mock that is more correct than the component.

The user's handler runs FIRST, so `e.preventDefault()` in it suppresses navigation: `handleClick` already bails on `defaultPrevented`, which is what makes user-first the composable order rather than a race.
