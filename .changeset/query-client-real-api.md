---
'@pyreon/native-compiler': patch
---

The query-client recognizer keyed on a function `@pyreon/query` does not export

`#3058` made `<QueryClientProvider>` transparent on native and taught the
compiler to drop the client binding. The binding it recognized was
`createQueryClient()` — a name I made up. `@pyreon/query` re-exports the
query-core class, so the real API is `new QueryClient()`.

The recognizer pattern-matches call names and never resolves the import, so it
cannot tell a real export from an invented one, and the test passed. A real app
writing the documented `new QueryClient()` still got a junk `let client = ""`
binding beside the transparent provider.

Fixed to match the exported API, plus a spec that asserts the name against
`@pyreon/query`'s own export list — the one check that can tell the difference.
