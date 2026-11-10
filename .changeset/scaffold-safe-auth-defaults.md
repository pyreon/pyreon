---
'@pyreon/create-zero': patch
---

The `dashboard` template's generated auth is safe by default. Sign-in, sign-up, session lookup and sign-out now go through server endpoints (`/api/signin`, `/api/signup`, `/api/session`, `/api/signout`). The endpoints set the session cookie `HttpOnly; SameSite=Lax`, plus `Secure` everywhere except plain-HTTP localhost, so page JavaScript never holds a session id. The in-memory stub stores salted PBKDF2-SHA256 hashes instead of plain-text passwords and mints 256-bit random session ids instead of `Math.random`. The `demo@example.com` account exists only under `vite dev`. Credential endpoints accept JSON only, which blocks login CSRF, and sign-out is a POST.
