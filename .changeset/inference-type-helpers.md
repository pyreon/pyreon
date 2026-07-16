---
'@pyreon/reactivity': minor
'@pyreon/store': minor
'@pyreon/form': minor
'@pyreon/router': minor
'@pyreon/i18n': minor
'@pyreon/machine': minor
'@pyreon/query': minor
---

Inference type helpers across the libraries — "derive, don't annotate twice". All type-only (`export type`, zero runtime bytes):

- `@pyreon/reactivity`: `SignalValue<S>` / `ComputedValue<C>` (unwrap a signal/computed/accessor to its value type), `MaybeAccessor<T>` (the framework-wide value-or-accessor parameter shape — NOT auto-called, resolve inside a reactive scope), `AccessorReturn<A>` (resolve a MaybeAccessor back to its value type).
- `@pyreon/store`: `StoreState<Api>` (unwrapped per-field value shape — schema stores give the schema-inferred `TRaw`; composition stores give the signal fields unwrapped, computeds/actions excluded, mirroring the runtime `api.state` snapshot), `StoreActions<Api>` (the plain-function action surface).
- `@pyreon/form`: `FormValues<F>` (TValues from the `useForm` return OR its options), `FieldNames<F>`, `FieldValue<F, K>`, and the standalone opt-in `NestValues<T>` (flat dot-path shape → nested payload shape — the type companion of runtime `nestValues()`; deliberately NOT threaded through `useForm`'s signature, whose value model stays flat).
- `@pyreon/router`: `LoaderData<L>` — a loader's resolved data type from the loader function itself, for `useLoaderData<LoaderData<typeof loader>>()`.
- `@pyreon/i18n`: opt-in typed translation keys — `MessageKeys<M>` (dot-path key union, plural suffixes collapsed, recursion depth-capped at 6 levels), `TranslationParams<M, K>` (`{{param}}` extraction incl. inline format specs + `count: number` for plural keys; needs `as const`), `TypedTranslationKey<M>`, and a purely additive generic overload `createI18n<typeof en>(options)` returning `I18nInstance<TypedTranslationKey<M>>` whose `t` rejects typos (namespaced `ns:key` strings stay unchecked). `I18nInstance` gained a `TKey extends string = string` parameter (default `string` — untyped usage byte-identical); `t` is now declared method-style so typed instances stay assignable to `I18nInstance` (Provider contract).
- `@pyreon/machine`: `StateOf<M>` / `EventOf<M>` — state/event unions from the machine INSTANCE or a raw config (the pre-existing `InferStates`/`InferEvents` are config-only and silently yield `never` on an instance — README example fixed accordingly).
- `@pyreon/query`: `QueryData<R>` / `QueryError<R>` — unwrap the adapter's fine-grained result bags (`useQuery`/suspense/infinite; infinite results derive `InfiniteData<Page>`); tagged query-KEY inference remains TanStack's own `InferDataFromTag` (not duplicated).
