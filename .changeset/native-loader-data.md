---
'@pyreon/router': minor
'@pyreon/native-router-swift': patch
'@pyreon/native-compiler': patch
---

`useLoaderData<T>()` works on iOS and Android: field reads compile, and the destructured form lowers.

On the web a route's loader runs before its component renders, so `useLoaderData()` always has the data. Natively the loader runs when the route appears, and the compiled read was optional: `data.title` failed to compile on both targets with no warning, and `const { title } = useLoaderData<T>()` was not lowered at all. Now:

- Reads are non-optional, as on the web. The component renders only once its loader data exists: Kotlin returns early until then, and Swift gates the body. `PyreonRouteLoader` on iOS holds the route's component back until the loader has run, so `onMount` sees the data, the web's order.
- `const { title, views: count } = useLoaderData<T>()` lowers to one accessor per field. A field `T` does not declare, a rest element, a nested pattern or a default is reported by name.
- An inline type (`useLoaderData<{ x: string }>()`) names the same struct the route loader's object literal builds, which the runtime's cast needs.

Also fixes a Swift emitter gap the destructure exposed: field lookups on a struct declared in the file (`type X = { … }`) came back empty, unlike Kotlin. That also corrects `@pyreon/table` columns over such a struct on iOS, which stringified number columns, so they sorted as text.
