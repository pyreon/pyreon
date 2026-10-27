---
'@pyreon/native-compiler': patch
---

Swift: a computed whose value is an object literal (or an array of same-shaped ones) is now typed as the struct the emit synthesizes for it, not `Any`. Before, `const stats = computed(() => ({ sum, doubled }))` followed by `stats().sum` failed the iOS typecheck ("value of type 'Any' has no member 'sum'"), with no warning. A computed reading one of its fields (`stats().sum + 1`) is now typed too.
