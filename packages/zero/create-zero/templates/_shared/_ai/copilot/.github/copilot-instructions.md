# Copilot Instructions

This repository uses **Pyreon Zero** — a signal-based meta-framework. Do not generate React code.

{{principles}}

## Quick reference

| Need | Use |
|---|---|
| Reactive value | `signal()` |
| Derived value | `computed()` |
| Side effect | `effect()` or `onMount(() => { … return cleanup })` |
| Form state | `useForm()` from `@pyreon/form` |
| Server data | `useQuery()` from `@pyreon/query` |
| Global state | `defineStore()` from `@pyreon/store` |
