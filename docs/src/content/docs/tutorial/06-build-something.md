---
title: "6. Build something real"
description: "Tutorial chapter 6 — you know the whole model. Put it together by building a real todo app, then branch into the guides for routing, data, forms, and more."
---

# 6. Build something real

You now know the entire Pyreon model:

- **`signal`** — reactive state ([ch. 1](/docs/tutorial/01-signals))
- **`computed`** — derived, cached values ([ch. 2](/docs/tutorial/02-derived))
- **`effect`** — side effects on change ([ch. 3](/docs/tutorial/03-effects))
- **components run once** — reactivity lives where you read ([ch. 4](/docs/tutorial/04-components))
- **`<For>` / `<Show>`** — reactive lists & conditionals ([ch. 5](/docs/tutorial/05-lists-and-conditionals))

That's the foundation everything else builds on. There's no class component, no re-render cycle, no dependency arrays, no `useMemo` — just signals and where you read them.

## Put it together

The **[Build an App tutorial](/docs/build-an-app)** walks you from an empty file to a complete, filterable todo app in six live steps — adding items, toggling completion, derived counts, and a filtered view. Every step is a runnable `<Example>` you can interact with inline.

## Then go deeper

Pick the concern you need next — each guide is task-oriented with runnable examples:

- **[Data Fetching & Caching](/docs/guides/data-fetching)** — server data with `@pyreon/query`
- **[Client-Side Routing](/docs/guides/routing)** — pages, params, loaders, guards
- **[Forms & Validation](/docs/guides/forms)** — reactive fields, schema validation
- **[Global State Management](/docs/guides/state-management)** — stores & structured models
- **[Styling & Theming](/docs/guides/styling-theming)** — CSS-in-JS, rocketstyle, dark mode
- **[SSR, SSG & ISR](/docs/guides/ssr-ssg-isr)** — rendering modes with `@pyreon/zero`

Or browse the **[Examples gallery](/docs/examples)** (42 runnable demos) and the **[Recipes](/docs/recipes)** (copy-paste solutions).

Coming from another framework? The **[migration guides](/docs/migrating-from-react)** map your existing mental model onto Pyreon's.

---

**[← Lists & conditionals](/docs/tutorial/05-lists-and-conditionals)** · **[Build an App →](/docs/build-an-app)**
