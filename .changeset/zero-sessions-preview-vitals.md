---
"@pyreon/zero": minor
"@pyreon/zero-content": minor
---

Add signed cookie sessions (`@pyreon/zero/session`: `sessionMiddleware`, `getSession`, `useSession`, `requireUser`), preview / draft mode (`@pyreon/zero/preview`: `createPreviewHandler`, `previewMiddleware`, `isPreview`), and `reportWebVitals` (`@pyreon/zero/web-vitals`, plus `sendToBeacon` / `webVitalsEndpoint`).

Any response that reads or writes the session is marked `Cache-Control: private, no-store` and is never ISR-cached, even with a custom `cacheKey`. `createISRHandler` bypasses its cache for preview-mode visitors, and `@pyreon/zero-content`'s `getCollection(name, { request })` includes drafts for a verified preview request.
