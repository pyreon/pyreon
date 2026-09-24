---
'@pyreon/zero': patch
---

Point `x-default` hreflang at the default locale's real URL

Under `strategy: 'prefix'` every route is served under a locale segment —
`expandRoutesForLocales` emits no unprefixed form at all — but `<Meta>` still
generated `x-default` from the bare path. `x-default` is precisely the URL a
crawler serves to a visitor whose language matches no alternate, so it was
pointing at a page the build never produced.

It is now derived from the default locale's own alternate, so the two can no
longer disagree. `prefix-except-default` is unaffected: the default locale IS
served unprefixed there, and the emitted value is unchanged.
