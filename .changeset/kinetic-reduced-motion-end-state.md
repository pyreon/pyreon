---
'@pyreon/kinetic': patch
---

Under `prefers-reduced-motion: reduce`, an initially-hidden transition (the scroll-reveal pattern) now becomes visible when `show` flips true. The reduced-motion branch skipped the animation and its end state too, leaving the SSR hidden style (`opacity: 0`) in place forever. Enter now lands on `enterTo` / `enterToStyle` with the hidden-state classes removed, and leave on `leaveTo` / `leaveToStyle`, in `kinetic(tag)`, `.stagger()`, `.group()`, `<Transition>`, `<Stagger>` and `<TransitionGroup>`. A collapse reopened under reduced motion no longer stays at `height: 0px`.
