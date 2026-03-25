import { mount } from "@pyreon/runtime-dom"
import { PyreonUI } from "@pyreon/ui-core"
import { App } from "./App"

const theme = {
  rootSize: 16,
  breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 },
}

const container = document.getElementById("app")
if (!container) throw new Error("Missing #app element")

mount(
  <PyreonUI theme={theme} mode="system">
    <App />
  </PyreonUI>,
  container,
)
