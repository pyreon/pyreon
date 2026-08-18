---
'@pyreon/compiler': minor
'@pyreon/core': minor
---

Lazy component children — a component's sole JSX child is now built when the component READS `props.children`, not when the `jsx(Comp, …)` argument is evaluated.

`<Provider><div>{useCtx()}</div></Provider>` lowers to `jsx(Provider, { children: _tpl(html, bind) })`, and `_tpl(…)` is an argument: it ran before `Provider`'s body, so every binding in that child snapshotted the context owner from BEFORE `provide()` and resolved to the default value. Measured on the previous release: the client rendered `DEFAULT`, plain SSR rendered `PROVIDED`, and SSR with `ssrTemplate` (default-on via the vite-plugin) rendered `DEFAULT` — wrong on the client and disagreeing with itself across the flag. The accessor form `{() => useCtx()}` was equally affected, because deferring the read does not move the effect's construction.

Both compiler backends now emit `{_lc(() => _tpl(…))}` (and `{_lc(() => _ssr(…))}`) for a component's sole child. `_lc` is a memoized, untracked thunk branded as a reactive prop, so the existing `makeReactiveProps` step turns it into a property getter — `props.children` still yields the same VALUE it always did, leaving every structural children consumer untouched. A component that never reads its children now builds nothing at all, which also removes an orphaned, undisposable binding those children used to leave behind.

Components with two or more children keep the previous eager behaviour: there `props.children` is an array, and deferring it would change what that array contains.
