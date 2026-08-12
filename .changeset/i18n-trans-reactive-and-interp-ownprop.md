---
"@pyreon/i18n": patch
---

fix(i18n): `<Trans>` re-renders on locale change; interpolation ignores inherited prototype members

- **`<Trans>` was frozen at first render.** It ran its body once and returned the resolved value, so `i18n.locale.set(...)` never updated it — while every `{() => t(...)}` binding in the app did. `<Trans>` (the documented rich-JSX translation API) now returns an ACCESSOR, so the rendered DOM tracks the active locale. The context read (`useI18n()`) stays at setup (owner frame); only the `t()` resolution moved into the accessor.
- **Interpolation read inherited `Object.prototype` members.** The missing-param guard was `value === undefined`, but `values['toString']`/`['constructor']`/`['__proto__']` are all non-undefined inherited members — so `t('Hi {{toString}}', {...})` rendered the function source instead of leaving `{{toString}}` literal. The guard is now an own-property check (`Object.hasOwn`), consistent with the reserved-key check elsewhere; a real own key that shadows a prototype member still interpolates.

Both bisect-verified (real-DOM mount + `locale.set` for `<Trans>`; `{{toString}}`/`{{constructor}}` literal for interpolation). Full `@pyreon/i18n` suite (227) green.
