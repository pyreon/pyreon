import "./style.css"
import { mount } from "@pyreon/runtime-dom"
import { h, Fragment, Show } from "@pyreon/core"
import { signal, computed, effect, batch } from "@pyreon/reactivity"
import { App } from "./App"

// Expose Pyreon modules on window for e2e tests
;(window as any).__pyreon = { h, Fragment, Show, mount, signal, computed, effect, batch }

const container = document.getElementById("app")
if (!container) throw new Error("Missing #app element")

mount(h(App, null), container)
