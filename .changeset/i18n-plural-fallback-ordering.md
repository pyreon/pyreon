---
"@pyreon/i18n": patch
---

fix(i18n): an active-locale plural form beats a fallback-only more-specific form

Key resolution tried `currentLocale` then `fallbackLocale` PER candidate, so a more-specific form present only in the fallback locale (e.g. `items_zero` in `en`) beat a less-specific form present in the ACTIVE locale (e.g. `items_other` in `de`) — a German user could see the English "No items" at count 0 instead of German "0 Elemente". Resolution now exhausts ALL candidates in the active locale before consulting the fallback (i18next's order). A key entirely missing from the active locale still falls back. Bisect-verified.
