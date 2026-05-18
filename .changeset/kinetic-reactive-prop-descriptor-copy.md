---
'@pyreon/kinetic': patch
---

fix(kinetic): preserve reactive HTML-attr getters through the kinetic prop pipeline

`createKineticComponent` value-copied user props twice — a `for…in`
`htmlProps[key] = props[key]` split followed by a
`const { children, ...restHtml } = htmlProps` rest-destructure — and all
four renderers re-spread the result via `h(config.tag, { ...htmlProps })`.

Pyreon's reactive-prop contract is that the compiler emits
`<KineticDiv class={sig()}>` as `_rp(() => sig())`, which `mount.ts`'s
`makeReactiveProps` converts into a **getter** on the props object. Every
value-copy hop above read that getter once, at component-setup time,
outside any tracking scope — collapsing it to a static snapshot. The
attribute then froze forever: a signal write produced no DOM update on
any `kinetic(tag)`-wrapped component (transition / collapse / stagger /
group). Same bug class as the swept `@pyreon/rocketstyle` /
`@pyreon/styler` / `@pyreon/ui-core` prop-pipeline fixes; unfixed here
since package inception, shipped today, browser package.

Fix routes every hop through descriptor-preserving primitives from
`@pyreon/core`:

- `createKineticComponent`: `splitProps(props, [...KINETIC_KEYS])` for the
  kinetic/html split, then `splitProps(htmlProps, ['children'])` to carve
  out children — getters survive (`Object.getOwnPropertyDescriptor` +
  `Object.defineProperty`).
- `StaggerRenderer` / `GroupRenderer`: pass `htmlProps` **by reference**
  to `h(config.tag, …)` instead of `{ ...htmlProps }`.
- `CollapseRenderer` / `TransitionRenderer`: `mergeProps(htmlProps, {
  ref, style })` — last-source-wins lets `ref`/the animation-controlled
  `style` override while every other HTML-attr getter stays live.

runtime-dom's `applyProps` already detects a getter descriptor on an
`h()`-created element and wraps the read in a `renderEffect`
(`props.ts:192-195`), so the live getter now drives reactive DOM
patching end-to-end.

Bisect-verified at the real-Chromium browser layer
(`src/__tests__/kinetic.browser.test.tsx`): reverting
`createKineticComponent`'s `splitProps` split back to the `for…in`
value-copy fails the new reactive-attr specs with
`expected 'two' to be 'one'` / `expected 'b' to be 'a'` across
transition + collapse + stagger/group modes; restored → 8/8 pass.
