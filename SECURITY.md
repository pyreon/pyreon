# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.x (current) | Yes |

## Reporting a Vulnerability

If you discover a security vulnerability in Pyreon, please report it responsibly.

**Do not open a public issue.** Instead:

1. Email **vit@bokisch.cz** with a description of the vulnerability.
2. Include steps to reproduce, if possible.
3. We will acknowledge receipt within 48 hours and work on a fix.

## Scope

Security issues we care about:

- **XSS** in SSR output (HTML injection via props, attributes, or children)
- **Open redirect** via the router
- **Path traversal** in SSG/prerender
- **Prototype pollution** in reactive stores or props merging
- **Code injection** via the compiler or Vite plugin

## Past Security Fixes

- SSR: HTML escaping for script/style/noscript content to prevent closing-tag injection
- SSR: Blocking `javascript:`, `data:`, `vbscript:` URIs in URL-bearing attributes
- Router: `sanitizePath()` blocks protocol-relative and absolute URL redirects
- SSG: Path traversal validation ensures output stays within `outDir`
- Vue-compat: `readonly()` strictly blocks all property mutations
- Reconciler: Circular reference detection via `WeakSet`
