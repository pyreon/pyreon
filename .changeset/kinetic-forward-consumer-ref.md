---
'@pyreon/kinetic': patch
---

A `ref` passed to a kinetic component now receives the rendered element. The transition and collapse renderers put their own internal ref last over the consumer's props, so a callback ref or ref object was silently replaced and never called — the documented scroll-reveal pattern (`useIntersection(() => node)`) never saw an element and its content stayed hidden. The consumer's ref is now merged with the internal one in every render path (initially shown, initially hidden, and the `unmount: false` hidden fallback); `<Transition>` and the per-item stagger/group wrapper also forward a ref object on the child, not only a callback ref.
