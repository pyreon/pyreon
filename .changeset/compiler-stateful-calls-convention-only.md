---
"@pyreon/compiler": patch
---

The "stateful initializer" call list shrinks from 15 library names to the 5 the `useX` / `createX` naming convention cannot reach (`signal`, `computed`, `effect`, `batch`, `defineStore`), in both the JS and Rust backends. `useForm`, `useQuery`, `useMutation`, `useStore`, `useContext`, `useRef`, `createRef`, `createContext`, `createReactiveContext` and `createSelector` were redundant with the convention and compile identically; a new matrix test pins each of them (both backends) so narrowing the convention fails by name.
