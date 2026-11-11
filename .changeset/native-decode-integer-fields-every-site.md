---
'@pyreon/native-compiler': patch
'@pyreon/query': patch
---

Native: every JSON decode names a `number` field that is still an integer, not only a fetch. A `useMutation<T>` reply, a `useInfiniteQuery<Page>` page, a `useStream<T>` event and a typed `JSON.parse` now get the same warning as `useFetch` / `useQuery`. A fractional value such as `1.2` fails to decode into an integer field on iOS and Android, so a mutation's `data` stays empty, a stream drops the event and `JSON.parse` throws, while the web accepts the payload. A mutation's endpoint `{ response: schema }` now types the reply's number fields the way a query's always did: `s.number()` becomes `Double` and `.int()` stays an integer. Before this change an `s.number()` field stayed an integer, and a fractional reply failed to decode even though the schema was declared.
