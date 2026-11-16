---
'@pyreon/feature': minor
'@pyreon/query': minor
---

`@pyreon/feature`'s CRUD hooks now compile to iOS and Android.

With an absolute `api` URL (`api: 'https://api.example.com/todos'`), `useList()`, `useById(id)`, `useCreate()`, `useUpdate()` and `useDelete()` lower onto `@pyreon/query`'s native query and mutation containers. They send the same requests as the web: GET `api`, GET / PUT / DELETE `api/<id>` with the id path-encoded, and a JSON body for create and update. A non-2xx answer rejects. Records decode into the schema struct `defineFeature` already declares; its Kotlin data class is now `@Serializable` for that reason.

The compiler warns by name, instead of emitting a call neither platform has, for: a relative, computed or missing `api` and a custom `fetcher` (a native app has no origin to resolve a relative URL against); `useSearch`, `useForm`, `useTable` and `useStore`; every `useList` option except a literal `staleTime`; `useUpdate` variables that are not a literal `{ id, data }`; and a destructured mutation. Each mutation also warns that the web's query invalidation does not happen natively: a successful create, update or delete does not refetch the queries that are already mounted.

`@pyreon/query/native-plugin` exports the containers and call-site emit those hooks reuse (`queryContainerDecl`, `mutationDecl`, `mutateCallSpec`, …), so a package whose hook is a query or a mutation can drive them with a request it builds itself.
