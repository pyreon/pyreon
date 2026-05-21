---
'@pyreon/elements': patch
---

`<Element content={() => <X />}>` / `beforeContent={() => <X />}` / `afterContent={() => <X />}` are now reactive — function-returning-VNode slot props re-render when signals inside the function body change. Same for the `children` prop in the compound (`beforeContent` / `afterContent` present) layout path.

**The bug**: pre-fix, the JSX child position read the resolved slot value at component-setup time. Function-valued slot props were treated as components (one-shot mount via `h(fn, {})` inside `render()`) instead of as reactive accessors — so the body's signal reads ran exactly once at mount and were never observed afterwards. Symptom: theme toggles, dynamic icons, conditional badges, status indicators built via Element slots silently stopped re-rendering on signal change. The `getChildren` helper in `Element/component.tsx` had a getter shape that LOOKED reactivity-preserving — but the surrounding JSX child position called it synchronously, so the getter never re-fired.

**The fix**: wrap the 5 affected JSX child positions in `{() => resolveSlot(...)}`. The resulting accessor is a valid `VNodeChildAccessor` — the runtime's `mountChild` routes it through `mountReactive`, which re-evaluates on signal change and re-mounts the resolved subtree. The `resolveSlot` helper unwraps function-valued slot values (calls them) so their body's signal reads land inside the enclosing `mountReactive` effect's tracking scope. Static VNode / string / null content paths through `render()` unchanged. Same fix in `Content/component.tsx` (the helper that wraps each slot in the compound layout path) for `beforeContent` / `afterContent` reactivity.

**Bisect-verified-with-restore**: reverting the 5 JSX-position wraps + the Content wrap fails 5 of 7 new browser specs in `Element-slot-reactivity.browser.test.tsx` (the 2 that stay passing are static-content regression guards — correct, those don't depend on the fix). Restored → 23/23 browser + 463/463 elements unit pass.

**Workaround for unfixed versions** stays valid: use `<Show>` inside the slot — `content={<Show when={signal} fallback={<A/>}><B/></Show>}` worked before this fix and continues to work after.

Three pre-existing mock-vnode unit tests in `Element.test.ts` + `Content.test.tsx` updated to invoke the new accessor wrap when extracting children — the asserted contract (children resolves to the right value) is unchanged; the synchronous-vs-lazy shape changed because reactivity is now correct.

Downstream verification: full ui-system test sweep — elements 463, rocketstyle 290, coolgrid 106, kinetic 221, styler 425, unistyle 240, attrs 89 = 1834 unit tests + 23 elements browser tests pass.
