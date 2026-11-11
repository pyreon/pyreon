---
'@pyreon/compiler': minor
'@pyreon/lint': minor
'@pyreon/primitives': patch
'@pyreon/mcp': patch
'@pyreon/cli': patch
'@pyreon/create-zero': patch
---

A keyed `<For>` row that reads a field of an item replaced under the same key is now caught before it ships.

On the web, `<For each={todos} by={(t) => t.id}>` runs a row once per key. An update such as `todos.set(todos().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))` keeps the key, so the row is kept and `{t.done ? …}`, `class={t.done ? …}` or `<Row todo={t} />` with `props.todo.done` keep showing the first value. iOS and Android redraw the row, so the same source was right on two targets and stale on the web.

- `detectPyreonPatterns` has a new code, `for-stale-item-field`, so `pyreon check`, the MCP `validate` tool and the Reactivity Lens report it. It fires only when the file also replaces items under their key and the read field is one that update overrides. A `<For>` whose `each` is a call inside a `{() => …}` accessor is rebuilt on every list change, so it is skipped.
- `@pyreon/lint` has the matching rule, `pyreon/no-stale-for-item-field` (error in `recommended`, accepts `exemptPaths`). There are now 134 rules.
- The `diagnoseError` catalog (the MCP `diagnose` tool) recognises the symptom ("my <For> row does not update").
- The fix in each message: read the live value by key through a call (`isDone(t.id)`), which stays reactive on the web and lowers to a plain lookup on native, or give the field its own signal.
- The `@pyreon/primitives` docs example now reads `done` by id.
