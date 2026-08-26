---
'@pyreon/kinetic': minor
---

`show` now accepts the two shapes that used to crash it

A kinetic transition read visibility by calling `show()`, so anything that was
not a function died with `TypeError: show is not a function` — an error naming a
prop the author may never have written, from inside a component they did not
write either.

Two shapes hit it, and both are ones a consumer reaches for naturally:

- **Absent.** `<FadeIn>content</FadeIn>` — a preset used for a plain entrance,
  which is what presets exist for. `show` was optional in the runtime but
  required in the types, and the runtime cast the `undefined` through anyway.
- **A plain boolean.** `show={isOpen}` where `isOpen` is a signal: the compiler
  auto-calls a known signal in attribute position, so the accessor the author
  typed arrives already resolved.

Both now normalize at every entry point (`kinetic()`, `<Transition>`,
`<Collapse>`, `<Stagger>`, `useTransitionState`). Absent means unconditionally
shown — an element with no `show` is not conditional, and whether it *animates*
on mount stays `appear`'s job. This is the same rule `<Show when>` and
`<Match when>` already follow: an API that takes an accessor has to take the
value too, because the compiler can hand it either.

Found by running the shared multi-target source in a real browser. `<FadeIn>`
with no `show` is the shape the preset docs show, and nothing in the suite had
ever mounted it.
