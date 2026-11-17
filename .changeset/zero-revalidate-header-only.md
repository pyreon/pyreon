---
"@pyreon/zero": minor
---

Security: `vercelRevalidateHandler` reads the revalidation secret only from the `Authorization: Bearer` header. A `?secret=` query parameter is now rejected with 400, even when it is correct, because a secret in the URL ends up in access and proxy logs. `vercelAdapter().revalidate()` already sent the header, so only hand-configured webhooks are affected. Such a request is reported once per handler with a server-side `console.error('[Pyreon] vercelRevalidateHandler: …')` that names the fix and never includes the secret, because webhook senders usually discard the response body and content would otherwise stop revalidating with no trace.

Upgrade: manual — configure the webhook caller (CMS, cron, script) to send `Authorization: Bearer <secret>` instead of `?secret=<secret>` in the URL, then rotate the secret because it has been logged. A sender that cannot set headers can POST the secret in the body to a two-line wrapper that moves it into the header (shown in the SSG docs, "`vercelRevalidateHandler` — drop-in webhook").
