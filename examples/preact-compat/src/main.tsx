import { render } from "@pyreon/preact-compat"
import App from "./App"

const el = document.getElementById("app")
if (el) render(<App />, el)
