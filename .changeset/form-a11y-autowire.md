---
'@pyreon/form': minor
'@pyreon/core': patch
---

feat(form): auto-wire field accessibility (zero-config ARIA)

`register(field)` now returns, in addition to value/onInput/onBlur, an
auto-generated stable `id` plus reactive `aria-invalid` (`'true'` while the
field has an error, attribute removed when valid) and `aria-describedby`
(points at the field's error element while errored). New `errorProps(field)`
and `labelProps(field)` helpers (on both `useForm` and `useField`) return
ids that AGREE with the input, so:

```tsx
<label {...form.labelProps('email')}>Email</label>
<input {...form.register('email')} />
{() => form.fields.email.error()
  ? <span {...form.errorProps('email')}>{form.fields.email.error()}</span>
  : null}
```

gives full label↔control and input↔error association + an announced error
(`role="alert"`) with no hand-threaded ids — all derived from existing field
state, reactive in place (0 re-renders). This makes the most common form a11y
mistake the zero-effort path, and resolves the label↔control association an
AST lint rule structurally can't (the deferred `control-needs-label` cliff) at
the runtime layer where the ids are knowable.

`@pyreon/core` (patch): the JSX `aria-invalid` and `aria-describedby`
attributes now also accept the reactive accessor form (`() => …`), matching
`aria-required`/`aria-readonly`. Additive — existing static usage is
unchanged.
