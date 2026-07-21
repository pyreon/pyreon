---
'@pyreon/zero': minor
'@pyreon/compiler': patch
---

SSG hybrid `renderMode: 'spa'` routes now work on direct URL out of the box, and
`pyreon doctor --check-ssg` no longer false-positives on them.

**@pyreon/zero** — a DYNAMIC `'spa'`-declared route in a `mode: 'ssg'` app
(`item/[id]` fetching client-side data by an arbitrary id) can't be enumerated
to a concrete `dist/` file, so a direct load of `/item/123` used to 404 on a
static host. The SSG build now emits `dist/404.html` = the blank CSR shell when
such a route exists (and no `_404.tsx` already wrote one). Every major static
host — GitHub Pages, S3, Netlify, Cloudflare Pages, Firebase — serves 404.html
for an unmatched path, so the shell boots, the client router matches the URL,
and the route renders. (Platform adapters already emit `_redirects /* → 200`
for a 200 status; this covers the generic hosts that don't get one.)

**@pyreon/compiler** — the `dynamic-route-missing-get-static-paths` audit now
respects a per-route `renderMode` opt-out: a route declaring
`renderMode = 'spa' | 'ssr' | 'isr'` is exempt from the `getStaticPaths`
requirement (it has explicitly opted out of SSG prerendering — exactly the fix
the warning recommends). Previously the audit ignored `renderMode` and
false-positived on the correctly-configured hybrid route it just told you to
write.
