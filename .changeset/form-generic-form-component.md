---
'@pyreon/form': patch
---

`<Form of={form}>` now accepts a typed form under `strict`. `Form` was typed as `ComponentFn<FormProps<Record<string, unknown>>>`, and because `FieldState<T>.setValue` is contravariant in `T`, every typed form (`FormState<{ email: string }>`) was rejected in JSX. `Form` is now generic over `TValues`, like `FormProvider`, matching its documented signature.
