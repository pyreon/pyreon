# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added

- **@pyreon/reactivity** — Signal-based fine-grained reactivity: `signal`, `computed`, `effect`, `batch`, `createSelector`, `createStore`, `createResource`
- **@pyreon/core** — Component model with `h()`, JSX runtime, `Fragment`, `For`, `Show`, `Portal`, `Suspense`, `ErrorBoundary`, `lazy`, context, lifecycle hooks
- **@pyreon/runtime-dom** — DOM renderer: `mount`, `hydrateRoot`, `Transition`, `TransitionGroup`, `KeepAlive`, configurable HTML sanitization
- **@pyreon/runtime-server** — SSR primitives: `renderToString`, `renderToStream` with Suspense streaming
- **@pyreon/compiler** — JSX transform with `shouldWrap` optimization and static node hoisting
- **@pyreon/router** — Client-side router: hash/history modes, nested routes, navigation guards, data loaders, link prefetching, scroll restoration, typed params
- **@pyreon/head** — Document head management: `useHead`, `HeadProvider`, `renderWithHead` for SSR
- **@pyreon/server** — SSR framework: `createHandler`, `prerender` (SSG), `island()` architecture with load/idle/visible/media/never hydration strategies
- **@pyreon/vite-plugin** — Vite integration: JSX transform, `.pyreon` file support, HMR with signal state preservation
- **@pyreon/react-compat** — React API shims: `useState`, `useEffect`, `useMemo`, `useRef`, `useCallback`, `lazy`, `Suspense`, `memo`, `createContext`
- **@pyreon/vue-compat** — Vue 3 Composition API shims
- **@pyreon/solid-compat** — SolidJS API shims
- **@pyreon/preact-compat** — Preact API shims
