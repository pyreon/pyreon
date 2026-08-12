---
'@pyreon/runtime-server': patch
---

`<textarea value>` SSR emits the value as text content, not a dead attribute

`<textarea>` has no `value` CONTENT attribute — the value *is* the element's
text content — so `<textarea value="hello"></textarea>` is ignored by the HTML
parser and renders **blank**. Any server-rendered prefilled textarea (a bio, a
comment draft, a description) came back empty, filled in only after hydration,
and stayed empty with JS off.

It was also an SSR/client divergence, since the client was already correct:
`applyProps` sets the `.value` PROPERTY rather than an attribute.

This is the sibling of the `<select value>` class (PZ-09) and was missed when
that landed — the same "a control whose value is not an attribute" shape, in the
only other element that has it. Both the string and stream paths are fixed;
they are separate code paths and a fix to one is not a fix to the other.

Value wins over children, because that is what the client does: a `.value`
property set after children mount overrides the text content. `<input value>`
is untouched — it has a real value attribute.
