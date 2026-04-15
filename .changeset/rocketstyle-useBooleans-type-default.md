---
'@pyreon/rocketstyle': patch
---

Align `useBooleans` type default with runtime default (`false`). Previously the type default was `true` while the runtime default was `false`, so boolean dimension props like `<Heading level3 />` typechecked but were silently dropped at runtime — components rendered with only their base `.theme()` styles, missing all `.sizes()` / `.variants()` / `.states()` overrides. Consumers that relied on boolean shorthand must either pass `useBooleans: true` explicitly or switch to the object form (`size="level3"`, `state="primary"`, `variant="secondary"`).
