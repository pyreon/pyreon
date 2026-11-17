---
"@pyreon/zero": minor
---

Security: `vercelRevalidateHandler` reads the revalidation secret only from the `Authorization: Bearer` header. A `?secret=` query parameter is now rejected with 400, even when it is correct, because a secret in the URL ends up in access and proxy logs. `vercelAdapter().revalidate()` already sent the header, so only hand-configured webhooks are affected.

Upgrade: manual — configure the webhook caller (CMS, cron, script) to send `Authorization: Bearer <secret>` instead of `?secret=<secret>` in the URL, then rotate the secret because it has been logged.
