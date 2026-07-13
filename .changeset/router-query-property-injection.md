---
"@pyreon/router": patch
"@pyreon/zero": patch
---

Security: harden user-controlled-key parsers against property injection (CodeQL `js/remote-property-injection`)

`parseQuery`/`parseQueryMulti` (`@pyreon/router`) write user-controlled query KEYS into the result, and `parseCookies` (`@pyreon/zero` i18n routing) writes client-controlled cookie NAMES — a plain `{}` result let `?__proto__=…` / `Cookie: constructor=…` reach inherited prototype slots. All three now build a **null-prototype** result object (`Object.create(null)`, the `qs`/`query-string` standard), so every user key is a plain own data property: prototype/property injection is structurally impossible, and `?__proto__=x` becomes a retrievable own key rather than a `Object.prototype`-shadowing footgun. Public return types (`Record<string, …>`) are unchanged; consumer access (`q[key]`, `key in q`, `Object.keys`, spread) is unaffected. Regression-locked + bisect-verified in both packages.
