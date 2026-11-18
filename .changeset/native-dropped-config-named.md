---
'@pyreon/native-compiler': patch
'@pyreon/query': patch
'@pyreon/form': patch
'@pyreon/machine': patch
'@pyreon/i18n': patch
---

Native configuration that cannot lower is now named instead of silently dropped, and two shapes now lower. `useQuery` options other than `queryKey` / `queryFn` / `staleTime` (`enabled: false` still fetched; `refetchInterval` never polled), `useForm`'s function-reference `onSubmit` (`handleSubmit()` submitted nothing), non-string initial values and unknown options, `createMachine`'s `always` / `entry` / guarded transitions, `createI18n`'s `loader` / `onMissingKey`, and module-scope statements (`count.set(5)` after `signal(0)` — native rendered the seed) all warn by name on both targets. `createMachine` object-form transitions `{ target: 'open' }` and `createI18n` nested message groups (`t('nav.home')`) now lower.
