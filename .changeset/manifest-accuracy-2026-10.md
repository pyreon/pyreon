---
'@pyreon/validation': patch
'@pyreon/http': patch
'@pyreon/feature': patch
---

Documentation only, corrected from the docs accuracy audit. These texts feed `llms.txt`, the MCP reference and the generated docs:

- `@pyreon/validation`: the native-tier note spelled the ArkType adapter `arkTypeSchema`; the export is `arktypeSchema`.
- `@pyreon/http`: the native note said `useQuery` over an endpoint lowers with literal params only. A runtime path param now lowers too, encoded at request time and keying the cache; only `useFetch` needs literal params.
- `@pyreon/feature`: the `schema` doc comment said a runtime schema must have `safeParseAsync`. Any Standard Schema validator (Zod, Valibot, ArkType) is detected through `~standard`.
