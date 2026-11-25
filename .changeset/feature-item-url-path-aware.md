---
'@pyreon/feature': patch
---

`useById` / `useUpdate` / `useDelete` add the id at the end of the `api` URL's PATH, before any query string or fragment it carries (`/api/users?tenant=t1` → `/api/users/7?tenant=t1`). The id used to be appended after the whole string (`/api/users?tenant=t1/:id`), so it landed in the query and the request went to the list URL. The native lowering builds the same URL, and its refusal of a `:param` in `api` now reads only the URL's path, so a port, `user:password@` or a colon in the query no longer refuses the native hooks.
