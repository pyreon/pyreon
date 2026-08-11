---
'@pyreon/atlas': minor
---

**Store panel — the writes an interaction made, steppable** (Atlas roadmap §9, the last open item on #2517).

`@pyreon/store` publishes a mutation stream: every write announces its store, whether it was a `patch` or a direct set, and the per-key old/new values. Storybook has no equivalent, because React state changes are private to the component that owns them — there is nothing to subscribe to.

Press Record, interact with the preview, then step back through the writes. Stepping back shows the store **as it was**, not a recomputation. The panel also flags keys written more than once in a single interaction — a loop or a chain of dependent writes, worth seeing and not automatically wrong.

Recording is explicit rather than always-on, matching the Perf panel: `addStorePlugin` attaches to every store created afterwards, so a session-long subscription would pay for every write whether anyone is looking or not.

`@pyreon/store` is an **optional** peer — a project that uses no stores sees a panel that says so, not an error.
