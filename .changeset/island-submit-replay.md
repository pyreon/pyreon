---
'@pyreon/server': minor
---

feat(server): `hydrate: 'interaction'` islands now replay form submits — not just clicks

Closes the second click-replay gap my deep analysis flagged. The
`interaction` strategy's pre-hydrate handler previously listened on
`focus` / `click` / `pointerenter` / `touchstart` and only **replayed
`click`** events. Submitting a form inside an interaction-strategy
island fell through:

- `submit` wasn't in the default event list → no preventDefault →
  **browser did a full-page POST/GET BEFORE the island ever hydrated**
- Even with a custom `interaction(submit)` config, the post-hydrate
  replay only knew how to dispatch `MouseEvent('click')`, so the live
  submit handler never fired

Now: `'submit'` is in `DEFAULT_INTERACTION_EVENTS`. When pre-hydrate,
the captured handler calls `preventDefault()` + `stopImmediatePropagation()`
on the submit event (blocking the browser's full-page nav) and stores
a `{ type: 'submit', path }` capture. Post-hydrate, the live form is
resolved via the same `data-testid` / tag+child-index path used for
clicks, and a synthetic `SubmitEvent('submit', { bubbles: true,
cancelable: true })` is re-dispatched on it — so the live `onSubmit`
reads current `FormData` with the user's actual input values.

Discriminated union `CapturedInteraction = { type: 'click'; path } |
{ type: 'submit'; path }` keeps the replay-target wiring type-narrow.
`SubmitEvent` is the standard global in real browsers and modern
happy-dom; falls back to a plain `Event('submit')` if the constructor
isn't available (older runtimes).

Test: `interaction: form submit hydrates + prevents browser nav +
replays submit on live form` in `tests/client.test.ts`. Full server
suite: 143 pass (was 142). Typecheck + lint clean.

**Compat note**: user code that explicitly opts out via `interaction(click)`
or any custom list NOT including `submit` keeps its prior behaviour
(no submit interception). The change is additive on the default-events
list only.
