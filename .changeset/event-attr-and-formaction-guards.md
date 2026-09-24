---
'@pyreon/core': patch
'@pyreon/runtime-server': patch
'@pyreon/runtime-dom': patch
---

fix(core,runtime-server,runtime-dom): two guards keyed on one spelling of a thing with several

**A lowercase `on*` prop became a live inline handler in SSR output.** The
event-prop skip required an UPPERCASE third character, so the lowercase
spelling — the real HTML event-handler content attribute — fell through:

```
h('div', { onclick: 'alert(1)' })            ->  <div onclick="alert(1)">
h('img', { src: 'x', onerror: 'alert(1)' })  ->  <img src="x" onerror="alert(1)">
```

live in the server-rendered HTML, which the browser runs before any framework
code. The reachable vector is a spread of a user-keyed object — verbatim the
threat model `UNSAFE_ATTR_NAME_RE` already documents, and invisible to it
because `onclick` contains no breakout character.

The skip runs BEFORE the `typeof value === 'function'` resolution, so the same
hole meant a lowercase `on*` holding a FUNCTION was CALLED during render: a
typo'd `onclick={handleDelete}` executed `handleDelete` on the server.

Fixed with a NAME SET (`EVENT_HANDLER_ATTRS`, 112 entries) rather than
`/^on[a-z]/`, because the broad regex also eats `once` and `onyx`, which are
ordinary attributes an existing spec asserts must still render.

**`formAction` bypassed the URL guard on every path.** The guard keys on the
JSX PROP name while SSR emits the lowercased ATTRIBUTE name. `formAction` is an
advertised typed prop, so the idiomatic TSX spelling was the unguarded one —
and `formaction` overrides `<form action>`, which is in the set precisely
because `javascript:` executes on submit:

```
<button formAction="javascript:alert(1)">  ->  formaction="javascript:alert(1)"
<button formaction="javascript:alert(1)">  ->  (blocked)
```

`isUrlAttr` now resolves the name before asking, in one place, so no call site
can key on the wrong spelling again.
