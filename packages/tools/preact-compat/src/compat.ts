/**
 * @pyreon/preact-compat/compat — the target of `preact/compat` in compat mode.
 *
 * `preact/compat` is Preact's React-shaped API in ONE module: the core
 * (`h`, `render`, `Component`, `createContext`, `createPortal`, …) together
 * with the hooks and `memo` / `forwardRef`. Here that is the main entry plus
 * `./hooks`, so code written against `preact/compat` (and React code aliased
 * to it) finds every name in one place.
 */
export * from './index'
export {
  forwardRef,
  memo,
  useCallback,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useErrorBoundary,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from './hooks'
