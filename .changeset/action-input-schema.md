---
'@pyreon/zero': minor
---

`defineAction(schema, handler)` validates an action's input with any Standard Schema (zod, valibot, arktype, `@pyreon/validate`) before the handler runs. The handler receives the parsed output, typed; an invalid input returns `fail(422, { error, issues, fields })` without running the handler, so a `<Form>` page can show per-field messages from `useSubmission(action).result()?.fields`. JSON calls validate the body; form posts validate the fields as an object (repeated names become arrays). The one-argument `defineAction(handler)` is unchanged.

Upgrade: none
