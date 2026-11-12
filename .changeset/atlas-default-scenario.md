---
'@pyreon/atlas': patch
---

The derived `Default` scenario now renders the component's own default instead of each union's first member. An axis the component defaults in its body (`props.size ?? 'md'`) uses that value; an optional axis with no readable default is left unset; only a required axis is pinned to its first value. `VariantAxis` gains optional `default` and `optional` fields.
