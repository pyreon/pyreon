---
"@pyreon/code": patch
---

Raise the transitive `dompurify` floor to 3.4.17 for `monaco-editor` (a critical template-expression bypass and a high-severity hook issue in 3.4.16 and earlier). Also pins `body-parser`, `fast-uri` and `ip-address` to patched versions for the MCP server's dependency chain. Dependency pins only, no source change.
