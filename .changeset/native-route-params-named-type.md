---
'@pyreon/native-compiler': patch
---

Native: a route component's `params` prop typed with a NAMED struct is constructed from the matched path. `function UserPage(props: { params: UserParams })` was treated as opaque, and both dispatchers passed the raw string dictionary where a `UserParams` was expected (`UserPage(params: params)`), which does not build — only an inline `{ id: string }` type was constructed. Kotlin also mis-named an inline params shape identical to a declared struct: the prop was typed `UserParams` but the dispatcher constructed a synthesized `InlinePageParam(…)`. Both now construct the type the prop actually has.
