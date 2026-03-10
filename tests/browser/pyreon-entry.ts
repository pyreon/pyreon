/**
 * Browser entry point — re-exports Pyreon APIs and assigns them to window.__PYREON__
 * so Playwright tests can use them via page.evaluate().
 */

import { Fragment, Show, createContext, h, onMount, onUnmount, useContext } from "@pyreon/core"
import { batch, computed, effect, nextTick, signal } from "@pyreon/reactivity"
import {
  RouterLink,
  RouterProvider,
  RouterView,
  createRouter,
  useRoute,
  useRouter,
} from "@pyreon/router"
import { hydrateRoot, mount } from "@pyreon/runtime-dom"

const Pyreon = {
  // Reactivity
  signal,
  computed,
  effect,
  batch,
  nextTick,
  // Core
  h,
  Fragment,
  createContext,
  useContext,
  onMount,
  onUnmount,
  Show,
  // Runtime DOM
  mount,
  hydrateRoot,
  // Router
  createRouter,
  RouterProvider,
  RouterView,
  RouterLink,
  useRouter,
  useRoute,
}
;(window as any).__PYREON__ = Pyreon
