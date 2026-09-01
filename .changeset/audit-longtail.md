---
'@pyreon/core': patch
'@pyreon/atlas': patch
'@pyreon/code': patch
'@pyreon/zero': patch
'@pyreon/server': patch
---

Close the pre-release audit's long tail: a fail-open URL guard, an inert verification axis, an unnecessary supply-chain surface, and two overstated claims

**`isSafeImageDataUri` failed OPEN on a malformed percent-escape.** The base64 branch returns "unsafe" when `atob` throws; the percent branch caught the `decodeURIComponent` failure, kept the raw still-encoded payload, and scanned that — but the scripted-SVG regex matches `<script` and ` on…=`, neither of which appears in `%3Cscript%3E`. So one trailing `%` took a payload from blocked to allowed. The function's own docstring already promised the base64 branch's behaviour for both, so the two branches disagreeing was the whole defect. Scoped to `src`/`srcset`/`poster` on image/video elements where a scripted SVG does not execute, so this is defence-in-depth — reported because a guard that fails open is worse than one that does not exist: it is relied on.

**`@pyreon/atlas`'s route axis was inert.** `installRouter` had zero callers and `Scenario.route` had zero readers while `routerPlugin` was publicly exported, so a `routerPlugin({ urls })` config produced the expected doubled scenario count with names like `Profile @ /users/999` — and every one passed having mounted with no router installed. Two different URLs rendered byte-identically and both reported `pass`. The router is now installed around the scenario mount through a registration seam (the plugin publishes an installer; the plugin that owns mounting consumes it, so there is still ONE owner of the router's install/dispose), disposed in the same window so it cannot answer for the next scenario, and a route that CANNOT be applied is reported as a finding rather than passing silently.

**`@pyreon/code`'s 15 `@codemirror/lang-*` packages move from `optionalDependencies` to optional peers.** `optionalDependencies` reads as optional and is not: every package manager installs them by default, so every consumer carried their install weight and CVE surface for grammars they never load. Each is reached through a lazy `import()`, which is exactly the shape `@pyreon/document` moved to `peerDependenciesMeta.optional` for the same reason.

**The Vercel revalidate handler compares its secret in constant time.** It was `secret !== expected` under a comment calling it "constant-time-ish"; `!==` short-circuits at the first differing byte regardless of length, which is precisely the leak the phrase claimed to avoid. Length is compared separately because `timingSafeEqual` requires equal-length buffers — that leaks the secret's LENGTH, which is stated rather than hidden.

**`serverIsland` documents that its props are client-controlled.** The fragment endpoint is public and unauthenticated; the island NAME is allowlisted, the props are not, so a fragment renders with attacker-chosen props inside a full request context. That is the intended design, but neither the JSDoc nor the manifest said so — an island that reads a `userId` prop and returns that user's data is an IDOR by construction. Now named as the first entry in the API's `mistakes`, so it reaches `llms.txt` and the MCP reference too.
