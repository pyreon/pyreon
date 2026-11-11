---
'@pyreon/reactivity': patch
'@pyreon/runtime-dom': patch
---

DOM bindings now show up in the dev reactive graph, so Reactive Coverage, `describeReactiveGraph` and `getUpdateCause` see them.

Before, `renderEffect` registered but never counted a re-run as a fire, `_bind` never registered, and the `direct()` updaters behind compiled `_bindText` / `_bindDirect` were not nodes, not edges and not even counted as subscribers. Coverage reported every DOM binding as absent or "created but never executed", and a signal shown only through compiled text was called an orphan.

Now every live binding is an `effect` node with an edge from each source. Its mount run counts as fire 1 and each re-run as another, so a binding reads `ran-once` until its signal changes and `covered` after. Nodes carry `binding` (`text`, `attr`, `class`, `style`, `prop`, `child`, `list`), `target` (the element's tag) and `key`, and are named like `aria-busy on <div>`. A dead binding (its first run read no signal) is not registered. The coverage report adds `bindings`, and `describeReactiveGraph` adds `summary.bindings` (its `effects` count and `high-fanout` insight no longer include DOM bindings).

Development builds only. Every call is behind the `process.env.NODE_ENV` gate, and production bundles of the instrumented runtime-dom modules do not import the helpers.
