---
layout: home

hero:
  name: Pyreon
  text: Reactivity that knows exactly where to fire.
  tagline: Fine-grained signal tracking — no virtual DOM, no diffing, no wasted work. When a signal changes, only the nodes that read it run again. Competitive with Solid, honest about trade-offs.
  actions:
    - theme: brand
      text: Get started →
      link: /docs/getting-started
    - theme: alt
      text: npx create pyreon
      link: /docs/

features:
  - icon: ~>
    title: Signal-Based Reactivity
    details: Fine-grained signals with automatic dependency tracking. No virtual DOM — updates go directly to the DOM nodes that changed.
  - icon: <>
    title: Use Any API You Know
    details: Compatibility layers for React, Preact, Vue 3, and SolidJS. Migrate gradually or pick the API style you prefer.
  - icon: '{}'
    title: Type-Safe Throughout
    details: Generic inference, strict prop validation, typed routes, and typed stores. TypeScript is a first-class citizen.
  - icon: '>>'
    title: Streaming SSR
    details: Server-side rendering with streaming Suspense, async components, and automatic store isolation per request.
  - icon: //
    title: Compiled for Speed
    details: JSX compiler with static hoisting, reactivity wrapping, and optimal code generation. Zero runtime overhead for static content.
  - icon: '[]'
    title: Batteries Included
    details: Router, forms, i18n, data fetching, state management, virtual scrolling, styling, and animations — all built for signals.
---
