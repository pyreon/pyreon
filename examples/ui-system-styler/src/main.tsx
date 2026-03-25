import { mount } from "@pyreon/runtime-dom"
import { App } from "./App"

const container = document.getElementById("app")
if (!container) throw new Error("Missing #app element")

mount(<App />, container)
