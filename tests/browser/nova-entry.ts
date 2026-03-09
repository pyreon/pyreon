/**
 * Browser entry point — re-exports Nova APIs and assigns them to window.__NOVA__
 * so Playwright tests can use them via page.evaluate().
 */

import { signal, computed, effect, batch, nextTick } from "@pyreon/reactivity"
import { h, Fragment, createContext, useContext, onMount, onUnmount, Show } from "@pyreon/core"
import { mount, hydrateRoot } from "@pyreon/runtime-dom"
import { createRouter, RouterProvider, RouterView, RouterLink, useRouter, useRoute } from "@pyreon/router"

const Nova = {
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

;(window as any).__NOVA__ = Nova
