# Security Policy

## Supported versions

Security fixes ship as patch releases of the **latest minor** of the current major. Every `@pyreon/*` package is released at one shared version, so "latest minor" means the newest `x.y` of that version, for all packages together.

| Version | Security fixes |
| --- | --- |
| Latest minor of the current major (from 1.0.0: the newest `1.y`) | Yes |
| 1.0 release candidates (`1.0.0-rc.N`, npm dist-tag `rc`) | The newest release candidate, until 1.0.0 is published |
| 0.55.x, the last `0.x` line (npm dist-tag `latest` until 1.0.0) | Yes, until 1.0.0 is published |
| Older minors and every earlier `0.x` line | No: upgrade with `pyreon upgrade` |

A fix is released on the supported lines above. It is not backported to older minors.

Security fixes are made for the supported platforms. A report that reproduces only on an older platform is still welcome, but it is not fixed there:

| Platform | Supported |
| --- | --- |
| Node.js | Node.js 22 and later |
| Bun | Bun 1.3 and later |
| Browsers | Baseline 2024 (Chrome and Edge 130, Firefox 132, Safari and iOS Safari 18.2, or later) |
| iOS (native targets) | iOS 17 and later |
| Android (native targets) | minSdk 26 (Android 8.0) and later |

The [Stability, Versioning & Direction](https://pyreon.dev/docs/stability-and-direction#support-matrix) page carries the same matrix and explains where each floor is declared.

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request.** Report it privately through GitHub:

1. Open [a private security advisory](https://github.com/pyreon/pyreon/security/advisories/new) (the repository's **Security** tab, **Report a vulnerability**).
2. Describe the vulnerability, the affected package(s) and version(s), and its impact.
3. Include steps to reproduce or a proof of concept, if you can.

The report is visible only to you and the maintainers. If you cannot use GitHub, email **vit@bokisch.cz** instead.

## What to expect

These are targets for a small maintainer team, not contractual guarantees:

- **Acknowledgement** within 48 hours.
- **Initial assessment** (whether it is a vulnerability, its severity, which versions are affected) within 7 days.
- **A fix or a mitigation plan** for a critical or high-severity issue within 30 days of the assessment. Lower-severity issues are fixed in a regular release.
- **Updates** in the advisory thread as the work progresses, including when a target slips and why.

When the fix is released, the advisory is published with the affected and fixed versions, and a CVE is requested through GitHub where one applies. Reporters are credited in the advisory unless they ask not to be. Please keep the details private until the advisory is published.

## Scope

Security issues we care about:

- **XSS** in SSR output (HTML injection via props, attributes, or children)
- **Open redirect** via the router
- **Path traversal** in SSG/prerender
- **Prototype pollution** in reactive stores or props merging
- **Code injection** via the compiler or Vite plugin
- **Authentication and session flaws** in `@pyreon/auth` (login CSRF, OAuth mix-up, token handling)

## Past Security Fixes

- SSR: closing-tag injection neutralised in `<script>`/`<style>` raw text; `<noscript>` content is HTML-escaped
- SSR and client: blocking `javascript:`, `vbscript:` and `data:` URIs (control-character-obfuscated spellings included; raster and script-free SVG `data:image/*` on image sources allowed) in URL-bearing attributes
- Router: `sanitizePath()` blocks protocol-relative and absolute URL redirects
- SSG: Path traversal validation ensures output stays within `outDir`
- Vue-compat: `readonly()` rejects every write: assignment, deletion, `defineProperty`, `setPrototypeOf`, `preventExtensions`
- Reconciler: Circular reference detection via `WeakSet`
